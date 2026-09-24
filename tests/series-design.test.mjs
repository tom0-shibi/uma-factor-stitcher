import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { initializeHeader } from '../assets/js/ui/header.js';

class Node extends EventTarget {
  hidden = true; inert = false; isConnected = true; attrs = {};
  setAttribute(key, value) { this.attrs[key] = value; }
  focus() { this.doc.activeElement = this; }
}
function setup() {
  const doc = new Node();
  const nodes = Object.fromEntries(['usage-open', 'usage-modal', 'usage-close', 'tool-open', 'tool-menu', 'header', 'main'].map(id => [id, new Node()]));
  Object.values(nodes).forEach(n => { n.doc = doc; });
  const classes = new Set(); doc.body = { classList: { add: x => classes.add(x), remove: x => classes.delete(x) } };
  doc.getElementById = id => nodes[id];
  doc.querySelector = selector => nodes[selector === '.app-header' ? 'header' : 'main'];
  nodes['tool-open'].parentElement = { contains: target => [nodes['tool-open'], nodes['tool-menu']].includes(target) };
  initializeHeader(doc);
  const click = id => nodes[id].dispatchEvent(new Event('click'));
  const key = name => { const e = new Event('keydown', { cancelable: true }); e.key = name; doc.dispatchEvent(e); return e; };
  return { doc, nodes, click, key, classes };
}
test('usage closes by button, backdrop and Escape with focus restoration and inert background', () => {
  const { nodes, click, key, classes } = setup();
  for (const method of ['button', 'backdrop', 'Escape']) {
    nodes['usage-open'].focus(); click('usage-open');
    assert.equal(nodes['usage-modal'].hidden, false);
    assert.equal(nodes.header.inert, true); assert.equal(nodes.main.inert, true);
    assert.equal(nodes['usage-open'].attrs['aria-expanded'], 'true');
    assert.equal(key('Tab').defaultPrevented, true);
    assert.equal(nodes['usage-close'].doc.activeElement, nodes['usage-close']);
    if (method === 'button') click('usage-close');
    else if (method === 'backdrop') click('usage-modal');
    else key('Escape');
    assert.equal(nodes['usage-modal'].hidden, true);
    assert.equal(nodes.header.inert, false); assert.equal(nodes.main.inert, false);
    assert.equal(nodes['usage-open'].doc.activeElement, nodes['usage-open']);
    assert.equal(classes.has('usage-modal-open'), false);
  }
});
test('UmaTool toggles, closes outside/Escape, and never stays open beneath usage', () => {
  const { doc, nodes, click, key } = setup();
  click('tool-open'); assert.equal(nodes['tool-menu'].hidden, false);
  click('tool-open'); assert.equal(nodes['tool-menu'].hidden, true);
  click('tool-open'); doc.dispatchEvent(new Event('click')); assert.equal(nodes['tool-menu'].hidden, true);
  click('tool-open'); key('Escape'); assert.equal(nodes['tool-menu'].hidden, true);
  assert.equal(doc.activeElement, nodes['tool-open']);
  click('tool-open'); nodes['usage-open'].focus(); click('usage-open');
  assert.equal(nodes['tool-menu'].hidden, true);
  assert.equal(nodes['usage-modal'].hidden, false);
});
test('header controls, real links and existing workflow remain intact', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['image-files', 'drop-zone', 'clear-frames', 'manual-order', 'environment', 'analyze', 'preview', 'preview-modal', 'load-debug-fixtures', 'copy-debug', 'copy-image', 'save-png']) {
    assert.ok(html.includes(`id="${id}"`));
  }
  assert.equal((html.match(/id="usage-open"/g) || []).length, 1);
  assert.doesNotMatch(html, /id="usage"|inline-help|usage-entry/);
  assert.match(html, /<h1><span>Uma Factor<\/span> <strong>Stitcher<\/strong><\/h1>/);
  assert.match(html, /親・祖の因子一覧を1枚の画像に/);
  const menu = html.split('<nav id="tool-menu"')[1].split('</nav>')[0];
  assert.equal((menu.match(/<a /g) || []).length, 1);
  assert.match(menu, /href="https:\/\/tom0-shibi.github.io\/uma-factor-checker\/"/);
  assert.match(menu, /<div aria-current="page"><strong>Uma Factor Stitcher/);
  assert.doesNotMatch(menu, /target=|近日公開/);
  const css = await readFile(new URL('../assets/css/style.css', import.meta.url), 'utf8');
  const tokens = await readFile(new URL('../assets/css/tokens.css', import.meta.url), 'utf8');
  assert.match(tokens, /--page-max-width: 1200px/);
  assert.match(tokens, /--color-bg: #e7eef7/);
  assert.match(tokens, /--color-bg: #0d1521/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /\.header-utilities \{ flex-wrap: wrap; \}/);
  assert.match(css, /\.usage-modal \{[^}]*overflow: auto;/);
  const asset = await readFile(new URL('../assets/images/uma-factor-header-silhouette.png', import.meta.url));
  assert.equal(asset.subarray(1,4).toString(), 'PNG');
});
