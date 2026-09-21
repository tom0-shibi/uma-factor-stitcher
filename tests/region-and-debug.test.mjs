import test from 'node:test';
import assert from 'node:assert/strict';
import { detectContentBand, detectRegions } from '../assets/js/analysis/region-detector.js';
import { detectOverlap } from '../assets/js/stitch/overlap-detector.js';
import { planStitch } from '../assets/js/stitch/stitch-engine.js';
import { buildDebugLog, formatDebugLog, installDebugCopy } from '../assets/js/ui/debug-log.js';

// Fixed UI surrounds deterministic moving texture at variable sizes and aspect ratios.
function screen(start, width = 40, height = 200, top = 37, content = 118, seed = 1) {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const moving = y >= top && y < top + content;
      const row = moving ? y - top + start + seed * 997 : y + 80000;
      let value = Math.imul(row + 1, 374761393) + Math.imul(x + 3, 668265263);
      value = Math.imul(value ^ (value >>> 13), 1274126177);
      data[y * width + x] = ((value ^ (value >>> 16)) >>> 0) / 4294967295;
    }
  }
  return { width, height, data, scaleY: 1 };
}

// Normalization uses detector output, never the known fixture coordinates in production code.
function framesFrom(grids) {
  const band = detectContentBand(grids);
  return grids.map((grid, index) => {
    const frame = { id: String(index), sourceWidth: grid.width, sourceHeight: grid.height };
    const regions = detectRegions(frame, 'auto', band);
    const { y, height } = regions.factorRegion;
    return { ...frame, ...regions, identityAnalysis: grid,
      analysis: { width: grid.width, height, scaleY: 1, data: grid.data.slice(y * grid.width, (y + height) * grid.width) } };
  });
}

test('moving region is inferred at different sizes and aspect ratios', () => {
  for (const [width, height, top, content] of [[40, 200, 37, 118], [75, 330, 91, 142], [96, 160, 24, 103]]) {
    const band = detectContentBand([screen(0, width, height, top, content), screen(53, width, height, top, content)]);
    assert.ok(band);
    assert.ok(Math.abs(band.top * height - top) <= 1);
    assert.ok(Math.abs(band.bottom * height - top - content) <= 1);
  }
});

test('TEST-1 identical and near-identical images are duplicate candidates at zero', () => {
  const [a, b] = framesFrom([screen(0), screen(0)]);
  for (const target of [b, { ...b, identityAnalysis: { ...b.identityAnalysis, data: b.identityAnalysis.data.map((v) => v + 0.0005) } }]) {
    const pair = detectOverlap(a, target);
    assert.equal(pair.kind, 'duplicate');
    assert.equal(pair.offsetY, 0);
    assert.equal(pair.status, 'review');
  }
});

test('TEST-2 moving content has nonzero translation; fixed UI is rendered once', () => {
  const [a, b] = framesFrom([screen(0), screen(53)]);
  const pair = detectOverlap(a, b);
  assert.equal(pair.kind, 'scroll');
  assert.equal(pair.offsetY, 53);
  assert.equal(pair.status, 'confirmed');
  assert.equal(pair.overlapHeight, 65);
  const plan = planStitch([a, b], [pair]);
  assert.equal(plan.height, 253);
  assert.equal(plan.segments[0].height, 155);
  assert.equal(plan.segments[1].cropTop, 102);
});

test('TEST-3 shared fixed UI cannot create a full-height zero-offset scroll connection', () => {
  const [a, b] = framesFrom([screen(0), screen(0, 40, 200, 37, 118, 73)]);
  const pair = detectOverlap(a, b);
  assert.notEqual(pair.kind, 'duplicate');
  assert.notEqual(pair.offsetY, 0);
  assert.notEqual(pair.status, 'confirmed');
  const plan = planStitch([a, b], [pair]);
  assert.equal(plan.height, 318);
  assert.equal(plan.segments[1].adopted, false);
});

test('single and unchanged frames fall back without inventing a content band', () => {
  assert.equal(detectContentBand([screen(0)]), null);
  assert.equal(detectContentBand([screen(0), screen(0)]), null);
});

test('default debug log includes selected/adopted joins without all candidate pairs', () => {
  const [a, b] = framesFrom([screen(0), screen(53)]);
  const pair = detectOverlap(a, b);
  const report = buildDebugLog([a, b], [pair], { order: ['0', '1'] }, planStitch([a, b], [pair]), ['1', '0']);
  const text = formatDebugLog(report);
  assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(report)));
  assert.equal(report.selectedJoins[0].adopted, true);
  assert.equal(report.selectedJoins[0].offsetY, 53);
  assert.ok(!text.includes('candidatePairs'));
  assert.ok(text.split('\n').length < 80);
});

test('copy control displays actual clipboard success and failure', async () => {
  for (const succeeds of [true, false]) {
    const button = new EventTarget();
    const status = { textContent: '' };
    let copied;
    installDebugCopy(button, { textContent: '{"test":true}' }, status, { writeText: async (text) => {
      if (!succeeds) throw new Error('permission denied');
      copied = text;
    } });
    button.dispatchEvent(new Event('click'));
    await new Promise(setImmediate);
    assert.equal(button.disabled, false);
    assert.match(status.textContent, succeeds ? /コピーしました/ : /コピーできません/);
    if (succeeds) assert.equal(copied, '{"test":true}');
  }
});
