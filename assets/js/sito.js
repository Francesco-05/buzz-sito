/* =========================================================================
   BUZZ — movimento e interazioni del sito pubblico.
   JavaScript semplice, senza librerie. Il sito resta leggibile anche senza
   questo file: qui si aggiungono solo effetti, ingresso e lettore video.
   ========================================================================= */
(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('js');

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  // Stato condiviso dal ciclo di animazione
  const state = {
    scrollY: scrollY, lastScrollY: scrollY, scrollVelocity: 0,
    vw: innerWidth, vh: innerHeight,
    pointerX: innerWidth / 2, pointerY: innerHeight / 2, pointerSpeed: 0,
    energy: 0, // "volume" della pagina: cresce con il movimento e si spegne da solo
  };
  const tickers = []; // funzioni chiamate a ogni fotogramma

  /* ---------- Parole che salgono una alla volta ---------- */
  $$('[data-split]').forEach((el) => {
    const words = el.textContent.trim().split(/\s+/);
    el.setAttribute('aria-label', el.textContent.trim());
    el.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${w}</span></span>`).join(' ');
  });
  // "VOLUME.": le lettere salgono una dopo l'altra, subito dopo "Alza il"
  $$('[data-split-letters]').forEach((el) => {
    const text = el.textContent.trim();
    el.setAttribute('aria-label', text);
    el.innerHTML = [...text].map((c, i) => `<span class="l" aria-hidden="true"><span style="--i:${i}">${c}</span></span>`).join('');
  });

  const markReady = () => requestAnimationFrame(() => root.classList.add('is-ready'));

  /* ---------- Ingresso "Alza il volume" ---------- */
  const gate = $('[data-gate]');
  let gateSeen = false;
  try { gateSeen = sessionStorage.getItem('buzz-gate') === '1'; } catch { /* storage non disponibile */ }

  if (gate && !reducedMotion && !gateSeen) {
    const knob = $('[data-gate-knob]', gate);
    const value = $('[data-gate-value]', gate);
    const bars = $('[data-gate-bars]', gate);
    bars.innerHTML = Array.from({ length: 40 }, (_, i) => `<i style="--h:${(0.35 + 0.65 * Math.abs(Math.sin(i * 0.55)) * (0.6 + Math.random() * 0.4)).toFixed(2)}"></i>`).join('');
    gate.hidden = false;
    root.style.overflow = 'hidden';
    knob.focus({ preventScroll: true });

    let level = 0, holding = false, auto = false, pressedAt = 0, done = false, last = performance.now();
    const leave = () => {
      if (done) return;
      done = true;
      try { sessionStorage.setItem('buzz-gate', '1'); } catch { /* ignore */ }
      gate.classList.add('is-leaving');
      root.style.overflow = '';
      markReady();
      setTimeout(() => { gate.hidden = true; }, 1150);
    };
    const step = (now) => {
      if (done) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (holding || auto) level = clamp(level + dt / (auto ? 0.75 : 0.95));
      else level = clamp(level - dt / 1.4);
      gate.style.setProperty('--gate', level.toFixed(3));
      value.textContent = String(Math.round(level * 100)).padStart(2, '0');
      if (level >= 1) { setTimeout(leave, 180); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);

    knob.addEventListener('pointerdown', (e) => { holding = true; pressedAt = performance.now(); knob.setPointerCapture?.(e.pointerId); });
    const release = () => {
      if (!holding) return;
      holding = false;
      if (performance.now() - pressedAt < 260) auto = true; // un tocco veloce basta
    };
    knob.addEventListener('pointerup', release);
    knob.addEventListener('pointercancel', release);
    knob.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); auto = true; } });
    $('[data-gate-skip]', gate).addEventListener('click', leave);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') leave(); });
  } else {
    markReady();
  }

  /* ---------- Testata, barra di avanzamento ---------- */
  const header = $('[data-header]');
  const progress = $('[data-progress]');
  const lightSections = $$('[data-tone="light"]');
  const problemSticky = $('[data-problem] .problem-sticky');
  // La sezione che sta sotto la testata decide i suoi colori
  const under = (el) => { const r = el.getBoundingClientRect(); const mid = header.offsetHeight / 2; return r.top <= mid && r.bottom >= mid; };
  tickers.push(() => {
    const y = state.scrollY;
    header.classList.toggle('is-solid', y > 40);
    header.classList.toggle('is-light', lightSections.some(under));
    header.classList.toggle('is-violet', !!problemSticky && under(problemSticky) && parseFloat(problemSticky.style.getPropertyValue('--problem-bg') || 0) > .5);
    header.classList.toggle('is-hidden', y > 400 && state.scrollVelocity > 2);
    if (state.scrollVelocity < -2 || y < 400) header.classList.remove('is-hidden');
    const max = document.documentElement.scrollHeight - state.vh;
    progress.style.transform = `scaleX(${max > 0 ? clamp(y / max) : 0})`;
  });

  /* ---------- Comparsa delle parti mentre si scorre ---------- */
  const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      revealObserver.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px' }) : null;
  $$('[data-reveal]').forEach((el) => {
    const siblings = [...el.parentElement.children].filter((c) => c.hasAttribute('data-reveal'));
    el.style.transitionDelay = `${siblings.indexOf(el) * 80}ms`;
    if (revealObserver) revealObserver.observe(el); else el.classList.add('is-in');
  });

  /* ---------- Cursore personalizzato e pulsanti "magnetici" ---------- */
  if (finePointer && !reducedMotion) {
    root.classList.add('has-cursor');
    const cursor = $('.cursor');
    const dot = $('.cursor-dot', cursor);
    const ring = $('.cursor-ring', cursor);
    const label = $('[data-cursor-label]', cursor);
    let rx = state.pointerX, ry = state.pointerY;
    tickers.push(() => {
      rx = lerp(rx, state.pointerX, 0.18);
      ry = lerp(ry, state.pointerY, 0.18);
      dot.style.transform = `translate3d(${state.pointerX}px, ${state.pointerY}px, 0)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    });
    document.addEventListener('pointerover', (e) => {
      const labelled = e.target.closest('[data-cursor]');
      const link = e.target.closest('a, button, [role="tab"], summary, label');
      cursor.classList.toggle('is-label', !!labelled);
      cursor.classList.toggle('is-link', !labelled && !!link);
      label.textContent = labelled ? labelled.dataset.cursor : '';
    });
    // Fuori dalla finestra il cursore sparisce, rientrando ricompare
    root.addEventListener('mouseleave', () => cursor.classList.add('is-hidden'));
    root.addEventListener('mouseenter', () => { if (state.pointerSeen) cursor.classList.remove('is-hidden'); });

    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.25;
        const y = (e.clientY - r.top - r.height / 2) * 0.35;
        el.style.transform = `translate(${x}px, ${y}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  let lastPointerT = performance.now();
  addEventListener('pointermove', (e) => {
    const now = performance.now();
    const dist = Math.hypot(e.clientX - state.pointerX, e.clientY - state.pointerY);
    state.pointerSpeed = dist / Math.max(8, now - lastPointerT);
    lastPointerT = now;
    state.pointerX = e.clientX;
    state.pointerY = e.clientY;
    if (!state.pointerSeen) { state.pointerSeen = true; $('.cursor')?.classList.remove('is-hidden'); }
  }, { passive: true });

  /* ---------- Apertura: immagine, onde sonore, misuratore, "VOLUME." ---------- */
  const hero = $('[data-hero]');
  if (hero) {
    const sticky = $('.hero-sticky', hero);
    const image = $('[data-hero-image]', hero);
    const canvas = $('[data-waves]', hero);
    const ctx = canvas.getContext('2d');
    const meterBars = $$('[data-meter] i', hero);
    const meterValue = $('[data-meter-value]', hero);
    let heroP = 0, px = 0, py = 0;

    const sizeCanvas = () => {
      const dpr = Math.min(1.5, devicePixelRatio || 1);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    sizeCanvas();
    addEventListener('resize', sizeCanvas);

    // "VOLUME." si allarga e si ispessisce come una manopola che sale
    const volStart = performance.now() + (gate && !gate.hidden ? 1400 : 500);
    const drawWaves = (t) => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const lines = 6;
      for (let l = 0; l < lines; l++) {
        const amp = (14 + l * 9) * (0.35 + state.energy * 1.6);
        const freq = 0.0016 + l * 0.0007;
        const speed = 0.00035 + l * 0.00012;
        const yBase = h * (0.5 + (l - lines / 2) * 0.045) + py * 0.6;
        ctx.beginPath();
        for (let x = -10; x <= w + 10; x += 12) {
          const dx = (x - state.pointerX) / w;
          const focus = Math.exp(-dx * dx * 9) * (0.6 + state.energy * 2.2);
          const y = yBase + Math.sin(x * freq + t * speed * (l + 1) + l) * amp * (0.5 + focus) + Math.sin(x * 0.011 + t * 0.002) * 3 * state.energy;
          if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${l % 2 ? '184, 162, 255' : '108, 59, 255'}, ${0.18 + 0.1 * (lines - l) / lines + state.energy * 0.25})`;
        ctx.lineWidth = l === 0 ? 2 : 1;
        ctx.stroke();
      }
    };

    tickers.push((t) => {
      const total = hero.offsetHeight - state.vh;
      heroP = total > 0 ? clamp(state.scrollY / total) : 0;
      sticky.style.setProperty('--hero-p', heroP.toFixed(4));
      if (heroP >= 1) return; // fuori schermo: niente lavoro inutile

      const tx = ((state.pointerX / state.vw) - 0.5) * -26;
      const ty = ((state.pointerY / state.vh) - 0.5) * -18;
      px = lerp(px, tx, 0.06); py = lerp(py, ty, 0.06);
      if (!reducedMotion) {
        image.style.setProperty('--px', `${px.toFixed(2)}px`);
        image.style.setProperty('--py', `${py.toFixed(2)}px`);
        drawWaves(t);
      }

      const k = reducedMotion ? 1 : clamp((t - volStart) / 1600);
      const eased = 1 - Math.pow(1 - k, 4);

      meterBars.forEach((bar, i) => {
        const n = 0.5 + 0.5 * Math.sin(t * 0.004 + i * 0.9) * Math.cos(t * 0.0023 + i * 0.4);
        const level = clamp(0.12 + n * 0.35 + state.energy * (0.4 + (i / meterBars.length) * 0.6));
        bar.style.transform = `scaleY(${level.toFixed(3)})`;
      });
      if (meterValue) meterValue.textContent = String(Math.round(40 + eased * 30 + state.energy * 30)).padStart(2, '0');
    });
    if (reducedMotion) drawWaves(0);
  }

  /* ---------- Striscia: la velocità segue lo scorrimento ---------- */
  const tickerTrack = $('[data-ticker-track]');
  if (tickerTrack && !reducedMotion) {
    let x = 0, dir = -1;
    tickers.push((t, dt) => {
      if (Math.abs(state.scrollVelocity) > 1) dir = state.scrollVelocity > 0 ? -1 : 1;
      const speed = 60 + Math.min(900, Math.abs(state.scrollVelocity) * 40);
      x += dir * speed * dt;
      const half = tickerTrack.scrollWidth / 2;
      if (x <= -half) x += half;
      if (x > 0) x -= half;
      tickerTrack.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0) skewX(${clamp(state.scrollVelocity * -0.4, -8, 8).toFixed(2)}deg)`;
    });
  }

  /* ---------- Anteprima dei clienti che segue il mouse ---------- */
  const preview = $('[data-preview-box]');
  if (preview && finePointer && !reducedMotion) {
    const img = $('img', preview);
    let x = 0, y = 0, on = false;
    $$('[data-preview]').forEach((link) => {
      link.addEventListener('pointerenter', () => { img.src = link.dataset.preview; on = true; preview.classList.add('is-on'); });
      link.addEventListener('pointerleave', () => { on = false; preview.classList.remove('is-on'); });
    });
    tickers.push(() => {
      if (!on && !preview.classList.contains('is-on')) return;
      x = lerp(x, state.pointerX + 140, 0.14);
      y = lerp(y, state.pointerY, 0.14);
      preview.style.left = `${x}px`;
      preview.style.top = `${y}px`;
    });
  }

  /* ---------- "Esserci non basta": le righe si accendono una dopo l'altra ---------- */
  const problem = $('[data-problem]');
  if (problem && !reducedMotion) {
    const sticky = $('.problem-sticky', problem);
    const lines = $$('[data-problem-line]', problem);
    tickers.push(() => {
      const r = problem.getBoundingClientRect();
      const total = r.height - state.vh;
      if (r.bottom < 0 || r.top > state.vh) return;
      const p = total > 0 ? clamp(-r.top / total) : 1;
      sticky.style.setProperty('--problem-p', p.toFixed(4));
      lines.forEach((line, i) => line.style.setProperty('--l', clamp((p + 0.06 - i * 0.14) / 0.16).toFixed(3)));
      sticky.style.setProperty('--problem-bg', clamp((p - 0.42) / 0.14).toFixed(3));
      sticky.style.setProperty('--copy', clamp((p - 0.52) / 0.14).toFixed(3));
    });
  }

  /* ---------- Il metodo: scorrimento orizzontale su schermi grandi ---------- */
  const method = $('[data-method]');
  if (method) {
    const track = $('[data-method-track]', method);
    const steps = $$('[data-step]', method);
    const number = $('[data-method-number]', method);
    const sticky = $('.method-sticky', method);
    let distance = 0, pinned = false, active = -1;

    const layout = () => {
      pinned = !reducedMotion && state.vw > 900;
      root.classList.toggle('is-pinned-method', pinned);
      if (!pinned) { method.style.removeProperty('--method-h'); track.style.removeProperty('--method-x'); return; }
      const gutter = parseFloat(getComputedStyle(track).paddingLeft) || 0;
      distance = Math.max(0, track.scrollWidth - state.vw + gutter * 0);
      method.style.setProperty('--method-h', `${state.vh + distance}px`);
    };
    layout();
    addEventListener('resize', layout);
    addEventListener('load', layout);

    const setActive = (i) => {
      if (i === active) return;
      active = i;
      steps.forEach((s, j) => s.classList.toggle('is-active', j === i));
      number.textContent = String(i + 1).padStart(2, '0');
      sticky.style.setProperty('--method-p', ((i + 1) / steps.length).toFixed(3));
    };
    setActive(0);

    if (!pinned && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActive(steps.indexOf(e.target)); });
      }, { rootMargin: '-45% 0px -45% 0px' });
      steps.forEach((s) => io.observe(s));
    }

    tickers.push(() => {
      if (!pinned) return;
      const r = method.getBoundingClientRect();
      if (r.bottom < 0 || r.top > state.vh) return;
      const p = distance > 0 ? clamp(-r.top / distance) : 0;
      track.style.setProperty('--method-x', (p * distance).toFixed(1));
      setActive(Math.min(steps.length - 1, Math.floor(p * steps.length * 0.999 + 0.15)));
    });
  }

  /* ---------- Casi studio: nome che si allarga, video e dettagli in parallasse ---------- */
  const cases = $$('[data-case]');
  const parallax = $$('[data-parallax]');
  if (!reducedMotion) {
    tickers.push(() => {
      cases.forEach((c) => {
        const r = c.getBoundingClientRect();
        if (r.bottom < -200 || r.top > state.vh + 200) return;
        const enter = clamp((state.vh - r.top) / (state.vh * 0.75));
        c.style.setProperty('--case-in', (1 - Math.pow(1 - enter, 3)).toFixed(3));
        const film = $('.case-film', c);
        const fr = film.getBoundingClientRect();
        const offset = (fr.top + fr.height / 2 - state.vh / 2);
        film.style.setProperty('--case-shift', (offset * -0.06).toFixed(1));
        film.style.setProperty('--case-tilt', clamp(offset * 0.004, -3, 3).toFixed(2));
      });
      parallax.forEach((el) => {
        const r = el.parentElement.getBoundingClientRect();
        if (r.bottom < 0 || r.top > state.vh) return;
        const offset = (r.top + r.height / 2 - state.vh / 2);
        el.style.setProperty('--parallax', (offset * -parseFloat(el.dataset.parallax)).toFixed(1));
      });
    });
  }

  /* ---------- Offerta: alone che scende e contatore ---------- */
  const offer = $('.offer');
  const counter = $('[data-count-to]');
  if (offer && !reducedMotion) {
    tickers.push(() => {
      const r = offer.getBoundingClientRect();
      if (r.bottom < 0 || r.top > state.vh) return;
      offer.style.setProperty('--offer-p', clamp((state.vh - r.top) / (r.height + state.vh)).toFixed(3));
    });
  }
  if (counter && revealObserver && !reducedMotion) {
    const to = parseInt(counter.dataset.countTo, 10);
    counter.textContent = '0';
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const run = (now) => {
        const k = clamp((now - start) / 1400);
        counter.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(run);
      };
      requestAnimationFrame(run);
    }, { threshold: 0.6 });
    io.observe(counter);
  }

  /* ---------- Piede: la scritta BUZZ sale ---------- */
  const footerMark = $('[data-footer-wordmark]');
  if (footerMark && !reducedMotion) {
    tickers.push(() => {
      const r = footerMark.getBoundingClientRect();
      if (r.top > state.vh) { footerMark.style.setProperty('--footer-p', '0'); return; }
      footerMark.style.setProperty('--footer-p', clamp((state.vh - r.top) / (state.vh * 0.6)).toFixed(3));
    });
  }

  /* ---------- Lettore video a tutto schermo (stile storie) ---------- */
  const dialog = $('[data-story-dialog]');
  const storyLinks = $$('[data-story]');
  if (dialog && typeof dialog.showModal === 'function' && storyLinks.length) {
    const video = $('[data-story-video]', dialog);
    const bar = $('[data-story-bar]', dialog);
    const client = $('[data-story-client]', dialog);
    const caption = $('[data-story-caption]', dialog);
    const ig = $('[data-story-ig]', dialog);
    const soundBtn = $('[data-story-sound]', dialog);
    const stories = storyLinks.map((link) => {
      const article = link.closest('[data-case]');
      const igLink = $('.case-text .link-arrow', article);
      return {
        src: link.getAttribute('href'),
        poster: $('img', link).getAttribute('src'),
        client: $('[data-case-name]', article).textContent.trim(),
        caption: $('.case-film-caption span', link).textContent.trim(),
        igHref: igLink ? igLink.href : '',
        igText: igLink ? igLink.textContent.trim() : '',
      };
    });
    let current = 0, opener = null, muted = false;

    const setSound = () => {
      video.muted = muted;
      soundBtn.setAttribute('aria-label', muted ? 'Attiva l’audio' : 'Disattiva l’audio');
      $('use', soundBtn).setAttribute('href', muted ? '#i-mute' : '#i-sound');
    };
    const load = (i) => {
      current = (i + stories.length) % stories.length;
      const s = stories[current];
      client.textContent = s.client;
      caption.textContent = s.caption;
      ig.href = s.igHref; ig.textContent = s.igText; ig.hidden = !s.igHref;
      video.poster = s.poster;
      video.src = s.src;
      bar.style.transform = 'scaleX(0)';
      setSound();
      video.play().catch(() => { muted = true; setSound(); video.play().catch(() => {}); });
    };
    const close = () => { if (dialog.open) dialog.close(); };

    storyLinks.forEach((link, i) => link.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      opener = link;
      dialog.showModal();
      root.classList.add('story-open');
      load(i);
    }));
    dialog.addEventListener('close', () => {
      root.classList.remove('story-open');
      video.pause();
      video.removeAttribute('src');
      video.load(); // ferma anche lo scaricamento
      opener?.focus({ preventScroll: true });
    });
    $('[data-story-close]', dialog).addEventListener('click', close);
    $('[data-story-prev]', dialog).addEventListener('click', () => load(current - 1));
    $('[data-story-next]', dialog).addEventListener('click', () => load(current + 1));
    soundBtn.addEventListener('click', () => { muted = !muted; setSound(); });
    video.addEventListener('click', () => (video.paused ? video.play() : video.pause()));
    video.addEventListener('timeupdate', () => {
      if (video.duration) bar.style.transform = `scaleX(${(video.currentTime / video.duration).toFixed(4)})`;
    });
    video.addEventListener('ended', () => (current < stories.length - 1 ? load(current + 1) : close()));
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') load(current + 1);
      if (e.key === 'ArrowLeft') load(current - 1);
    });
    let touchX = null;
    dialog.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    dialog.addEventListener('touchend', (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 60) load(current + (dx < 0 ? 1 : -1));
      touchX = null;
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); });
  }

  /* ---------- Ciclo unico di animazione ---------- */
  addEventListener('resize', () => { state.vw = innerWidth; state.vh = innerHeight; });
  let prev = performance.now();
  const frame = (t) => {
    const dt = Math.min(0.05, (t - prev) / 1000);
    prev = t;
    state.lastScrollY = state.scrollY;
    state.scrollY = scrollY;
    state.scrollVelocity = lerp(state.scrollVelocity, state.scrollY - state.lastScrollY, 0.2);
    const push = Math.min(1, Math.abs(state.scrollVelocity) / 40 + state.pointerSpeed * 0.35);
    state.energy = Math.max(push, state.energy * 0.95);
    state.pointerSpeed *= 0.9;
    for (const fn of tickers) fn(t, dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();
