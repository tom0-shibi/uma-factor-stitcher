const REGISTRATIONS = new WeakMap();
let nextPasteId = 0;

// Replace an existing listener on this target, even if initialization is repeated.
export function installClipboardInput(target, onFiles) {
  REGISTRATIONS.get(target)?.();
  const listener = (event) => {
    const files = Array.from(event.clipboardData?.items || [])
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean)
      .map((file) => new File([file], `clipboard-${++nextPasteId}.${file.type.split('/')[1]}`, { type: file.type }));
    if (files.length) {
      event.preventDefault();
      onFiles(files);
    }
  };
  target.addEventListener('paste', listener);
  const cleanup = () => {
    target.removeEventListener('paste', listener);
    if (REGISTRATIONS.get(target) === cleanup) REGISTRATIONS.delete(target);
  };
  REGISTRATIONS.set(target, cleanup);
  return cleanup;
}
