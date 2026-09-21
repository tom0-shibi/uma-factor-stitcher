const STATUS_LABELS = { confirmed: '✓ 確定', review: '要確認', unresolved: '未解決' };

// Use textContent for user-controlled filenames and diagnostics.
export function renderFrames(frames, onMove, onRemove, busy) {
  const list = document.querySelector('#frame-list');
  list.replaceChildren();
  document.querySelector('#frame-count').textContent = `${frames.length}枚`;
  frames.forEach((frame, index) => {
    const row = document.createElement('li');
    row.className = 'frame';
    const thumbnail = document.createElement('img');
    thumbnail.src = frame.url;
    thumbnail.alt = `${index + 1}: ${frame.name}`;
    const info = document.createElement('div');
    info.className = 'frame-info';
    info.textContent = `${index + 1}. ${frame.name}`;
    const size = document.createElement('small');
    size.textContent = `${frame.sourceWidth} × ${frame.sourceHeight}`;
    info.append(size);
    const actions = document.createElement('div');
    actions.className = 'frame-actions';
    for (const [label, callback, disabled] of [
      ['↑', () => onMove(index, -1), index === 0],
      ['↓', () => onMove(index, 1), index === frames.length - 1],
      ['削除', () => onRemove(index), false],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('aria-label', `${index + 1}枚目 ${label === '↑' ? '上へ移動' : label === '↓' ? '下へ移動' : '削除'}`);
      button.disabled = busy || disabled;
      button.addEventListener('click', callback);
      actions.append(button);
    }
    row.append(thumbnail, info, actions);
    list.append(row);
  });
}

// Display the current manual order and a separate, opt-in automatic candidate.
export function renderResults(frames, pairs, connections, suggestion, plan, canvas) {
  const name = (id) => {
    const index = frames.findIndex((frame) => frame.id === id);
    return `画像${index + 1} (${frames[index].name})`;
  };
  document.querySelector('#results').hidden = false;
  document.querySelector('#result-summary').textContent = `入力画像: ${frames.length}枚 / 結合サイズ: ${plan.width} × ${plan.height}`;
  document.querySelector('#order-note').textContent = `自動順序候補: ${suggestion.order.map(name).join(' → ')}（確定接続 ${suggestion.connected}件）`;
  document.querySelector('#apply-order').hidden = suggestion.order.every((id, index) => id === frames[index].id);
  const list = document.querySelector('#connections');
  list.replaceChildren();
  connections.forEach((pair, index) => {
    const row = document.createElement('li');
    row.className = pair.status;
    row.textContent = `${name(pair.fromId)} → ${name(pair.toId)}: ${STATUS_LABELS[pair.status]} / 結合位置 y=${plan.segments[index + 1].y}px`;
    row.title = pair.reason;
    list.append(row);
  });
  document.querySelector('#preview').replaceChildren(canvas);
  document.querySelector('#debug').textContent = JSON.stringify({
    frames: frames.map(({ id, sourceWidth, sourceHeight, environment, gameRegion, factorRegion, analysisRegion, confidence, regionStatus }) => ({
      id, sourceWidth, sourceHeight, environment, gameRegion, factorRegion, analysisRegion, confidence, regionStatus,
    })),
    candidatePairs: pairs,
    finalOrder: frames.map((frame) => frame.id),
    suggestedOrder: suggestion.order,
  }, null, 2);
}
