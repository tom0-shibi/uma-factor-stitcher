import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { summarizeResult } from '../assets/js/ui/result-status.js';
import { renderResults, renderFailure } from '../assets/js/ui/ui.js';
import { installDebugCopy } from '../assets/js/ui/debug-log.js';

const plan = (adopted = true) => ({ width: 100, height: 180, segments: [{ adopted: false }, { adopted }] });
const pair = (status = 'confirmed') => ({ fromId: 'a', toId: 'b', status, firstStageStatus: 'review', secondStage: { result: 'passed' } });
test('success uses final status and actual adoption, including second-stage success', () => {
  assert.equal(summarizeResult(2, [pair()], plan()).message, '2枚の画像を結合しました');
  assert.equal(summarizeResult(2, [pair('review')], plan()).status, 'review');
  assert.equal(summarizeResult(2, [pair()], plan(false)).status, 'review');
  for (const status of ['failed', 'unresolved']) assert.equal(summarizeResult(2, [pair(status)], plan(false)).status, 'failed');
  assert.equal(summarizeResult(2, [], plan()).status, 'failed');
  assert.equal(summarizeResult(0, [], null).status, 'failed');
  assert.equal(summarizeResult(1, [], { segments: [{}] }).message, '1枚の画像を表示しました');
});

test('rendered success/review/failure and compact clipboard retain actual outcomes', async () => {
  class Element extends EventTarget {
    textContent = ''; children = [];
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
  }
  const nodes = new Map();
  globalThis.document = { querySelector: (id) => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); }, createElement: () => new Element() };
  const frames = [{ id: 'a', name: 'first.jpg' }, { id: 'b', name: 'second.jpg' }];
  for (const [status, adopted, expected] of [['confirmed', true, 'success'], ['review', false, 'review'], ['confirmed', false, 'review'], ['failed', false, 'failed']]) {
    const connection = pair(status);
    const outcome = renderResults(frames, [connection], [connection], { order: ['a', 'b'], connected: 1, supported: 1 }, plan(adopted), {}, ['a', 'b']);
    assert.equal(outcome.status, expected);
    assert.equal(nodes.get('#result-summary').textContent, outcome.message);
    assert.doesNotMatch(nodes.get('#result-summary').textContent + nodes.get('#result-guidance').textContent, /offsetY|score|confidence|secondBestScore/);
  }
  let copied;
  const button = new Element();
  installDebugCopy(button, nodes.get('#debug'), nodes.get('#copy-status'), { writeText: async (text) => { copied = text; } });
  button.dispatchEvent(new Event('click'));
  await new Promise(setImmediate);
  assert.equal(JSON.parse(copied).selectedJoins[0].status, 'failed');
  assert.ok(!copied.includes('candidatePairs'));
  assert.match(nodes.get('#full-debug').textContent, /candidatePairs/);
  assert.match(nodes.get('#copy-status').textContent, /コピーしました/);
  assert.equal(renderFailure(new Error('canvas failed')).status, 'failed');
  assert.match(nodes.get('#result-summary').textContent, /自動結合できない/);
  assert.match(nodes.get('#debug').textContent, /canvas failed/);
  delete globalThis.document;
});

test('help and developer tools use closed native details; normal results omit diagnostics', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<details id="usage" class="inline-help">\s*<summary>.*<strong>使い方<\/strong>/);
  assert.match(html, /<details id="developer-debug">\s*<summary>開発者向け \/ Debug<\/summary>/);
  const normal = html.split('<section id="results"')[1].split('</section>')[0];
  assert.doesNotMatch(normal, /connections|order-note|debug|score|confidence/);
  for (const id of ['load-debug-fixtures', 'connections', 'order-note', 'copy-debug', 'full-debug']) assert.ok(html.indexOf(`id="${id}"`) > html.indexOf('id="developer-debug"'));
});
