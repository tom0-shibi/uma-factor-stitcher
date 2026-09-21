import { detectRegions } from './region-detector.js';

const ANALYSIS_WIDTH = 72;
const MAX_ANALYSIS_HEIGHT = 1000;

// Keep native source information separate from a small central luminance grid.
export function analyzeFrame(frame, environment) {
  const regions = detectRegions(frame, environment);
  const region = regions.factorRegion;
  const scaleY = Math.min(ANALYSIS_WIDTH / region.width, MAX_ANALYSIS_HEIGHT / region.height);
  const height = Math.max(1, Math.floor(region.height * scaleY));
  const canvas = document.createElement('canvas');
  canvas.width = ANALYSIS_WIDTH;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('画像解析用のCanvasを作成できません。');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(frame.sourceImage, region.x, region.y, region.width, region.height, 0, 0, canvas.width, region.height * scaleY);
  const pixels = context.getImageData(0, 0, canvas.width, height).data;
  const left = Math.floor(ANALYSIS_WIDTH * 0.2);
  const right = Math.ceil(ANALYSIS_WIDTH * 0.8);
  const width = right - left;
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = left; x < right; x++) {
      const i = (y * ANALYSIS_WIDTH + x) * 4;
      data[y * width + x - left] = (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) / 255;
    }
  }
  // Keep vertical native-pixel samples to refine the final seam after coarse search.
  if (region.height > 32767) throw new Error('画像の高さが解析上限を超えます。');
  canvas.height = region.height;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(frame.sourceImage, region.x, region.y, region.width, region.height, 0, 0, canvas.width, region.height);
  const nativePixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const nativeData = new Float32Array(width * region.height);
  for (let y = 0; y < region.height; y++) {
    for (let x = left; x < right; x++) {
      const i = (y * ANALYSIS_WIDTH + x) * 4;
      nativeData[y * width + x - left] = (nativePixels[i] * 0.2126 + nativePixels[i + 1] * 0.7152 + nativePixels[i + 2] * 0.0722) / 255;
    }
  }
  return {
    ...frame,
    ...regions,
    analysisRegion: {
      x: region.x + region.width * left / ANALYSIS_WIDTH,
      y: region.y,
      width: region.width * width / ANALYSIS_WIDTH,
      height: region.height,
    },
    analysis: { width, height, data, scaleY },
    nativeAnalysis: { width, height: region.height, data: nativeData, scaleY: 1 },
  };
}
