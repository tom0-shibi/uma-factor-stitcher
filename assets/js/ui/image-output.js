// Encode the final, post-crop canvas at its intrinsic size, never the CSS preview size.
export function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    if (!canvas?.width || !canvas?.height) return reject(new Error('結合画像がありません。'));
    canvas.toBlob(blob => {
      if (!blob || blob.type !== 'image/png') reject(new Error('PNG画像を生成できませんでした。'));
      else resolve(blob);
    }, 'image/png');
  });
}

export function pngFilename(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `uma-factor-stitcher-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.png`;
}

export function downloadPng(blob, { doc = document, urls = URL, later = setTimeout } = {}) {
  const url = urls.createObjectURL(blob);
  const link = doc.createElement('a');
  try {
    link.href = url;
    link.download = pngFilename();
    doc.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Give the browser time to consume the download before releasing its URL.
    later(() => urls.revokeObjectURL(url), 60000);
  }
}

export function installImageOutput({ saveButton, copyButton, status,
  clipboard = globalThis.navigator?.clipboard, Item = globalThis.ClipboardItem,
  secure = globalThis.isSecureContext, download = downloadPng }) {
  let current = null;
  const supported = secure === true && typeof clipboard?.write === 'function'
    && typeof Item === 'function' && (!Item.supports || Item.supports('image/png'));
  const unavailable = '画像コピーはこの環境では利用できません。PNG保存をご利用ください。';
  function refresh() {
    saveButton.disabled = !current || current.busy;
    copyButton.disabled = !current || current.busy || !supported;
  }
  function setCanvas(canvas) {
    current = canvas ? { canvas, blob: null, busy: false } : null;
    status.textContent = canvas && !supported ? unavailable : '';
    refresh();
  }
  function png(state) {
    if (!state.blob) state.blob = canvasToPng(state.canvas).catch(error => { state.blob = null; throw error; });
    return state.blob;
  }
  async function perform(kind) {
    const state = current;
    if (!state || state.busy) return;
    if (kind === 'copy' && !supported) { status.textContent = unavailable; return; }
    state.busy = true;
    refresh();
    status.textContent = kind === 'copy' ? '画像をコピーしています…' : 'PNGを準備しています…';
    try {
      const blob = png(state);
      if (kind === 'copy') {
        // Invoke write during the click activation (Safari also accepts a Blob promise).
        // Observe both promises even if ClipboardItem construction/write throws early.
        let write;
        try { write = clipboard.write([new Item({ 'image/png': blob })]); }
        catch (error) { write = Promise.reject(error); }
        await Promise.all([blob, write]);
      } else {
        const encoded = await blob;
        if (current !== state) return;
        download(encoded);
      }
      if (current === state) status.textContent = kind === 'copy'
        ? '画像をコピーしました。' : 'PNGのダウンロードを開始しました。';
    } catch {
      if (current === state) status.textContent = kind === 'copy'
        ? '画像をコピーできませんでした。PNG保存をご利用ください。'
        : 'PNGを保存できませんでした。もう一度お試しください。';
    } finally {
      state.busy = false;
      refresh();
    }
  }
  saveButton.addEventListener('click', () => { void perform('save'); });
  copyButton.addEventListener('click', () => { void perform('copy'); });
  setCanvas(null);
  return { setCanvas, save: () => perform('save'), copy: () => perform('copy') };
}
