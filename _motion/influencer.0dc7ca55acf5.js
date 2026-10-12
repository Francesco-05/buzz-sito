/* A voluntary, progressively enhanced dialog. The contact link works without JS. */
(() => {
  const dialog = document.querySelector('#influencer-dialog');
  const trigger = document.querySelector('[data-influencer-open]');
  const fallback = document.querySelector('[data-influencer-fallback]');
  if (!dialog || !trigger || !fallback || typeof dialog.showModal !== 'function' || dialog.dataset.ready) return;
  const closeButton = dialog.querySelector('[data-influencer-close]');
  const contact = dialog.querySelector('[data-influencer-contact]');
  if (!closeButton || !contact) return;
  const root = document.documentElement;
  let savedOverflow = null;
  let returnFocus = true;
  let pointerOutside = false;
  const unlock = () => {
    if (!savedOverflow) return;
    for (const [element, value, priority] of savedOverflow) {
      if (value) element.style.setProperty('overflow', value, priority);
      else element.style.removeProperty('overflow');
    }
    savedOverflow = null;
  };
  const finish = () => {
    if (dialog.open) return;
    unlock();
    if (returnFocus) trigger.focus({ preventScroll: true });
  };
  const close = () => {
    if (!dialog.open) return;
    dialog.close();
    // Restore scrolling before an anchor's default navigation runs.
    unlock();
  };
  trigger.addEventListener('click', () => {
    if (dialog.open || document.querySelector('dialog[open]')) return;
    returnFocus = true;
    try {
      dialog.showModal();
      savedOverflow = [root, document.body].map(el => [el, el.style.getPropertyValue('overflow'), el.style.getPropertyPriority('overflow')]);
      root.style.setProperty('overflow', 'hidden');
      document.body.style.setProperty('overflow', 'hidden');
      dialog.scrollTop = 0;
      closeButton.focus({ preventScroll: true });
    } catch {
      returnFocus = false;
      unlock();
      if (dialog.open) dialog.close();
      trigger.hidden = true;
      fallback.hidden = false;
      fallback.focus({ preventScroll: true });
    }
  });
  closeButton.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', finish);
  const isOutside = event => {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  dialog.addEventListener('pointerdown', event => { pointerOutside = event.target === dialog && isOutside(event); });
  dialog.addEventListener('click', event => {
    if (pointerOutside && event.target === dialog && isOutside(event)) close();
    pointerOutside = false;
  });
  contact.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    returnFocus = false;
    close();
    const heading = document.querySelector('#contact-title');
    if (heading) {
      // Keep the focus at the destination, without interrupting native anchor scrolling.
      const previous = heading.getAttribute('tabindex');
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
      heading.addEventListener('blur', () => {
        if (previous === null) heading.removeAttribute('tabindex');
        else heading.setAttribute('tabindex', previous);
      }, { once: true });
    }
  });
  window.addEventListener('pagehide', () => { returnFocus = false; close(); unlock(); });
  dialog.dataset.ready = 'true';
  trigger.hidden = false;
  fallback.hidden = true;
})();
