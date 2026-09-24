const MANIFEST_URL = new URL('../../../tests/fixtures/continuous-scroll/manifest.json', import.meta.url);

// Fetch only on demand and return ordinary Files for the shared decode pipeline.
export async function loadDebugFixtureFiles(fetchFile = fetch) {
  const manifestResponse = await fetchFile(MANIFEST_URL);
  if (!manifestResponse.ok) throw new Error('デバッグ画像の一覧を読み込めません。');
  const manifest = await manifestResponse.json();
  const names = manifest.expectedInputOrder;
  if (!Array.isArray(names) || names.length !== manifest.expectedFrameCount
    || !names.every((name) => typeof name === 'string' && /^[a-zA-Z0-9_-]+\.jpg$/.test(name))) {
    throw new Error('デバッグ画像の一覧が不正です。');
  }
  // Promise.all preserves manifest order even when individual downloads finish out of order.
  return Promise.all(names.map(async (name) => {
    const response = await fetchFile(new URL(name, MANIFEST_URL));
    if (!response.ok) throw new Error(`${name}: デバッグ画像を読み込めません。`);
    return new File([await response.blob()], name, { type: 'image/jpeg' });
  }));
}
