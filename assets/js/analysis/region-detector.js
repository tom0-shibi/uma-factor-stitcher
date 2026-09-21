// Phase A fallback: preserve all pixels; no platform-specific crop assumptions.
export function detectRegions(frame, environment = 'auto') {
  const region = { x: 0, y: 0, width: frame.sourceWidth, height: frame.sourceHeight };
  return {
    environment,
    gameRegion: { ...region },
    factorRegion: { ...region },
    confidence: 0,
    regionStatus: 'fallback-full-image',
  };
}
