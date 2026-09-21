import { verifyShortOverlap } from './short-overlap-verifier.js';

// Provisional, scale-independent criteria for local-feature matches (not whole-screen similarity).
export const DEFAULT_OPTIONS = Object.freeze({
  minOverlapRatio: 0.12,
  minOverlapRows: 8,
  confirmedScore: 0.92,
  reviewScore: 0.75,
  minMargin: 0.025,
  minTexture: 0.01,
});

// Treat zero translation as an identity question, never as a scrolling connection.
export function detectDuplicate(from, to) {
  const a = from.identityAnalysis || from.nativeAnalysis || from.analysis;
  const b = to.identityAnalysis || to.nativeAnalysis || to.analysis;
  if (from.sourceWidth !== to.sourceWidth || from.sourceHeight !== to.sourceHeight
    || a.width !== b.width || a.height !== b.height) return null;
  let error = 0;
  let changed = 0;
  for (let i = 0; i < a.data.length; i++) {
    const delta = Math.abs(a.data[i] - b.data[i]);
    error += delta;
    if (delta > 0.035) changed++;
  }
  error /= a.data.length;
  if (error > 0.004 || changed / a.data.length > 0.015) return null;
  return {
    fromId: from.id, toId: to.id, kind: 'duplicate', offsetY: 0,
    overlapHeight: from.factorRegion?.height || from.sourceHeight,
    score: 1 - error, secondBestScore: null, confidence: 1 - error,
    status: 'review', reason: '同一・ほぼ同一画像の候補です。自動では削除しません。',
  };
}

// Emphasize text/icon/card edges in both axes; flat backgrounds contribute little.
function scoreOffset(a, b, offset, overlap) {
  let luminanceError = 0;
  let weightSum = 0;
  let gradientError = 0;
  let gradientTotal = 0;
  let samples = 0;
  const step = Math.max(1, Math.floor((overlap - 1) / 180));
  for (let y = 1; y < overlap; y += step) {
    for (let x = 1; x < a.width; x++) {
      const ai = (offset + y) * a.width + x;
      const bi = y * b.width + x;
      const ax = a.data[ai] - a.data[ai - 1];
      const bx = b.data[bi] - b.data[bi - 1];
      const ay = a.data[ai] - a.data[ai - a.width];
      const by = b.data[bi] - b.data[bi - b.width];
      const edge = Math.abs(ax) + Math.abs(bx) + Math.abs(ay) + Math.abs(by);
      const weight = 0.02 + edge;
      luminanceError += Math.abs(a.data[ai] - b.data[bi]) * weight;
      weightSum += weight;
      gradientError += Math.abs(ax - bx) + Math.abs(ay - by);
      gradientTotal += edge;
      samples++;
    }
  }
  return {
    score: Math.max(0, 1 - 0.55 * luminanceError / Math.max(1e-6, weightSum)
      - 0.45 * gradientError / Math.max(1e-6, gradientTotal)),
    texture: gradientTotal / Math.max(1, samples * 4),
  };
}

// Refine multiple separate peaks at original vertical pixel positions.
function refineCandidate(candidate, from, to, minimum) {
  if (!from.nativeAnalysis || !to.nativeAnalysis) return candidate;
  const a = from.nativeAnalysis;
  const b = to.nativeAnalysis;
  const center = Math.round(candidate.offset / from.analysis.scaleY);
  const radius = Math.ceil(1 / from.analysis.scaleY);
  let best = null;
  for (let offset = Math.max(1, center - radius); offset <= Math.min(a.height - minimum, center + radius); offset++) {
    const overlap = a.height - offset;
    if (overlap > b.height) continue;
    const result = { offset, overlap, ...scoreOffset(a, b, offset, overlap), native: true };
    if (!best || result.score > best.score) best = result;
  }
  return best;
}

// Search strictly positive translations for scrolls after the independent duplicate check.
export function detectOverlap(from, to, options = {}) {
  const duplicate = detectDuplicate(from, to);
  if (duplicate) return duplicate;
  const config = { ...DEFAULT_OPTIONS, ...options };
  const base = {
    fromId: from.id, toId: to.id, kind: 'scroll', overlapHeight: 0, offsetY: null,
    score: 0, secondBestScore: null, confidence: 0, status: 'unresolved',
  };
  const a = from.analysis;
  const b = to.analysis;
  if (a.width !== b.width || Math.abs(a.scaleY - b.scaleY) > 0.0001 || from.sourceWidth !== to.sourceWidth) {
    return { ...base, reason: '画像幅・解析倍率が異なるため自動接続しません。' };
  }
  const minimum = Math.max(config.minOverlapRows, Math.ceil(Math.min(a.height, b.height) * config.minOverlapRatio));
  const candidates = [];
  for (let offset = 1; offset <= a.height - minimum; offset++) {
    const overlap = a.height - offset;
    if (overlap <= b.height) candidates.push({ offset, overlap, ...scoreOffset(a, b, offset, overlap) });
  }
  candidates.sort((left, right) => right.score - left.score || right.overlap - left.overlap);
  const peaks = [];
  for (const candidate of candidates) {
    if (peaks.every((peak) => Math.abs(peak.offset - candidate.offset) > 1)) peaks.push(candidate);
    if (peaks.length === 12) break;
  }
  const nativeMinimum = Math.ceil(minimum / a.scaleY);
  const refined = peaks.map((candidate) => refineCandidate(candidate, from, to, nativeMinimum)).filter(Boolean)
    .sort((left, right) => right.score - left.score || right.overlap - left.overlap);
  const best = refined[0];
  if (!best) return { ...base, reason: '比較できる重複領域が不足しています。' };
  const scale = best.native ? 1 : a.scaleY;
  const separation = Math.max(2 / scale, (from.factorRegion?.height || from.sourceHeight) * 0.015);
  const second = refined.find((candidate) => Math.abs(candidate.offset - best.offset) > separation * scale);
  const margin = second ? best.score - second.score : 0;
  const offsetY = Math.round(best.offset / scale);
  const overlapHeight = Math.round(best.overlap / scale);
  const contentHeight = to.factorRegion?.height || to.sourceHeight;
  const extending = offsetY > 0 && overlapHeight < contentHeight;
  const confident = best.score >= config.confirmedScore && margin >= config.minMargin
    && best.texture >= config.minTexture && extending;
  const result = {
    ...base, overlapHeight, offsetY, score: best.score, secondBestScore: second?.score ?? null,
    confidence: Math.max(0, Math.min(1, best.score, margin / (config.minMargin * 2), best.texture / (config.minTexture * 2))),
    status: confident ? 'confirmed' : best.score >= config.reviewScore ? 'review' : 'unresolved',
    reason: confident ? 'スクロール領域の局所特徴と候補差が基準を満たしました。' : '候補が曖昧です。自動では重複を除去しません。',
    margin, texture: best.texture,
    candidates: [best, ...(second ? [second] : [])].map((candidate) => ({
      offsetY: Math.round(candidate.offset / (candidate.native ? 1 : a.scaleY)),
      overlapHeight: Math.round(candidate.overlap / (candidate.native ? 1 : a.scaleY)),
      score: candidate.score,
    })),
  };
  result.firstStageStatus = result.status;
  result.secondStage = verifyShortOverlap(from, to, result, config);
  if (result.secondStage.result === 'passed') {
    result.status = 'confirmed';
    result.reason = '短い重複を左右・上下の局所特徴で再検証しました。';
  }
  return result;
}
