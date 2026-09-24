const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
let nextImageId = 0;

// Decode locally and retain the original image for final rendering.
export async function decodeImage(file) {
  if (!SUPPORTED_TYPES.has(file.type)) throw new Error(`${file.name}: PNG / JPEG / WebP を選んでください。`);
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('empty image');
    return {
      id: `frame-${++nextImageId}`,
      name: file.name || `clipboard-${nextImageId}.png`,
      url,
      sourceImage: image,
      sourceWidth: image.naturalWidth,
      sourceHeight: image.naturalHeight,
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(`${file.name || '画像'}: 画像を読み込めませんでした。`);
  }
}

// Release the thumbnail and original source when the image is removed.
export function releaseImage(frame) {
  URL.revokeObjectURL(frame.url);
}

// Use one registration for file selection and drop; return explicit cleanup.
export function installImageInput(input, dropZone, onFiles) {
  const controller = new AbortController();
  const options = { signal: controller.signal };
  input.addEventListener('change', () => {
    onFiles(Array.from(input.files));
    input.value = '';
  }, options);
  for (const type of ['dragenter', 'dragover']) {
    dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      dropZone.classList.add('dragging');
    }, options);
  }
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'), options);
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('dragging');
    onFiles(Array.from(event.dataTransfer.files));
  }, options);
  return () => controller.abort();
}

// Move one registered image without changing identity, including identical files.
export function moveImage(frames, index, direction) {
  const next = index + direction;
  if (!Number.isInteger(index) || ![-1, 1].includes(direction) || index < 0 || index >= frames.length || next < 0 || next >= frames.length) return false;
  [frames[index], frames[next]] = [frames[next], frames[index]];
  return true;
}

// Remove exactly one registration, leaving intentionally duplicated images intact.
export function removeImage(frames, index) {
  if (!Number.isInteger(index) || index < 0 || index >= frames.length) return null;
  return frames.splice(index, 1)[0];
}
