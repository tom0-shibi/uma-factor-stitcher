// Compact report contains selected joins only; all-pairs diagnostics stay separate.
export function buildDebugLog(frames, connections, suggestion, plan, inputOrder) {
  return {
    frames: frames.map(({ id, name, sourceWidth, sourceHeight, environment, factorRegion, analysisRegion, confidence, regionStatus, regionEvidence }) => ({
      id, name, width: sourceWidth, height: sourceHeight, environment, factorRegion, analysisRegion,
      regionConfidence: confidence, regionStatus, regionEvidence,
    })),
    selectedJoins: connections.map((pair, index) => ({
      fromId: pair.fromId, toId: pair.toId, kind: pair.kind,
      adopted: plan.segments[index + 1].adopted,
      overlapHeight: pair.overlapHeight, offsetY: pair.offsetY,
      score: pair.score, secondBestScore: pair.secondBestScore,
      confidence: pair.confidence, status: pair.status,
    })),
    inputOrder,
    suggestedOrder: suggestion.order,
    finalOrder: frames.map((frame) => frame.id),
    preview: { width: plan.width, height: plan.height, fixedUiOnce: plan.commonBand },
  };
}

// One object per line keeps an eight-frame report readable and directly parseable as JSON.
export function formatDebugLog(report) {
  return '{\n' + Object.entries(report).map(([key, value]) => {
    if (['frames', 'selectedJoins'].includes(key)) {
      return `  "${key}": [\n${value.map((item) => '    ' + JSON.stringify(item)).join(',\n')}\n  ]`;
    }
    return `  "${key}": ${JSON.stringify(value)}`;
  }).join(',\n') + '\n}';
}

// Report both clipboard success and failure; never silently claim a successful copy.
export function installDebugCopy(button, log, status, clipboard = navigator.clipboard) {
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      if (!log.textContent) throw new Error('empty log');
      if (!clipboard?.writeText) throw new Error('clipboard unavailable');
      await clipboard.writeText(log.textContent);
      status.textContent = 'ログをコピーしました。';
    } catch {
      status.textContent = 'コピーできませんでした。下のログを選択してコピーしてください。';
    } finally {
      button.disabled = false;
    }
  });
}
