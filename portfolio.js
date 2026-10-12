/* Native players work without this enhancement; playback always starts by choice. */
(() => {
  const videos = Array.from(document.querySelectorAll('video[data-case-video]'));
  if (!videos.length || document.documentElement.dataset.buzzPortfolio) return;
  document.documentElement.dataset.buzzPortfolio = 'ready';
  const pause = video => { if (!video.paused) video.pause(); };
  const detached = video => document.fullscreenElement === video || video.webkitDisplayingFullscreen || video.webkitPresentationMode === 'picture-in-picture' || document.pictureInPictureElement === video;
  const checkInlineVisibility = video => {
    if (detached(video)) return;
    const rect = video.getBoundingClientRect();
    if (document.hidden || !rect.width || !rect.height || rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) pause(video);
  };
  const scheduled = new Set();
  const returnedInline = video => {
    if (document.hidden) { checkInlineVisibility(video); return; }
    if (scheduled.has(video)) return;
    scheduled.add(video);
    const check = () => { scheduled.delete(video); checkInlineVisibility(video); };
    // Let native fullscreen/PiP geometry settle before testing the inline frame.
    if (window.requestAnimationFrame) window.requestAnimationFrame(check);
    else setTimeout(check, 0);
  };
  videos.forEach(video => video.addEventListener('play', () => {
    videos.forEach(other => { if (other !== video) pause(other); });
  }));
  videos.forEach(video => {
    for (const event of ['leavepictureinpicture', 'webkitpresentationmodechanged', 'webkitendfullscreen']) video.addEventListener(event, () => returnedInline(video));
  });
  document.addEventListener('fullscreenchange', () => videos.forEach(returnedInline));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) videos.forEach(video => { if (!detached(video)) pause(video); });
  });
  window.addEventListener('pagehide', () => videos.forEach(pause));
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const video = entry.target;
        if (!entry.isIntersecting && !detached(video)) pause(video);
      });
    }, { threshold: 0 });
    videos.forEach(video => observer.observe(video));
  }
})();
