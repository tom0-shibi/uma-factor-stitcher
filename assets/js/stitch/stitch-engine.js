const MAX_CANVAS_SIDE = 32767;
const MAX_CANVAS_PIXELS = 64000000;

// Keep common fixed UI once, and retain all moving content at uncertain joins.
export function planStitch(frames, connections) {
  if (!frames.length) throw new Error('画像を追加してください。');
  const width = Math.max(...frames.map((frame) => frame.sourceWidth));
  const reference = frames[0].factorRegion;
  const commonBand = reference && frames.every((frame) => frame.regionStatus === 'temporal-scroll-content'
    && frame.sourceWidth === frames[0].sourceWidth && frame.sourceHeight === frames[0].sourceHeight
    && frame.factorRegion.y === reference.y && frame.factorRegion.height === reference.height);
  let height = 0;
  const segments = frames.map((frame, index) => {
    const pair = connections[index - 1];
    const previous = frames[index - 1];
    const region = commonBand ? frame.factorRegion : { y: 0, height: frame.sourceHeight };
    const valid = pair?.status === 'confirmed' && pair.kind !== 'duplicate'
      && pair.fromId === previous?.id && pair.toId === frame.id
      && previous.sourceWidth === frame.sourceWidth && Number.isInteger(pair.overlapHeight)
      && pair.overlapHeight > 0 && pair.overlapHeight < region.height
      && pair.overlapHeight <= (previous.factorRegion?.height || previous.sourceHeight)
      && (commonBand || (!frame.factorRegion || frame.factorRegion.height === frame.sourceHeight));
    const cropTop = index === 0 ? 0 : region.y + (valid ? pair.overlapHeight : 0);
    const bottom = index === frames.length - 1 ? frame.sourceHeight : region.y + region.height;
    const segment = { frame, cropTop, x: Math.floor((width - frame.sourceWidth) / 2), y: height,
      height: bottom - cropTop, adopted: Boolean(valid) };
    height += segment.height;
    return segment;
  });
  if (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE || width * height > MAX_CANVAS_PIXELS) {
    throw new Error('元解像度での結合がCanvasの安全上限を超えます。画像枚数を減らしてください。');
  }
  return { width, height, segments, commonBand: Boolean(commonBand) };
}

// Draw original pixel rectangles at 1:1 scale; analysis grids are never rendered.
export function renderStitch(plan) {
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('プレビュー用のCanvasを作成できません。');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const { frame, cropTop, x, y, height } of plan.segments) {
    context.drawImage(frame.sourceImage, 0, cropTop, frame.sourceWidth, height, x, y, frame.sourceWidth, height);
  }
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `結合結果 ${plan.width} × ${plan.height} ピクセル`);
  return canvas;
}
