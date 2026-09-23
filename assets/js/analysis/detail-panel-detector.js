const SAMPLE_HEIGHT = 360;
const MIN_PANEL_WIDTH_RATIO = 0.55;
const MAX_PANEL_WIDTH_RATIO = 0.92;
const MIN_EDGE_SEPARATION_RATIO = 0.08;

// Build a horizontal edge profile from the original screenshot without changing source pixels.
function measureVerticalEdges(frame) {
  const width = frame.sourceWidth;
  const height = Math.max(1, Math.min(SAMPLE_HEIGHT, frame.sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(frame.sourceImage, 0, 0, frame.sourceWidth, frame.sourceHeight, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const profile = new Float32Array(Math.max(0, width - 1));
  for (let x = 0; x < width - 1; x++) {
    let total = 0;
    for (let y = 0; y < height; y++) {
      const a = (y * width + x) * 4;
      const b = a + 4;
      const lumA = pixels[a] * 0.2126 + pixels[a + 1] * 0.7152 + pixels[a + 2] * 0.0722;
      const lumB = pixels[b] * 0.2126 + pixels[b + 1] * 0.7152 + pixels[b + 2] * 0.0722;
      total += Math.abs(lumB - lumA) / 255;
    }
    profile[x] = total / height;
  }
  const radius = Math.max(1, Math.round(width * 0.003));
  const smoothed = new Float32Array(profile.length);
  for (let x = 0; x < profile.length; x++) {
    let total = 0;
    let count = 0;
    for (let dx = -radius; dx <= radius; dx++) {
      const xx = x + dx;
      if (xx < 0 || xx >= profile.length) continue;
      total += profile[xx];
      count++;
    }
    smoothed[x] = total / count;
  }
  return smoothed;
}

// Select two persistent long vertical edges. No fixed coordinate or screen-center assumption is used.
export function detectPanelBoundsFromProfiles(profiles, width) {
  if (!profiles.length || width < 10 || profiles.some((profile) => profile.length !== width - 1)) return null;
  const consensus = new Float32Array(width - 1);
  for (let x = 0; x < consensus.length; x++) {
    const values = profiles.map((profile) => profile[x]).sort((a, b) => a - b);
    consensus[x] = values[Math.floor(values.length / 2)];
  }
  const sorted = [...consensus].sort((a, b) => a - b);
  const baseline = sorted[Math.floor(sorted.length * 0.6)] || 0;
  const candidates = [...consensus.keys()].sort((a, b) => consensus[b] - consensus[a]);
  const minSeparation = Math.max(2, Math.round(width * MIN_EDGE_SEPARATION_RATIO));
  const peaks = [];
  for (const x of candidates) {
    if (peaks.every((peak) => Math.abs(peak - x) >= minSeparation)) peaks.push(x);
    if (peaks.length >= 12) break;
  }
  let best = null;
  for (const left of peaks) {
    for (const right of peaks) {
      if (right <= left) continue;
      const ratio = (right - left) / width;
      if (ratio < MIN_PANEL_WIDTH_RATIO || ratio > MAX_PANEL_WIDTH_RATIO) continue;
      const edgeStrength = (consensus[left] + consensus[right]) / 2;
      const score = edgeStrength / Math.max(0.001, baseline);
      if (!best || score > best.score) best = { left, right, score, edgeStrength, baseline };
    }
  }
  if (!best || best.score < 1.45) return null;
  const confidence = Math.min(0.99, Math.max(0, (best.score - 1.45) / 2.5 + 0.55));
  return {
    x: best.left,
    width: best.right - best.left + 1,
    confidence,
    evidence: {
      method: 'persistent-vertical-panel-edges',
      edgeScore: Number(best.score.toFixed(3)),
      comparedFrames: profiles.length,
    },
  };
}

// Require same-width frames so one crop can be applied safely to the stitched canvas.
export function detectDetailPanelRegion(frames) {
  if (!frames.length) return null;
  const width = frames[0].sourceWidth;
  if (frames.some((frame) => frame.sourceWidth !== width)) return null;
  const profiles = frames.map(measureVerticalEdges);
  if (profiles.some((profile) => !profile)) return null;
  const bounds = detectPanelBoundsFromProfiles(profiles, width);
  if (!bounds) return null;
  return {
    x: bounds.x,
    y: 0,
    width: bounds.width,
    height: null,
    confidence: bounds.confidence,
    evidence: bounds.evidence,
  };
}
