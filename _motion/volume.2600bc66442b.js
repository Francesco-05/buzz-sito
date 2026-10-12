/* Visual volume entry. Session-only preference; no audio or network requests. */
(() => {
  const gate = document.querySelector('[data-volume-gate]');
  const range = document.querySelector('[data-volume-range]');
  const skip = document.querySelector('[data-volume-skip]');
  const replay = document.querySelector('[data-volume-replay]');
  const bridge = document.querySelector('[data-volume-bridge]');
  if (!gate || !range || !skip || typeof gate.showModal !== 'function' || gate.dataset.ready) return;
  const preview = Boolean(document.querySelector('[data-volume-preview]'));
  const sessionKey = 'buzz:volume-entry:v2';
  const rememberEntry = () => {
    if (preview) return;
    try { window.sessionStorage.setItem(sessionKey, 'entered'); } catch { /* Entry remains available if storage is full or disabled. */ }
  };
  if (!preview) {
    try {
      if (window.sessionStorage.getItem(sessionKey) === 'entered') return;
    } catch { return; } // A blocked preference must never block access to the site.
    if (window.location.hash) { rememberEntry(); return; }
  }
  const number = gate.querySelector('[data-volume-number]');
  const bars = Array.from(gate.querySelectorAll('[data-volume-bar]'));
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  let closing = false;
  let active = false;
  let cycle = 0;
  let transition;
  let timeout;
  let oldOverflow = '';
  let oldPriority = '';
  let previousFocus;
  let hasEntered = false;
  const update = () => {
    const level = Math.max(0, Math.min(100, Number(range.value) || 0));
    range.value = String(level);
    gate.style.setProperty('--volume', String(level / 100));
    if (number) number.textContent = String(level).padStart(2, '0');
    range.setAttribute('aria-valuetext', `${level} su 100${level === 100 ? '. Rilascia per entrare.' : ''}`);
    bars.forEach((bar, index) => bar.classList.toggle('is-lit', index < Math.ceil(level / 100 * bars.length)));
  };
  const restore = () => {
    // close is asynchronous in browsers: clean up synchronously from finish too.
    // An old close event must never affect a newly opened replay.
    if (!active || gate.open) return;
    active = false;
    cycle++;
    clearTimeout(timeout);
    transition?.cancel();
    transition = undefined;
    if (bridge) bridge.hidden = true;
    if (oldOverflow) root.style.setProperty('overflow', oldOverflow, oldPriority);
    else root.style.removeProperty('overflow');
    gate.classList.remove('is-unlocking');
    delete gate.dataset.revealing;
    closing = false;
    if (replay) replay.hidden = false;
    const target = hasEntered ? previousFocus : document.querySelector('#hero-title');
    if (target instanceof HTMLElement && target.isConnected) {
      const oldTabindex = target.getAttribute('tabindex');
      if (!hasEntered) {
        target.setAttribute('tabindex', '-1');
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        target.addEventListener('blur', () => {
          if (oldTabindex === null) target.removeAttribute('tabindex');
          else target.setAttribute('tabindex', oldTabindex);
        }, { once: true });
      }
      target.focus({ preventScroll: true });
    }
    hasEntered = true;
  };
  const finish = () => {
    clearTimeout(timeout);
    if (gate.open) gate.close();
    restore();
  };
  const unlock = immediate => {
    if (!gate.open) return;
    rememberEntry();
    if (immediate || reduced?.matches || typeof gate.animate !== 'function') { finish(); return; }
    if (closing) return;
    closing = true;
    const currentCycle = cycle;
    const finishCurrent = () => { if (cycle === currentCycle) finish(); };
    gate.classList.add('is-unlocking');
    gate.dataset.revealing = 'true';
    if (bridge) bridge.hidden = false;
    gate.dispatchEvent(new Event('buzz:volume-reveal'));
    try {
      // Keep the header visible and clickable throughout the horizontal reveal.
      const headerBottom = Math.max(0, gate.querySelector('.volume-header')?.getBoundingClientRect().bottom || 0) + 16;
      transition = gate.animate([
        { clipPath: `polygon(0 0, 100% 0, 100% ${headerBottom}px, 100% ${headerBottom}px, 100% 100%, 0 100%)` },
        { clipPath: `polygon(0 0, 100% 0, 100% ${headerBottom}px, 0 ${headerBottom}px, 0 100%, 0 100%)` },
      ], { duration: 720, delay: 60, easing: 'cubic-bezier(.65,0,.2,1)', fill: 'forwards' });
      transition.finished.then(finishCurrent).catch(finishCurrent);
    } catch { finish(); return; }
    // Escape and the direct entry remain immediate even during the reveal.
    timeout = setTimeout(finishCurrent, 900);
  };
  const open = () => {
    if (gate.open) return;
    previousFocus = document.activeElement;
    oldOverflow = root.style.getPropertyValue('overflow');
    oldPriority = root.style.getPropertyPriority('overflow');
    range.value = '0';
    update();
    active = true;
    cycle++;
    try {
      gate.showModal();
      gate.scrollTop = 0;
      root.style.setProperty('overflow', 'hidden');
      if (replay) replay.hidden = true;
      const rect = range.getBoundingClientRect();
      const focusTarget = rect.top >= 0 && rect.bottom <= window.innerHeight ? range : skip;
      focusTarget.focus({ preventScroll: true });
    } catch { finish(); }
  };
  gate.dataset.ready = 'true';
  gate.addEventListener('close', restore);
  gate.addEventListener('cancel', event => { event.preventDefault(); unlock(true); });
  range.addEventListener('input', update);
  range.addEventListener('change', () => { update(); if (Number(range.value) === 100) unlock(false); });
  skip.addEventListener('click', () => unlock(true));
  replay?.addEventListener('click', open);
  reduced?.addEventListener?.('change', () => { if (closing && reduced.matches) finish(); });
  window.addEventListener('pagehide', finish);
  open();
})();
