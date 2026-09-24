import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
class Element extends EventTarget {
  children = []; textContent = ''; value = ''; checked = false;
  classList = { add() {}, remove() {}, toggle() {} };
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute() {}
}
test('clear all releases normal and fixture registrations, resets results and permits re-add', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(m => ['#' + m[1], new Element()]));
  globalThis.document = new Element();
  document.querySelector = id => nodes.get(id);
  const tabs = ['images', 'results', 'share'].map(tab => { const node = new Element(); node.dataset = { tab }; return node; });
  document.querySelectorAll = selector => selector === '.tab-button' ? tabs : ['images', 'results', 'share'].map(id => { const node = nodes.get('#' + id); node.id = id; return node; });
  document.createElement = () => new Element();
  globalThis.Image = class { naturalWidth = 100; naturalHeight = 200; async decode() {} };
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async url => new Response(String(url).endsWith('manifest.json') ? JSON.stringify({ expectedFrameCount: 2, expectedInputOrder: ['a.jpg', 'b.jpg'] }) : 'mock-image');
  const originalRevoke = URL.revokeObjectURL;
  let releases = 0;
  URL.revokeObjectURL = url => { releases++; originalRevoke(url); };
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: {} } });
  try {
    await import('../assets/js/app.js');
    const clear = nodes.get('#clear-frames');
    const input = nodes.get('#image-files');
    const fixture = nodes.get('#load-debug-fixtures');
    const wait = async () => { for (let i = 0; i < 100 && fixture.disabled; i++) await new Promise(setImmediate); assert.equal(fixture.disabled, false); };
    assert.equal(clear.disabled, true);
    input.files = [new File(['mock'], 'normal.jpg', { type: 'image/jpeg' })];
    input.dispatchEvent(new Event('change'));
    assert.equal(clear.disabled, true);
    await wait();
    assert.equal(clear.disabled, false);
    clear.dispatchEvent(new Event('click'));
    assert.equal(releases, 1);
    assert.equal(nodes.get('#frame-count').textContent, '0枚');
    fixture.dispatchEvent(new Event('click')); await wait();
    assert.equal(nodes.get('#frame-count').textContent, '2枚');
    nodes.get('#frame-list').children[0].children[2].children[2].dispatchEvent(new Event('click'));
    assert.equal(nodes.get('#frame-count').textContent, '1枚');
    nodes.get('#manual-order').checked = true;
    clear.dispatchEvent(new Event('click'));
    assert.equal(releases, 3);
    assert.equal(nodes.get('#manual-order').checked, false);
    assert.equal(nodes.get('#analyze').disabled, true);
    assert.equal(tabs.find(node => node.dataset.tab === 'results').disabled, true);
    assert.equal(nodes.get('#debug-result').hidden, true);
    assert.equal(nodes.get('#preview').children.length, 0);
    assert.equal(nodes.get('#message').textContent, '画像を追加してください。');
    input.dispatchEvent(new Event('change')); await wait();
    assert.equal(nodes.get('#frame-count').textContent, '1枚');
    clear.dispatchEvent(new Event('click'));
  } finally {
    URL.revokeObjectURL = originalRevoke; globalThis.fetch = savedFetch;
    Object.defineProperty(globalThis, 'navigator', nav);
    delete globalThis.document; delete globalThis.Image;
  }
});
test('Checker-style theme follows OS, explicit preference and saved preference', async () => {
  const script = await readFile(new URL('../assets/js/ui/theme.js', import.meta.url), 'utf8');
  const system = new EventTarget(); system.matches = true;
  const select = new Element(); const dataset = {}; let saved;
  runInNewContext(script, { window: { matchMedia: () => system }, document: { querySelector: () => select, documentElement: { dataset } }, localStorage: { getItem: () => 'system', setItem: (key, value) => { saved = value; } } });
  assert.equal(dataset.theme, 'dark');
  select.value = 'light'; select.dispatchEvent(new Event('change'));
  assert.equal(dataset.theme, 'light'); assert.equal(saved, 'light');
  system.dispatchEvent(new Event('change')); assert.equal(dataset.theme, 'light');
  select.value = 'system'; select.dispatchEvent(new Event('change'));
  system.matches = false; system.dispatchEvent(new Event('change')); assert.equal(dataset.theme, 'light');
});
test('cards keep empty columns and fixture is not nested in details', async () => {
  const css = await readFile(new URL('../assets/css/style.css', import.meta.url), 'utf8');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(css, /repeat\(auto-fill, minmax\(min\(100%, 225px\), 1fr\)\)/);
  assert.match(html, /<title>Uma Factor Stitcher<\/title>/);
  assert.match(html, /<h3>開発用：実画像Debug Fixture<\/h3>/);
  assert.doesNotMatch(html, /<summary>開発用：実画像Debug Fixture/);
  assert.match(css, /\.usage-modal-backdrop \{\s*position: fixed/);
  assert.match(await readFile(new URL('../assets/css/tokens.css', import.meta.url), 'utf8'), /:root\[data-theme="dark"\]/);
});
