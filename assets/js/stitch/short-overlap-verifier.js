const CRITERIA = Object.freeze({
  maxOverlapRatio: 0.25,
  minColumnCorrelation: 0.94,
  minPatchCorrelation: 0.9,
  minPeakMargin: 0.06,
  minGradientStd: 0.006,
});

// Normalized correlation of signed X/Y gradients emphasizes edges over flat backgrounds.
function correlatePatch(a, b, offset, xStart, xEnd, yStart, yEnd) {
  let count = 0;
  let sumA = 0;
  let sumB = 0;
  let squareA = 0;
  let squareB = 0;
  let product = 0;
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const ai = (offset + y) * a.width + x;
      const bi = y * b.width + x;
      for (const step of [1, a.width]) {
        const av = a.data[ai] - a.data[ai - step];
        const bv = b.data[bi] - b.data[bi - step];
        sumA += av;
        sumB += bv;
        squareA += av * av;
        squareB += bv * bv;
        product += av * bv;
        count++;
      }
    }
  }
  const varianceA = Math.max(0, squareA - sumA * sumA / Math.max(1, count));
  const varianceB = Math.max(0, squareB - sumB * sumB / Math.max(1, count));
  const denominator = Math.sqrt(varianceA * varianceB);
  return {
    correlation: denominator > 1e-9 ? Math.max(-1, Math.min(1, (product - sumA * sumB / count) / denominator)) : 0,
    gradientStdA: Math.sqrt(varianceA / Math.max(1, count)),
    gradientStdB: Math.sqrt(varianceB / Math.max(1, count)),
    samples: count,
  };
}

// A short near-pass needs independent local agreement; first-stage thresholds stay unchanged.
export function verifyShortOverlap(from, to, candidate, config) {
  const a = from.nativeAnalysis;
  const b = to.nativeAnalysis;
  const minimumHeight = Math.min(a?.height || 0, b?.height || 0);
  const overlapRatio = candidate.overlapHeight / Math.max(1, minimumHeight);
  if (candidate.kind !== 'scroll' || candidate.status !== 'review'
    || candidate.score < config.confirmedScore - 0.04
    || candidate.margin < config.minMargin || candidate.texture < config.minTexture
    || !a || !b || a.width !== b.width || a.width < 8
    || !Number.isInteger(candidate.offsetY) || candidate.offsetY <= 0
    || candidate.overlapHeight !== a.height - candidate.offsetY
    || candidate.overlapHeight > b.height || candidate.overlapHeight < 8
    || overlapRatio > CRITERIA.maxOverlapRatio) {
    return { result: 'not-run', reason: 'not-a-short-high-score-scroll-review' };
  }
  const radius = Math.max(3, Math.ceil(2 / from.analysis.scaleY));
  const tolerance = Math.max(1, Math.round(0.25 / from.analysis.scaleY));
  const exclusion = Math.max(tolerance, Math.ceil(0.5 / from.analysis.scaleY));
  const midpoint = Math.floor(a.width / 2);
  const columns = [];
  const patches = [];
  for (const [side, left, right] of [['left', 1, midpoint], ['right', midpoint, a.width]]) {
    const candidates = [];
    for (let offset = Math.max(1, candidate.offsetY - radius); offset <= Math.min(a.height - 8, candidate.offsetY + radius); offset++) {
      const overlap = a.height - offset;
      if (overlap > b.height) continue;
      candidates.push({ offsetY: offset, ...correlatePatch(a, b, offset, left, right, 1, overlap) });
    }
    candidates.sort((first, second) => second.correlation - first.correlation);
    const peak = candidates[0];
    const alternative = candidates.find((item) => Math.abs(item.offsetY - peak.offsetY) > exclusion);
    const selected = candidates.find((item) => item.offsetY === candidate.offsetY);
    const margin = alternative ? peak.correlation - alternative.correlation : 0;
    columns.push({ side, peakOffsetY: peak.offsetY, selectedCorrelation: selected.correlation,
      peakCorrelation: peak.correlation, secondPeakCorrelation: alternative?.correlation ?? null, peakMargin: margin,
      gradientStdA: selected.gradientStdA, gradientStdB: selected.gradientStdB });
    const middleY = Math.floor(candidate.overlapHeight / 2);
    for (const [part, top, bottom] of [['upper', 1, middleY], ['lower', middleY, candidate.overlapHeight]]) {
      patches.push({ side, part, ...correlatePatch(a, b, candidate.offsetY, left, right, top, bottom) });
    }
  }
  const textured = (patch) => patch.gradientStdA >= CRITERIA.minGradientStd && patch.gradientStdB >= CRITERIA.minGradientStd;
  const consistent = columns.every((column) => Math.abs(column.peakOffsetY - candidate.offsetY) <= tolerance
    && column.selectedCorrelation >= CRITERIA.minColumnCorrelation && column.peakMargin >= CRITERIA.minPeakMargin && textured(column))
    && Math.abs(columns[0].peakOffsetY - columns[1].peakOffsetY) <= tolerance;
  const locallySupported = patches.every((patch) => patch.samples >= 32
    && patch.correlation >= CRITERIA.minPatchCorrelation && textured(patch));
  return {
    method: 'short-overlap-gradient-consensus',
    result: consistent && locallySupported ? 'passed' : 'rejected',
    reason: consistent && locallySupported ? '左右領域・上下局所パッチが同じoffsetを支持しました。' : '局所特徴の一致・位置・候補差が不足しています。',
    verifiedOffsetY: candidate.offsetY,
    overlapRatio, searchRadius: radius, offsetTolerance: tolerance,
    criteria: CRITERIA, columns, patches,
  };
}
