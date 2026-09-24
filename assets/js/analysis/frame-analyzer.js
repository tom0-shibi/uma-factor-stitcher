import { detectRegions, detectContentBand } from './region-detector.js';

const ANALYSIS_WIDTH = 160;
const MAX_ANALYSIS_HEIGHT = 1200;

// Sample originals without mutating them; preserve aspect ratio and native Y when requested.
function sampleRegion(frame, region, width, scaleY, central = false) {
  const height = Math.max(1, Math.floor(region.height * scaleY));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('画像解析用のCanvasを作成できません。');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.drawImage(frame.sourceImage, region.x, region.y, region.width, region.height, 0, 0, width, region.height * scaleY);
  const pixels = context.getImageData(0, 0, width, height).data;
  const left = central ? Math.floor(width * 0.2) : 0;
  const right = central ? Math.ceil(width * 0.8) : width;
  const data = new Float32Array((right - left) * height);
  for (let y = 0; y < height; y++) {
    for (let x = left; x < right; x++) {
      const i = (y * width + x) * 4;
      data[y * (right - left) + x - left] = (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) / 255;
    }
  }
  return { width: right - left, height, data, scaleY };
}

// Compare same-resolution groups at equal Y to isolate their moving content bands.
export function analyzeFrames(frames, environment) {
  const groups = new Map();
  for (const frame of frames) {
    const key = `${frame.sourceWidth}:${frame.sourceHeight}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(frame);
  }
  const bands = new Map();
  for (const group of groups.values()) {
    const grids = group.map((frame) => sampleRegion(frame,
      { x: 0, y: 0, width: frame.sourceWidth, height: frame.sourceHeight },
      ANALYSIS_WIDTH, Math.min(1, MAX_ANALYSIS_HEIGHT / frame.sourceHeight)));
    const band = detectContentBand(grids);
    group.forEach((frame) => bands.set(frame.id, band));
  }
  return frames.map((frame) => analyzeFrame(frame, environment, bands.get(frame.id)));
}

// Smooth subpixel resampling noise in native-Y analysis only, retaining original output pixels.
function smoothVertical(grid, sourceWidth) {
  const radius = Math.max(1, Math.round(sourceWidth / ANALYSIS_WIDTH * 0.5));
  const output = new Float32Array(grid.data.length);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      let value = 0;
      let total = 0;
      for (let delta = -radius; delta <= radius; delta++) {
        const row = Math.max(0, Math.min(grid.height - 1, y + delta));
        const weight = radius + 1 - Math.abs(delta);
        value += grid.data[row * grid.width + x] * weight;
        total += weight;
      }
      output[y * grid.width + x] = value / total;
    }
  }
  return { ...grid, data: output };
}

// Identity uses the whole image; scroll matching uses only the detected content band.
export function analyzeFrame(frame, environment, band = null) {
  if (frame.sourceHeight > 32767) throw new Error('画像の高さが解析上限を超えます。');
  const regions = detectRegions(frame, environment, band);
  const region = regions.factorRegion;
  const scaleY = Math.min(1, ANALYSIS_WIDTH / region.width, MAX_ANALYSIS_HEIGHT / region.height);
  const analysis = sampleRegion(frame, region, ANALYSIS_WIDTH, scaleY, true);
  const nativeAnalysis = smoothVertical(sampleRegion(frame, region, ANALYSIS_WIDTH, 1, true), frame.sourceWidth);
  const identityAnalysis = sampleRegion(frame, regions.gameRegion, ANALYSIS_WIDTH,
    Math.min(1, ANALYSIS_WIDTH / frame.sourceWidth, MAX_ANALYSIS_HEIGHT / frame.sourceHeight));
  return {
    ...frame, ...regions, analysis, nativeAnalysis, identityAnalysis,
    analysisRegion: { x: region.x + region.width * 0.2, y: region.y, width: region.width * 0.6, height: region.height },
  };
}
