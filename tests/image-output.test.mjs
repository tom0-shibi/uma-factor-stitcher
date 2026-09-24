import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasToPng, downloadPng, installImageOutput, pngFilename } from '../assets/js/ui/image-output.js';
function canvas() {
  return { width: 501, height: 2830, calls: 0, toBlob(callback, type) { this.calls++; assert.equal(type, 'image/png'); callback(new Blob(['png'], { type })); } };
}
function setup(options = {}) {
  const saveButton = new EventTarget(), copyButton = new EventTarget(), status = {};
  const downloads = [], writes = [];
  class Item { constructor(data) { this.data = data; } }
  const output = installImageOutput({ saveButton, copyButton, status, secure: true, Item,
    clipboard: { write: async items => { writes.push(await items[0].data['image/png']); } },
    download: blob => downloads.push(blob), ...options });
  return { ...output, saveButton, copyButton, status, downloads, writes };
}
test('PNG uses intrinsic final canvas and both actions reuse identical PNG', async () => {
  const source = canvas(), ui = setup(); ui.setCanvas(source);
  await ui.save(); await ui.copy();
  assert.equal(source.calls, 1);
  assert.deepEqual([source.width, source.height], [501, 2830]);
  assert.equal(ui.downloads[0].type, 'image/png');
  assert.equal(ui.writes[0], ui.downloads[0]);
  assert.match(ui.status.textContent, /画像をコピーしました/);
  ui.setCanvas(null); assert.equal(ui.saveButton.disabled, true);
  const next = canvas(); ui.setCanvas(next); await ui.save(); assert.equal(next.calls, 1);
});
test('unsupported or rejected clipboard does not prevent saving', async () => {
  for (const options of [{ clipboard: undefined }, { Item: undefined }, { secure: false }, { clipboard: { write: async () => { throw Error('denied'); } } }, { clipboard: { write: () => { throw Error('denied'); } } }]) {
    const ui = setup(options); ui.setCanvas(canvas()); await ui.copy();
    assert.match(ui.status.textContent, /利用できません|コピーできません/);
    await ui.save(); assert.equal(ui.downloads.length, 1);
    assert.equal(ui.saveButton.disabled, false);
  }
});
test('encoding errors are caught; changed input cancels pending download', async () => {
  const ui = setup(); ui.setCanvas({ width: 1, height: 1, toBlob: cb => cb(null) });
  await ui.save(); assert.match(ui.status.textContent, /保存できません/);
  await ui.copy(); assert.match(ui.status.textContent, /コピーできません/);
  assert.equal(ui.saveButton.disabled, false);
  let callback;
  ui.setCanvas({ width: 1, height: 1, toBlob: cb => { callback = cb; } });
  const save = ui.save(); ui.setCanvas(null);
  callback(new Blob(['png'], { type: 'image/png' })); await save;
  assert.equal(ui.downloads.length, 0);
  await assert.rejects(canvasToPng({ width: 1, height: 1, toBlob() { throw Error('tainted'); } }));
});
test('download clicks a named PNG in same document and defers URL release', () => {
  const blob = new Blob(['png'], { type: 'image/png' });
  let clicked = false, removed = false, revoked = false, cleanup;
  const link = { click() { clicked = true; }, remove() { removed = true; } };
  downloadPng(blob, { doc: { createElement: () => link, body: { append() {} } },
    urls: { createObjectURL: value => { assert.equal(value, blob); return 'blob:png'; }, revokeObjectURL: url => { assert.equal(url, 'blob:png'); revoked = true; } },
    later: callback => { cleanup = callback; } });
  assert.ok(clicked && removed && !revoked);
  assert.match(link.download, /^uma-factor-stitcher-\d{8}-\d{6}\.png$/);
  assert.equal(link.target, undefined); cleanup(); assert.equal(revoked, true);
  assert.equal(pngFilename(new Date(2026, 8, 24, 12, 34, 56)), 'uma-factor-stitcher-20260924-123456.png');
});
