// Header-only interactions; independent of Stitch Core and portable to other UmaTool pages.
export function initializeHeader(doc = document) {
  const openButton = doc.getElementById('usage-open');
  const backdrop = doc.getElementById('usage-modal');
  const closeButton = doc.getElementById('usage-close');
  const toolButton = doc.getElementById('tool-open');
  const menu = doc.getElementById('tool-menu');
  const switcher = toolButton.parentElement;
  const background = [doc.querySelector('.app-header'), doc.querySelector('.app-main')];
  let returnFocus;
  let priorInert = [];
  const closeMenu = () => {
    menu.hidden = true;
    toolButton.setAttribute('aria-expanded', 'false');
  };
  const close = () => {
    if (backdrop.hidden) return;
    backdrop.hidden = true;
    doc.body.classList.remove('usage-modal-open');
    background.forEach((element, index) => { element.inert = priorInert[index]; });
    openButton.setAttribute('aria-expanded', 'false');
    (returnFocus?.isConnected ? returnFocus : openButton).focus();
  };
  openButton.addEventListener('click', () => {
    closeMenu();
    returnFocus = doc.activeElement;
    priorInert = background.map(element => element.inert);
    background.forEach(element => { element.inert = true; });
    backdrop.hidden = false;
    doc.body.classList.add('usage-modal-open');
    openButton.setAttribute('aria-expanded', 'true');
    closeButton.focus();
  });
  closeButton.addEventListener('click', close);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  toolButton.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    toolButton.setAttribute('aria-expanded', String(!menu.hidden));
  });
  doc.addEventListener('click', event => { if (!switcher.contains(event.target)) closeMenu(); });
  doc.addEventListener('focusin', event => { if (!switcher.contains(event.target)) closeMenu(); });
  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!backdrop.hidden) { event.preventDefault(); close(); }
      else if (!menu.hidden) { event.preventDefault(); closeMenu(); toolButton.focus(); }
    }
    // The close button is the sole interactive element in the informational modal.
    if (event.key === 'Tab' && !backdrop.hidden) { event.preventDefault(); closeButton.focus(); }
  });
}
if (typeof document !== 'undefined') initializeHeader();
