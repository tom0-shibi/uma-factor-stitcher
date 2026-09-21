// Provisional thresholds live together for later real-image calibration.
export const DEFAULT_OPTIONS = Object.freeze({
  minOverlapRatio: 0.15,
  minOverlapRows: 12,
  confirmedScore: 0.965,
  reviewScore: 0.88,
  minMargin: 0.012,
  minTexture: 0.018,
  maxBadRowRatio: 0.12,
});

// Compare luminance and vertical change across the overlap, penalizing bad bands.
function scoreOffset(a, b, offset, overlap) {
  let absoluteError = 0;
  let gradientError = 0;
  let texture = 0;
  let samples = 0;
  let rows = 0;
  let badRows = 0;
  const step = Math.max(1, Math.floor((overlap - 1) / 120));
  for (let y = 1; y < overlap; y += step) {
    let rowError = 0;
    for (let x = 0; x < a.width; x++) {
      const ai = (offset + y) * a.width + x;
      const bi = y * b.width + x;
      const error = Math.abs(a.data[ai] - b.data[bi]);
      const ag = a.data[ai] - a.data[ai - a.width];
      const bg = b.data[bi] - b.data[bi - b.width];
      absoluteError += error;
      rowError += error;
      gradientError += Math.abs(ag - bg);
      texture += Math.min(Math.abs(ag), Math.abs(bg));
      samples++;
    }
    if (rowError / a.width > 0.08) badRows++;
    rows++;
  }
  return {
    score: Math.max(0, 1 - (0.7 * absoluteError + 0.3 * gradientError) / Math.max(1, samples)),
    texture: texture / Math.max(1, samples),
    badRowRatio: badRows / Math.max(1, rows),
  };
}

// Refine around a coarse candidate using original vertical pixel positions.
function refineCandidate(candidate, from, to) {
  if (!from.nativeAnalysis || !to.nativeAnalysis) return candidate;
  const a = from.nativeAnalysis;
  const b = to.nativeAnalysis;
  const center = Math.round(candidate.offset / from.analysis.scaleY);
  const radius = Math.ceil(1 / from.analysis.scaleY);
  let best = null;
  for (let offset = Math.max(0, center - radius); offset <= Math.min(a.height - 2, center + radius); offset++) {
    const overlap = a.height - offset;
    if (overlap > b.height) continue;
    const result = { offset, overlap, ...scoreOffset(a, b, offset, overlap) };
    if (!best || result.score > best.score) best = result;
  }
  return best ? { ...best, native: true } : candidate;
}

// Search every forward vertical offset; keep a distinct runner-up peak.
export function detectOverlap(from, to, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const base = {
    fromId: from.id, toId: to.id, overlapHeight: 0, offsetY: null,
    score: 0, secondBestScore: null, confidence: 0, status: 'unresolved',
  };
  const a = from.analysis;
  const b = to.analysis;
  if (a.width !== b.width || Math.abs(a.scaleY - b.scaleY) > 0.0001 || from.sourceWidth !== to.sourceWidth) {
    return { ...base, reason: '画像幅・解析倍率が異なるため自動接続しません。' };
  }
  const minimum = Math.max(config.minOverlapRows, Math.ceil(Math.min(a.height, b.height) * config.minOverlapRatio));
  const candidates = [];
  for (let offset = 0; offset <= a.height - minimum; offset++) {
    const overlap = a.height - offset;
    // A suffix must fit B's prefix; contained frames remain reviewable, never discarded.
    if (overlap > b.height) continue;
    candidates.push({ offset, overlap, ...scoreOffset(a, b, offset, overlap) });
  }
  candidates.sort((left, right) => right.score - left.score || right.overlap - left.overlap);
  const coarseBest = candidates[0];
  const best = coarseBest && refineCandidate(coarseBest, from, to);
  if (!best) return { ...base, reason: '比較できる重複領域が不足しています。' };
  const separation = Math.max(2, Math.ceil(Math.min(a.height, b.height) * 0.015));
  const coarseSecond = candidates.find((candidate) => Math.abs(candidate.offset - coarseBest.offset) > separation);
  const second = coarseSecond && refineCandidate(coarseSecond, from, to);
  const margin = second ? best.score - second.score : 0;
  const offsetY = Math.round(best.offset / (best.native ? 1 : a.scaleY));
  const overlapHeight = from.sourceHeight - offsetY;
  const extending = offsetY > 0 && overlapHeight < to.sourceHeight;
  const confident = best.score >= config.confirmedScore && margin >= config.minMargin
    && best.texture >= config.minTexture && best.badRowRatio <= config.maxBadRowRatio && extending;
  return {
    ...base,
    overlapHeight,
    offsetY,
    score: best.score,
    secondBestScore: second?.score ?? null,
    confidence: Math.max(0, Math.min(1, best.score, margin / (config.minMargin * 2), best.texture / (config.minTexture * 2))),
    status: confident ? 'confirmed' : best.score >= config.reviewScore ? 'review' : 'unresolved',
    reason: confident ? '類似度・候補差・縦方向の特徴量が暫定基準を満たしました。'
      : !extending ? '同一画像・包含画像、または接続方向の確認が必要です。'
        : '類似度・候補差・特徴量が不十分です。画像全体を残します。',
    margin,
    texture: best.texture,
    badRowRatio: best.badRowRatio,
    candidates: [best, ...(second ? [second] : [])].map((candidate) => ({
      offsetY: Math.round(candidate.offset / (candidate.native ? 1 : a.scaleY)),
      overlapHeight: Math.round(candidate.overlap / (candidate.native ? 1 : a.scaleY)),
      score: candidate.score,
    })),
  };
}
