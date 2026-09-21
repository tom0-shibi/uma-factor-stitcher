const MAX_CANVAS_SIDE = 32767;
const MAX_CANVAS_PIXELS = 64000000;

// Plan source crops in native pixels; uncertain connections retain whole images.
export function planStitch(frames, connections) {
  if (!frames.length) throw new Error('画像を追加してください。');
  const width = Math.max(...frames.map((frame) => frame.sourceWidth));
  let height = 0;
  const segments = frames.map((frame, index) => {
    const pair = connections[index - 1];
    const previous = frames[index - 1];
    const valid = pair?.status === 'confirmed' && pair.fromId === previous?.id && pair.toId === frame.id
      && previous.sourceWidth === frame.sourceWidth && Number.isInteger(pair.overlapHeight)
      && pair.overlapHeight > 0 && pair.overlapHeight < frame.sourceHeight
      && pair.overlapHeight <= previous.sourceHeight;
    const cropTop = valid ? pair.overlapHeight : 0;
    const segment = { frame, cropTop, x: Math.floor((width - frame.sourceWidth) / 2), y: height, height: frame.sourceHeight - cropTop };
    height += segment.height;
    return segment;
  });
  if (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE || width * height > MAX_CANVAS_PIXELS) {
    throw new Error('元解像度での結合がCanvasの安全上限を超えます。画像枚数を減らしてください。');
  }
  return { width, height, segments };
}

// Draw only original sources, never the reduced analysis grids.
export function renderStitch(plan) {
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('プレビュー用のCanvasを作成できません。');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const segment of plan.segments) {
    const { frame, cropTop, x, y, height } = segment;
    context.drawImage(frame.sourceImage, 0, cropTop, frame.sourceWidth, height, x, y, frame.sourceWidth, height);
  }
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `結合結果 ${plan.width} × ${plan.height} ピクセル`);
  return canvas;
}
