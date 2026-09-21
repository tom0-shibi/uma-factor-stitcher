// Find one coherent moving band from temporal luminance variation, independent of filenames.
export function detectContentBand(grids) {
  if (grids.length < 2) return null;
  const { width, height } = grids[0];
  if (grids.some((grid) => grid.width !== width || grid.height !== height)) return null;
  const profile = new Float32Array(height);
  const left = Math.floor(width * 0.25);
  const right = Math.ceil(width * 0.75);
  for (let y = 0; y < height; y++) {
    for (let x = left; x < right; x++) {
      const values = grids.map((grid) => grid.data[y * width + x]).sort((a, b) => a - b);
      const trim = Math.floor((values.length - 1) * 0.1);
      profile[y] += values[values.length - 1 - trim] - values[trim];
    }
    profile[y] /= right - left;
  }
  const sorted = [...profile].sort((a, b) => a - b);
  const quiet = sorted[Math.floor(height * 0.2)];
  const active = sorted[Math.floor(height * 0.9)];
  if (active < 0.025 || active < quiet * 3) return null;
  const threshold = Math.max(0.012, quiet * 3, active * 0.15);
  const moving = [...profile].map((value) => value > threshold);
  // Bridge short blank spaces between text rows, but keep long fixed UI bands out.
  const maxGap = Math.max(1, Math.round(height * 0.018));
  for (let start = 0; start < height;) {
    if (moving[start]) { start++; continue; }
    let end = start;
    while (end < height && !moving[end]) end++;
    if (start > 0 && end < height && end - start <= maxGap) moving.fill(true, start, end);
    start = end;
  }
  const bands = [];
  for (let start = 0; start < height;) {
    if (!moving[start]) { start++; continue; }
    let end = start;
    let energy = 0;
    while (end < height && moving[end]) energy += profile[end++];
    bands.push({ start, end, energy });
    start = end;
  }
  bands.sort((a, b) => b.energy - a.energy);
  const band = bands[0];
  if (!band || band.end - band.start < height * 0.1) return null;
  if (bands[1]?.energy > band.energy * 0.6) return null;
  return {
    top: band.start / height,
    bottom: band.end / height,
    confidence: Math.min(0.99, 1 - quiet / active),
    evidence: { method: 'temporal-moving-band', threshold, quiet, active, comparedFrames: grids.length },
  };
}

// Single/identical or incompatible frames retain a conservative full-image fallback.
export function detectRegions(frame, environment = 'auto', band = null) {
  const full = { x: 0, y: 0, width: frame.sourceWidth, height: frame.sourceHeight };
  const top = band ? Math.floor(band.top * frame.sourceHeight) : 0;
  const bottom = band ? Math.ceil(band.bottom * frame.sourceHeight) : frame.sourceHeight;
  return {
    environment,
    gameRegion: full,
    factorRegion: { ...full, y: top, height: bottom - top },
    confidence: band?.confidence || 0,
    regionStatus: band ? 'temporal-scroll-content' : 'fallback-full-image',
    regionEvidence: band?.evidence || { method: 'insufficient-temporal-evidence' },
  };
}
