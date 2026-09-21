import { installDebugCopy } from './ui/debug-log.js';
import { decodeImage, releaseImage, installImageInput, moveImage, removeImage } from './input/image-input.js';
import { loadDebugFixtureFiles } from './input/debug-fixture-input.js';
import { installClipboardInput } from './input/clipboard-input.js';
import { analyzeFrames } from './analysis/frame-analyzer.js';
import { detectOverlap } from './stitch/overlap-detector.js';
import { suggestOrder } from './stitch/frame-order.js';
import { planStitch, renderStitch } from './stitch/stitch-engine.js';
import { renderFrames, renderResults } from './ui/ui.js';

const frames = [];
const analyzeButton = document.querySelector('#analyze');
const environment = document.querySelector('#environment');
const message = document.querySelector('#message');
const manualOrder = document.querySelector('#manual-order');
const fixtureButton = document.querySelector('#load-debug-fixtures');
let revision = 0;
let pendingLoads = 0;
let analyzing = false;
let loadQueue = Promise.resolve();

// Clear stale results immediately whenever inputs change.
function invalidate() {
  revision++;
  document.querySelector('#results').hidden = true;
  document.querySelector('#preview').replaceChildren();
}

// Keep mutation controls disabled during decode and comparison work.
function refresh() {
  const busy = pendingLoads > 0 || analyzing;
  analyzeButton.disabled = busy || !frames.length;
  environment.disabled = busy;
  manualOrder.disabled = busy;
  fixtureButton.disabled = busy;
  renderFrames(frames, moveFrame, removeFrame, busy, manualOrder.checked);
}

// Serialize all sources through one decode path; replacements commit only after full success.
function queueFiles(getFiles, replace = false) {
  invalidate();
  pendingLoads++;
  refresh();
  message.textContent = '画像を読み込んでいます…';
  loadQueue = loadQueue.then(async () => {
    const decoded = [];
    const errors = [];
    try {
      const files = await getFiles();
      for (const file of files) {
        try {
          decoded.push(await decodeImage(file));
        } catch (error) {
          errors.push(error.message);
        }
      }
      if (replace && errors.length) throw new Error(errors.join(' / '));
      if (replace) {
        frames.forEach(releaseImage);
        frames.splice(0, frames.length, ...decoded);
      } else {
        frames.push(...decoded);
      }
      message.textContent = errors.length ? errors.join(' / ')
        : replace ? `デバッグ画像${decoded.length}枚に置換しました。解析ボタンで検証できます。`
          : `${frames.length}枚を登録しました。`;
    } catch (error) {
      decoded.forEach(releaseImage);
      message.textContent = `読み込みに失敗しました。既存の登録画像は保持しています。 ${error.message}`;
    } finally {
      pendingLoads--;
      refresh();
    }
  });
}

// Selection, drop and paste append; fixtures use the same queue with atomic replacement.
function addFiles(files) {
  if (files.length) queueFiles(() => files);
}

// Manual ordering remains authoritative until the user applies a suggestion.
function moveFrame(index, direction) {
  if (pendingLoads || analyzing || !moveImage(frames, index, direction)) return;
  invalidate();
  refresh();
  message.textContent = '順番を変更しました。再解析してください。';
}

// Release removed images and invalidate the previous preview.
function removeFrame(index) {
  if (pendingLoads || analyzing) return;
  const removed = removeImage(frames, index);
  if (!removed) return;
  releaseImage(removed);
  invalidate();
  refresh();
  message.textContent = frames.length ? '画像を削除しました。再解析してください。' : '画像を追加してください。';
}

// Yield between pair searches, and discard results if new input arrives.
async function analyze() {
  if (pendingLoads || analyzing || !frames.length) return;
  invalidate();
  const currentRevision = revision;
  analyzing = true;
  refresh();
  try {
    const normalized = analyzeFrames(frames, environment.value);
    const inputOrder = normalized.map((frame) => frame.id);
    const pairs = [];
    const count = normalized.length * (normalized.length - 1);
    for (const from of normalized) {
      for (const to of normalized) {
        if (from.id === to.id) continue;
        message.textContent = `画像を比較しています… ${pairs.length + 1} / ${count}`;
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (revision !== currentRevision) return;
        pairs.push(detectOverlap(from, to));
      }
    }
    if (revision !== currentRevision) return;
    const suggestion = suggestOrder(normalized, pairs);
    const byId = new Map(normalized.map((frame) => [frame.id, frame]));
    const ordered = manualOrder.checked ? normalized : suggestion.order.map((id) => byId.get(id));
    const connections = ordered.slice(1).map((frame, index) => pairs.find((pair) => pair.fromId === ordered[index].id && pair.toId === frame.id));
    const plan = planStitch(ordered, connections);
    const canvas = renderStitch(plan);
    const originals = new Map(frames.map((frame) => [frame.id, frame]));
    frames.splice(0, frames.length, ...ordered.map((frame) => originals.get(frame.id)));
    renderResults(ordered, pairs, connections, suggestion, plan, canvas, inputOrder);
    message.textContent = connections.some((pair) => pair.status !== 'confirmed')
      ? '解析完了。確認が必要な接続があります。該当箇所の重複は除去せず残しています。'
      : '解析が完了しました。プレビューを確認してください。';
  } catch (error) {
    message.textContent = `解析できませんでした: ${error.message}`;
  } finally {
    analyzing = false;
    refresh();
  }
}

// Initialize each input once; clipboard module also guards against duplicate setup.
installImageInput(document.querySelector('#image-files'), document.querySelector('#drop-zone'), addFiles);
installClipboardInput(document, addFiles);
analyzeButton.addEventListener('click', analyze);
fixtureButton.addEventListener('click', () => {
  if (!pendingLoads && !analyzing) queueFiles(loadDebugFixtureFiles, true);
});
environment.addEventListener('change', () => {
  invalidate();
  message.textContent = '入力環境を変更しました。再解析してください。';
});
manualOrder.addEventListener('change', () => {
  invalidate();
  refresh();
  message.textContent = manualOrder.checked ? '救済用の手動順序を使用します。矢印で並べ替えて再解析してください。' : '自動順序を使用します。再解析してください。';
});
installDebugCopy(document.querySelector('#copy-debug'), document.querySelector('#debug'), document.querySelector('#copy-status'));
refresh();
