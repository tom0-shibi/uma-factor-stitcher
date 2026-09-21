import { decodeImage, releaseImage, installImageInput, moveImage, removeImage } from './input/image-input.js';
import { installClipboardInput } from './input/clipboard-input.js';
import { analyzeFrame } from './analysis/frame-analyzer.js';
import { detectOverlap } from './stitch/overlap-detector.js';
import { suggestOrder } from './stitch/frame-order.js';
import { planStitch, renderStitch } from './stitch/stitch-engine.js';
import { renderFrames, renderResults } from './ui/ui.js';

const frames = [];
const analyzeButton = document.querySelector('#analyze');
const environment = document.querySelector('#environment');
const message = document.querySelector('#message');
const applyOrderButton = document.querySelector('#apply-order');
let revision = 0;
let pendingLoads = 0;
let analyzing = false;
let loadQueue = Promise.resolve();
let suggestedIds = [];

// Clear stale results immediately whenever inputs change.
function invalidate() {
  revision++;
  suggestedIds = [];
  document.querySelector('#results').hidden = true;
  document.querySelector('#preview').replaceChildren();
}

// Keep mutation controls disabled during decode and comparison work.
function refresh() {
  const busy = pendingLoads > 0 || analyzing;
  analyzeButton.disabled = busy || !frames.length;
  environment.disabled = busy;
  applyOrderButton.disabled = busy;
  renderFrames(frames, moveFrame, removeFrame, busy);
}

// Serialize entire batches, preserving file and paste registration order.
function addFiles(files) {
  if (!files.length) return;
  invalidate();
  pendingLoads++;
  refresh();
  message.textContent = '画像を読み込んでいます…';
  loadQueue = loadQueue.then(async () => {
    const errors = [];
    for (const file of files) {
      try {
        frames.push(await decodeImage(file));
      } catch (error) {
        errors.push(error.message);
      }
    }
    pendingLoads--;
    message.textContent = errors.length ? errors.join(' / ') : `${frames.length}枚を登録しました。`;
    refresh();
  });
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
    const normalized = frames.map((frame) => analyzeFrame(frame, environment.value));
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
    const connections = normalized.slice(1).map((frame, index) => pairs.find((pair) => pair.fromId === normalized[index].id && pair.toId === frame.id));
    const suggestion = suggestOrder(normalized, pairs);
    const plan = planStitch(normalized, connections);
    const canvas = renderStitch(plan);
    suggestedIds = suggestion.order;
    renderResults(normalized, pairs, connections, suggestion, plan, canvas);
    message.textContent = connections.some((pair) => pair.status !== 'confirmed')
      ? '解析完了。確認が必要な接続があります。該当画像は切り落とさず残しています。'
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
environment.addEventListener('change', () => {
  invalidate();
  message.textContent = '入力環境を変更しました。再解析してください。';
});
applyOrderButton.addEventListener('click', () => {
  if (analyzing || pendingLoads || suggestedIds.length !== frames.length) return;
  const byId = new Map(frames.map((frame) => [frame.id, frame]));
  frames.splice(0, frames.length, ...suggestedIds.map((id) => byId.get(id)));
  analyze();
});
refresh();
