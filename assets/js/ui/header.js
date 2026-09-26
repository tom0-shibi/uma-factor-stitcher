// Header-only interactions; independent of Stitch Core and portable to other UmaTool pages.
export function initializeHeader(doc = document) {
  const openButton = doc.getElementById('usage-open');
  const backdrop = doc.getElementById('usage-modal');
  const closeButton = doc.getElementById('usage-close');
  const toolButton = doc.getElementById('tool-open');
  const menu = doc.getElementById('tool-menu');
  const switcher = toolButton.parentElement;
  const menuHome = menu.parentElement;
  const background = [doc.querySelector('.app-header'), doc.querySelector('.app-main')];
  let returnFocus;
  let priorInert = [];

  const positionMenu = () => {
    if (menu.hidden || !menu.classList.contains('tool-menu-portal')) return;
    const rect = toolButton.getBoundingClientRect();
    const viewportWidth = doc.defaultView?.innerWidth ?? 0;
    const gap = 8;
    const width = Math.min(330, Math.max(0, viewportWidth - 32));
    const left = Math.min(Math.max(16, rect.left), Math.max(16, viewportWidth - width - 16));
    menu.style.top = `${rect.bottom + gap}px`;
    menu.style.left = `${left}px`;
    menu.style.width = `${width}px`;
  };

  const portalMenu = () => {
    if (menu.parentElement !== doc.body) doc.body.appendChild(menu);
    menu.classList.add('tool-menu-portal');
    positionMenu();
  };

  const restoreMenu = () => {
    menu.classList.remove('tool-menu-portal');
    menu.removeAttribute('style');
    if (menu.parentElement !== menuHome) menuHome.appendChild(menu);
  };

  const closeMenu = () => {
    menu.hidden = true;
    toolButton.setAttribute('aria-expanded', 'false');
    restoreMenu();
  };

  const isInToolSwitcher = target => switcher.contains(target) || menu.contains(target);

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
    if (menu.hidden) {
      menu.hidden = false;
      portalMenu();
      toolButton.setAttribute('aria-expanded', 'true');
    } else {
      closeMenu();
    }
  });

  const toolLink = menu.querySelector?.('a[href]');
  if (toolLink) {
    toolLink.addEventListener('click', event => {
      if (toolLink.target === '_blank') {
        event.preventDefault();
        doc.defaultView?.open(toolLink.href, '_blank', 'noopener,noreferrer');
      }
      closeMenu();
    });
  }

  doc.addEventListener('click', event => { if (!isInToolSwitcher(event.target)) closeMenu(); });
  doc.addEventListener('focusin', event => { if (!isInToolSwitcher(event.target)) closeMenu(); });
  doc.defaultView?.addEventListener('resize', positionMenu);
  doc.defaultView?.addEventListener('scroll', positionMenu, true);

  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!backdrop.hidden) { event.preventDefault(); close(); }
      else if (!menu.hidden) { event.preventDefault(); closeMenu(); toolButton.focus(); }
    }
    if (event.key === 'Tab' && !backdrop.hidden) { event.preventDefault(); closeButton.focus(); }
  });
}
if (typeof document !== 'undefined') initializeHeader();
