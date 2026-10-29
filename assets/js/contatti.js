(() => {
  'use strict';
  const form = document.querySelector('[data-buzz-form]');
  if (!form || form.dataset.contactBound === 'true') return;
  form.dataset.contactBound = 'true';
  const button = form.querySelector('button[type="submit"]');
  const label = button.querySelector('[data-submit-label]');
  const feedback = form.querySelector('.form-feedback');
  const startedAt = Date.now();
  let sending = false;
  // An uncertain request keeps its exact payload and token until resolved.
  let pending = null;
  const readFields = () => Object.fromEntries(new FormData(form));
  const verificationMessage = 'La prima richiesta potrebbe essere già arrivata. Non possiamo confermarla automaticamente: verifica con il team BUZZ prima di reinviarla. I dati restano nel modulo.';
  function show(message, kind) {
    const paragraph = document.createElement('p');
    paragraph.className = 'feedback-' + kind;
    paragraph.textContent = message;
    if (kind === 'error') paragraph.setAttribute('role', 'alert');
    feedback.replaceChildren(paragraph);
  }
  // Same rule as buzz-api/contact.php: an Italian mobile has 9-10 digits and starts with 3, a landline starts with 0;
  // foreign numbers need the international prefix. A missing digit is the usual reason a contact cannot be reached.
  const phone = form.querySelector('[name="phone"]');
  const phoneMessage = 'Controlla il numero: un cellulare italiano ha 10 cifre (es. 333 123 4567).';
  function phoneLooksRight(value) {
    let digits = value.replace(/\D/g, '');
    const international = /^\s*(\+|00)/.test(value);
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (international && !digits.startsWith('39')) return digits.length >= 8 && digits.length <= 15;
    if (international || (digits.startsWith('39') && digits.length > 10)) digits = digits.slice(2);
    return /^3\d{8,9}$/.test(digits) || /^0\d{5,10}$/.test(digits);
  }
  if (phone) phone.addEventListener('input', () => phone.setCustomValidity(''));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (phone) phone.setCustomValidity(phone.value.trim() === '' || phoneLooksRight(phone.value) ? '' : phoneMessage);
    if (pending?.needsVerification) {
      show(verificationMessage, 'error');
      return;
    }
    if (sending || !form.reportValidity()) return;
    const endpoint = form.dataset.contactEndpoint;
    if (form.dataset.contactReady !== 'true' || !endpoint) {
      show('Il modulo è in anteprima. Nessuna richiesta è stata inviata e nessun dato è stato salvato.', 'preview');
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
        if (!challenge.ok || issued.ok !== true || typeof issued.token !== 'string') throw new Error('Contact service unavailable');
        request.token = issued.token;
      }
      posted = true;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request.fields, startedAt, token: request.token }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result || typeof result !== 'object' || result.ok !== true) {
        const rejected = (response.status >= 400 && response.status < 500) || result?.code === 'token';
        // The endpoint returns 429 only after checking the original request ID.
        // Other rejections may happen before that lookup and cannot resolve a lost response.
        const checkedOriginal = response.status === 429 && result?.ok === false && result?.code !== 'token';
        if (request.uncertain && rejected && !checkedOriginal) request.needsVerification = true;
        else if (rejected) pending = null;
        if ([422, 429].includes(response.status) && typeof result?.message === 'string' && result.message.length <= 300) errorMessage = result.message;
        if (result?.code === 'token') errorMessage = 'La sessione del modulo è scaduta. Riprova: i dati restano nel modulo.';
        throw new Error('Delivery not confirmed');
      }
      pending = null;
      if (JSON.stringify(readFields()) !== request.signature) {
        sending = false;
        button.disabled = false;
        label.textContent = 'Invia le modifiche';
        show('La richiesta iniziale è arrivata. Le modifiche che hai fatto sono ancora nel modulo e non sono state inviate. Puoi inviarle con il pulsante qui sopra.', 'notice');
      } else {
        form.reset();
        label.textContent = 'Richiesta ricevuta';
        show('Grazie! La tua richiesta è arrivata. Ti scriviamo a breve su WhatsApp: controlla anche la tua email.', 'success');
      }
    } catch {
      if (!posted) pending = null;
      else if (pending === request) request.uncertain = true;
      sending = false;
      button.disabled = request.needsVerification;
      label.textContent = request.needsVerification ? 'Invio da verificare' : 'Parliamo del tuo brand';
      show(request.needsVerification ? verificationMessage : errorMessage, 'error');
    } finally {
      clearTimeout(timeout);
    }
  });
  button.disabled = false;
  button.removeAttribute('aria-disabled');
  button.removeAttribute('tabindex');
  button.removeAttribute('data-disabled');
})();
