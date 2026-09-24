import test from 'node:test';
import assert from 'node:assert/strict';
import { detectOverlap } from '../assets/js/stitch/overlap-detector.js';
import { suggestOrder } from '../assets/js/stitch/frame-order.js';
import { planStitch } from '../assets/js/stitch/stitch-engine.js';
import { moveImage, removeImage, installImageInput, decodeImage } from '../assets/js/input/image-input.js';
import { installClipboardInput } from '../assets/js/input/clipboard-input.js';

// Deterministic source pixels, with distinct patterns at each vertical position.
function makeFrame(id, start, height = 120, mode = 'noise', seed = 1) {
  const width = 32;
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const row = mode === 'repeat' ? (y + start) % 12 : y + start;
      let value = Math.imul(row + seed * 7919, 374761393) + Math.imul(x + 1, 668265263);
      value = Math.imul(value ^ (value >>> 13), 1274126177);
      data[y * width + x] = mode === 'blank' ? 0.5 : ((value ^ (value >>> 16)) >>> 0) / 4294967295;
    }
  }
  return { id, sourceWidth: 320, sourceHeight: height, analysis: { width, height, data, scaleY: 1 } };
}

// The seam, image order and resulting height share a known independent ground truth.
test('known overlap, scrambled three-frame order and exact native stitch height', () => {
  const a = makeFrame('a', 0);
  const b = makeFrame('b', 53);
  const c = makeFrame('c', 106);
  const frames = [c, a, b];
  const pairs = frames.flatMap((from) => frames.filter((to) => from !== to).map((to) => detectOverlap(from, to)));
  const ab = pairs.find((pair) => pair.fromId === 'a' && pair.toId === 'b');
  const bc = pairs.find((pair) => pair.fromId === 'b' && pair.toId === 'c');
  assert.equal(ab.status, 'confirmed');
  assert.equal(ab.offsetY, 53);
  assert.equal(ab.overlapHeight, 67);
  assert.ok(ab.secondBestScore < ab.score);
  assert.deepEqual(suggestOrder(frames, pairs).order, ['a', 'b', 'c']);
  const plan = planStitch([a, b, c], [ab, bc]);
  assert.equal(plan.height, 226);
  assert.deepEqual(plan.segments.map((segment) => segment.cropTop), [0, 67, 67]);
});

// Ambiguous and unrelated material must never authorize destructive cropping.
test('unrelated, blank, periodic, reversed and duplicate inputs are not confirmed', () => {
  for (const [a, b] of [
    [makeFrame('a', 0), makeFrame('b', 0, 120, 'noise', 99)],
    [makeFrame('a', 0, 120, 'blank'), makeFrame('b', 50, 120, 'blank')],
    [makeFrame('a', 0, 120, 'repeat'), makeFrame('b', 24, 120, 'repeat')],
    [makeFrame('a', 53), makeFrame('b', 0)],
    [makeFrame('a', 0), makeFrame('b', 0)],
  ]) {
    const result = detectOverlap(a, b);
    assert.notEqual(result.status, 'confirmed');
    assert.equal(planStitch([a, b], [result]).height, 240);
  }
});

// Width mismatch is explicit; every frame survives in the output.
test('mixed widths and unsupported canvas sizes are handled explicitly', () => {
  const a = makeFrame('a', 0);
  const b = { ...makeFrame('b', 53), sourceWidth: 400 };
  const pair = detectOverlap(a, b);
  assert.equal(pair.status, 'unresolved');
  assert.equal(planStitch([a, b], [pair]).height, 240);
  assert.equal(planStitch([a, b], [pair]).width, 400);
  assert.throws(() => planStitch([{ ...a, sourceHeight: 40000 }], []), /Canvas/);
});

// Register twice and send two paste events: exactly one callback per intentional paste.
test('clipboard installation is idempotent and repeated pastes stay intentional', () => {
  const target = new EventTarget();
  const file = new File(['test'], 'image.png', { type: 'image/png' });
  let calls = 0;
  const oldCleanup = installClipboardInput(target, () => { throw new Error('stale listener'); });
  const cleanup = installClipboardInput(target, (files) => {
    calls++;
    assert.equal(files.length, 1);
    assert.match(files[0].name, /^clipboard-/);
  });
  oldCleanup();
  for (let i = 0; i < 2; i++) {
    const event = new Event('paste', { cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] } });
    target.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  }
  assert.equal(calls, 2);
  cleanup();
});

// Intentional duplicates keep their own registrations through move and delete.
test('file batches, repeated selection, drop, move and delete preserve identity/order', async () => {
  const input = new EventTarget();
  const drop = new EventTarget();
  drop.classList = { add() {}, remove() {} };
  const frames = [];
  const cleanup = installImageInput(input, drop, (files) => frames.push(...files));
  const a = { id: 'a', name: 'same.png' };
  const b = { id: 'b', name: 'same.png' };
  const c = { id: 'c', name: 'third.png' };
  input.files = [a, b];
  input.value = 'same.png';
  input.dispatchEvent(new Event('change'));
  assert.equal(input.value, '');
  const event = new Event('drop', { cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files: [c] } });
  drop.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(frames.map((frame) => frame.id), ['a', 'b', 'c']);
  assert.equal(moveImage(frames, 0, -1), false);
  assert.equal(moveImage(frames, 2, -1), true);
  assert.deepEqual(frames.map((frame) => frame.id), ['a', 'c', 'b']);
  assert.equal(removeImage(frames, 2), b);
  assert.deepEqual(frames, [a, c]);
  assert.equal(removeImage(frames, -1), null);
  await assert.rejects(() => decodeImage({ type: 'text/plain', name: 'bad.txt' }), /PNG/);
  cleanup();
  input.dispatchEvent(new Event('change'));
  assert.equal(frames.length, 2);
});

// Coarse samples alone miss an odd-pixel seam; native refinement recovers it.
test('native refinement removes quantization error from the coarse overlap search', () => {
  const frames = [makeFrame('a', 0, 240), makeFrame('b', 53, 240)];
  for (const frame of frames) {
    const original = frame.analysis;
    frame.nativeAnalysis = original;
    const height = original.height / 2;
    const data = new Float32Array(original.width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < original.width; x++) {
        data[y * original.width + x] = (original.data[(y * 2) * original.width + x] + original.data[(y * 2 + 1) * original.width + x]) / 2;
      }
    }
    frame.analysis = { width: original.width, height, data, scaleY: 0.5 };
  }
  const pair = detectOverlap(...frames);
  assert.equal(pair.status, 'confirmed');
  assert.equal(pair.offsetY, 53);
  assert.equal(pair.overlapHeight, 187);
  assert.equal(planStitch(frames, [pair]).height, 293);
});
