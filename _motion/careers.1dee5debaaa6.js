(() => {
  'use strict';
  const section = document.querySelector('[data-contact-section]');
  if (!section || section.dataset.pathwayBound) return;
  section.dataset.pathwayBound = 'true';
  const tabs = [...section.querySelectorAll('[data-contact-mode]')];
  const modeFromUrl = () => new URLSearchParams(location.search).get('percorso') === 'lavora-con-noi' ? 'careers' : 'brand';
  function activate(mode, updateUrl = false) {
    for (const tab of tabs) {
      const selected = tab.dataset.contactMode === mode;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    }
    for (const copy of section.querySelectorAll('[data-contact-copy]')) copy.hidden = copy.dataset.contactCopy !== mode;
    section.setAttribute('aria-labelledby', mode === 'careers' ? 'careers-title' : 'contact-title');
    if (updateUrl) {
      const url = new URL(location.href);
      if (mode === 'careers') url.searchParams.set('percorso', 'lavora-con-noi');
      else url.searchParams.delete('percorso');
      // Replacing the URL preserves the reader's scroll position and other campaign parameters.
      url.hash = 'contatti';
      history.replaceState(history.state, '', url);
    }
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab.dataset.contactMode, true));
    tab.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') target = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = tabs.length - 1;
      if (target === undefined) return;
      event.preventDefault();
      activate(tabs[target].dataset.contactMode, true);
      tabs[target].focus({ preventScroll: true });
    });
  });
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest('a');
    if (!anchor) return;
    if (anchor.hasAttribute('data-careers-link')) {
      event.preventDefault();
      activate('careers', true);
      section.scrollIntoView({ behavior: 'instant', block: 'start' });
      tabs.find(tab => tab.dataset.contactMode === 'careers').focus({ preventScroll: true });
    } else if (anchor.getAttribute('href') === '#contatti') activate('brand', true);
  });
  section.querySelectorAll('[data-careers-role]').forEach(button => {
    button.addEventListener('click', () => {
      const role = section.querySelector('[name="role"]');
      role.value = button.dataset.careersRole;
      role.dispatchEvent(new Event('change', { bubbles: true }));
      section.querySelector('#career-name').focus();
    });
  });
  window.addEventListener('popstate', () => activate(modeFromUrl()));
  activate(modeFromUrl());
})();

(() => {
  'use strict';
  const form = document.querySelector('[data-careers-form]');
  if (!form || form.dataset.careersBound) return;
  form.dataset.careersBound = 'true';
  const button = form.querySelector('button[type="submit"]');
  const label = button.querySelector('[data-careers-submit-label]');
  const feedback = form.querySelector('.form-feedback');
  const portfolio = form.elements.namedItem('portfolio');
  const startedAt = Date.now();
  let sending = false;
  let pending = null;
  const readFields = () => Object.fromEntries(new FormData(form));
  const verificationMessage = 'L’invio potrebbe essere già avvenuto. Prima di reinviare, chiedi una verifica a info@buzzstudio.it. I dati restano nel modulo.';
  function show(message, kind) {
    const paragraph = document.createElement('p');
    paragraph.className = 'feedback-' + kind;
    paragraph.textContent = message;
    if (kind === 'error') paragraph.setAttribute('role', 'alert');
    feedback.replaceChildren(paragraph);
  }
  function normalizePortfolio() {
    const value = portfolio.value.trim();
    portfolio.value = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(value) ? 'https://' + value : value;
  }
  portfolio.addEventListener('blur', normalizePortfolio);
  // Native validation is invoked explicitly, so a retry can verify the original
  // submission even if the person has since edited the visible fields.
  form.noValidate = true;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending?.needsVerification) { show(verificationMessage, 'error'); return; }
    if (sending) return;
    normalizePortfolio();
    if (!pending && !form.reportValidity()) return;
    const endpoint = form.dataset.careersEndpoint;
    if (!endpoint || !['www.buzzstudio.it', 'buzzstudio.it'].includes(location.hostname)) {
      show('Modulo in anteprima: nessuna candidatura è stata inviata.', 'preview');
      return;
    }
    if (!pending) {
      const fields = readFields();
      pending = { fields, signature: JSON.stringify(fields), token: null, uncertain: false, needsVerification: false };
    }
    const request = pending;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let posted = false;
    let errorMessage = 'Non riusciamo a confermare l’invio. Riprova tra poco: i dati restano nel modulo.';
    sending = true;
    button.disabled = true;
    label.textContent = 'Invio in corso…';
    feedback.replaceChildren();
    try {
      if (!request.token) {
        const challenge = await fetch(endpoint, { signal: controller.signal, cache: 'no-store' });
        const issued = await challenge.json();
        if (!challenge.ok || issued.ok !== true || typeof issued.token !== 'string') throw new Error('Careers unavailable');
        request.token = issued.token;
      }
      posted = true;
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request.fields, startedAt, token: request.token }), signal: controller.signal,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) {
        const rejected = response.status >= 400 && response.status < 500;
        const safeToRetry = result?.ok === false && result.safeToRetry === true;
        if (result?.needsVerification === true || (request.uncertain && rejected && !safeToRetry)) request.needsVerification = true;
        else if (safeToRetry || (rejected && !request.uncertain)) pending = null;
        if (typeof result?.message === 'string' && result.message.length <= 300) errorMessage = result.message;
        throw new Error('Submission not confirmed');
      }
      pending = null;
      if (JSON.stringify(readFields()) !== request.signature) {
        sending = false;
        button.disabled = false;
        label.textContent = 'Invia le modifiche';
        show('La candidatura iniziale è stata inviata. Le modifiche sono ancora nel modulo e non sono state inviate.', 'notice');
      } else {
        form.reset();
        label.textContent = 'Candidatura inviata';
        show('Grazie! La tua candidatura è stata inviata al team BUZZ. Se il profilo è in linea con la ricerca, ti ricontatteremo.', 'success');
      }
    } catch {
      if (!posted) pending = null;
      else if (pending === request) request.uncertain = true;
      sending = false;
      button.disabled = request.needsVerification;
      label.textContent = request.needsVerification ? 'Invio da verificare' : 'Invia la candidatura';
      show(request.needsVerification ? verificationMessage : errorMessage, 'error');
    } finally { clearTimeout(timeout); }
  });
  button.disabled = false;
  button.removeAttribute('aria-disabled');
  button.removeAttribute('tabindex');
  button.removeAttribute('data-disabled');
})();
