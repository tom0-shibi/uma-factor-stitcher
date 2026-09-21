import test from 'node:test';
import assert from 'node:assert/strict';
import { detectOverlap, DEFAULT_OPTIONS } from '../assets/js/stitch/overlap-detector.js';
import { verifyShortOverlap } from '../assets/js/stitch/short-overlap-verifier.js';
import { planStitch } from '../assets/js/stitch/stitch-engine.js';

// Independent synthetic scrolling texture with controllable contrast and local disagreement.
function frame(id, start, contrast = 1, rightShift = 0, periodic = false) {
  const width = 32;
  const height = 200;
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let row = y + start + (x >= width / 2 ? rightShift : 0);
      if (periodic) row %= 2;
      let value = Math.imul(row + 1, 374761393) + Math.imul(x + 3, 668265263);
      value = Math.imul(value ^ (value >>> 13), 1274126177);
      data[y * width + x] = ((value ^ (value >>> 16)) >>> 0) / 4294967295 * contrast + (1 - contrast) / 2;
    }
  }
  const grid = { width, height, data, scaleY: 1 };
  return { id, sourceWidth: width, sourceHeight: height, analysis: grid, nativeAnalysis: grid, identityAnalysis: grid };
}

const CANDIDATE = { kind: 'scroll', status: 'review', offsetY: 160, overlapHeight: 40, score: 0.91, margin: 0.1, texture: 0.03 };

test('a short contrast-affected review is independently verified and cropped once', () => {
  const a = frame('a', 0);
  const b = frame('b', 160, 0.75);
  const pair = detectOverlap(a, b);
  assert.equal(pair.offsetY, 160);
  assert.equal(pair.overlapHeight, 40);
  assert.ok(pair.score < DEFAULT_OPTIONS.confirmedScore);
  assert.equal(pair.firstStageStatus, 'review');
  assert.equal(pair.secondStage.result, 'passed');
  assert.equal(pair.status, 'confirmed');
  assert.ok(pair.secondStage.columns.every((column) => column.peakOffsetY === 160));
  assert.equal(planStitch([a, b], [pair]).height, 360);
});

test('disagreeing left/right positions reject verification and preserve fallback content', () => {
  const a = frame('a', 0);
  const b = frame('b', 160, 0.75, 3);
  const secondStage = verifyShortOverlap(a, b, CANDIDATE, DEFAULT_OPTIONS);
  assert.equal(secondStage.result, 'rejected');
  assert.notEqual(secondStage.columns[0].peakOffsetY, secondStage.columns[1].peakOffsetY);
  const pair = detectOverlap(a, b);
  assert.notEqual(pair.status, 'confirmed');
  assert.equal(planStitch([a, b], [pair]).height, 400);
});

test('one contradictory local patch prevents a short-overlap promotion', () => {
  const a = frame('a', 0);
  const b = frame('b', 160);
  for (let y = 20; y < 40; y++) {
    for (let x = 16; x < 32; x++) b.nativeAnalysis.data[y * 32 + x] = 1 - b.nativeAnalysis.data[y * 32 + x];
  }
  const result = verifyShortOverlap(a, b, CANDIDATE, DEFAULT_OPTIONS);
  assert.equal(result.result, 'rejected');
  assert.ok(result.patches.some((patch) => patch.correlation < result.criteria.minPatchCorrelation));
});

test('blank texture and ambiguous periodic matches cannot pass local verification', () => {
  const a = frame('a', 0);
  const b = frame('b', 160);
  a.nativeAnalysis.data.fill(0.5);
  b.nativeAnalysis.data.fill(0.5);
  assert.equal(verifyShortOverlap(a, b, CANDIDATE, DEFAULT_OPTIONS).result, 'rejected');
  const periodic = verifyShortOverlap(frame('c', 0, 1, 0, true), frame('d', 160, 1, 0, true), CANDIDATE, DEFAULT_OPTIONS);
  assert.equal(periodic.result, 'rejected');
  assert.ok(periodic.columns.some((column) => column.peakMargin < periodic.criteria.minPeakMargin));
});

test('confirmed, duplicate, weak, ambiguous and long matches are not promoted by a new path', () => {
  const a = frame('a', 0);
  const b = frame('b', 160);
  for (const change of [
    { status: 'confirmed' }, { kind: 'duplicate', offsetY: 0 }, { score: 0.8 },
    { margin: 0 }, { overlapHeight: 100, offsetY: 100 },
  ]) {
    assert.equal(verifyShortOverlap(a, b, { ...CANDIDATE, ...change }, DEFAULT_OPTIONS).result, 'not-run');
  }
  const pair = detectOverlap(a, b);
  assert.equal(pair.firstStageStatus, 'confirmed');
  assert.equal(pair.secondStage.result, 'not-run');
  assert.equal(pair.status, 'confirmed');
});
