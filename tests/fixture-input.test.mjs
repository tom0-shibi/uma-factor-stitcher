import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadDebugFixtureFiles } from '../assets/js/input/debug-fixture-input.js';

const FIXTURE_ROOT = new URL('./fixtures/continuous-scroll/', import.meta.url);
const MANIFEST = JSON.parse(await readFile(new URL('manifest.json', FIXTURE_ROOT), 'utf8'));

// Local file responses exercise the real fixture loader without a server or dependencies.
async function fetchFixture(url) {
  const filename = new URL(url).pathname.split('/').at(-1);
  return new Response(await readFile(new URL(filename, FIXTURE_ROOT)));
}

// Image hashes verify exact supplied bytes; no inferred offsets become ground truth.
test('eight supplied images have the declared order and unchanged content', async () => {
  const files = await loadDebugFixtureFiles(fetchFixture);
  assert.equal(files.length, 8);
  assert.equal(files.length, MANIFEST.expectedFrameCount);
  assert.deepEqual(files.map((file) => file.name), Array.from({ length: 8 }, (_, i) => `IMG_${8806 + i}.jpg`));
  assert.equal(MANIFEST.joinOffsets, null);
  for (const [index, file] of files.entries()) {
    assert.ok(file instanceof File);
    assert.equal(file.type, 'image/jpeg');
    const bytes = Buffer.from(await file.arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'), MANIFEST.images[index].sha256);
  }
});

// A failed response rejects the entire batch instead of silently loading seven frames.
test('missing image and manifest failures reject fixture loading', async () => {
  await assert.rejects(() => loadDebugFixtureFiles(async (url) => String(url).endsWith('IMG_8809.jpg')
    ? new Response('', { status: 404 }) : fetchFixture(url)), /IMG_8809/);
  await assert.rejects(() => loadDebugFixtureFiles(async () => new Response('', { status: 404 })), /一覧/);
});

// The manifest provides local filenames only; it cannot redirect image requests elsewhere.
test('invalid counts and external paths are rejected before image requests', async () => {
  for (const manifest of [
    { expectedFrameCount: 8, expectedInputOrder: ['IMG_8806.jpg'] },
    { expectedFrameCount: 1, expectedInputOrder: ['https://example.com/image.jpg'] },
  ]) {
    let calls = 0;
    await assert.rejects(() => loadDebugFixtureFiles(async () => {
      calls++;
      return Response.json(manifest);
    }), /不正/);
    assert.equal(calls, 1);
  }
});
