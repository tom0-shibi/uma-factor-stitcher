import { loadDebugFixtureFiles } from '../assets/js/input/debug-fixture-input.js';
import { decodeImage, releaseImage } from '../assets/js/input/image-input.js';
import { analyzeFrames } from '../assets/js/analysis/frame-analyzer.js';
import { detectOverlap } from '../assets/js/stitch/overlap-detector.js';
import { suggestOrder } from '../assets/js/stitch/frame-order.js';
import { planStitch, renderStitch } from '../assets/js/stitch/stitch-engine.js';
import { buildDebugLog, formatDebugLog } from '../assets/js/ui/debug-log.js';

// Reproduce Levels 1–3 through production modules, using ground truth only for assertions.
export async function runFixtureCheck(fetchFile = fetch) {
  const manifest = await (await fetchFile(new URL('./fixtures/continuous-scroll/manifest.json', import.meta.url))).json();
  const files = await loadDebugFixtureFiles(fetchFile);
  const inputs = [];
  try {
    for (const file of files) inputs.push(await decodeImage(file));
    if (inputs.length !== manifest.expectedFrameCount) throw new Error('Fixture count mismatch');
    const namesById = new Map(inputs.map((frame) => [frame.id, frame.name]));
    // Opaque names and mixed registration order prevent accidental filename/order assistance.
    const mixed = [4, 1, 7, 0, 5, 2, 6, 3].map((index, position) => ({ ...inputs[index], name: `upload-${position}` }));
    const frames = analyzeFrames(mixed, 'auto');
    const pairs = frames.flatMap((from) => frames.filter((to) => to !== from).map((to) => detectOverlap(from, to)));
    const suggestion = suggestOrder(frames, pairs);
    const reversed = suggestOrder([...frames].reverse(), pairs);
    const byId = new Map(frames.map((frame) => [frame.id, frame]));
    const actualNames = (order) => order.map((id) => namesById.get(id));
    const expectedFrames = manifest.expectedInputOrder.map((name) => frames.find((frame) => namesById.get(frame.id) === name));
    const adjacent = expectedFrames.slice(1).map((frame, index) => pairs.find((pair) => pair.fromId === expectedFrames[index].id && pair.toId === frame.id));
    const level1 = adjacent.every((pair) => pair.kind === 'scroll' && pair.offsetY !== 0);
    const level2 = adjacent.every((pair) => pair.offsetY > 0 && pair.status !== 'unresolved');
    const level3 = [suggestion, reversed].every((candidate) => JSON.stringify(actualNames(candidate.order)) === JSON.stringify(manifest.expectedInputOrder));
    const ordered = suggestion.order.map((id) => byId.get(id));
    const joins = ordered.slice(1).map((frame, index) => pairs.find((pair) => pair.fromId === ordered[index].id && pair.toId === frame.id));
    const plan = planStitch(ordered, joins);
    const summary = buildDebugLog(ordered, joins, suggestion, plan, frames.map((frame) => frame.id));
    const compactLog = formatDebugLog(summary);
    const report = {
      kind: 'observation-not-ground-truth',
      groundTruth: { expectedFrameCount: manifest.expectedFrameCount, expectedInputOrder: manifest.expectedInputOrder, joinOffsets: manifest.joinOffsets },
      levels: { level1, level2, level3, level4: 'User browser review pending; review joins are deliberately retained' },
      suggestedNames: actualNames(suggestion.order),
      reverseInputSuggestedNames: actualNames(reversed.order),
      compactLogLines: compactLog.split('\n').length,
      ...summary,
    };
    return { report, canvas: renderStitch(plan), compactLog };
  } finally {
    inputs.forEach(releaseImage);
  }
}
