for (const figure of document.querySelectorAll('[data-video-player]')) {
  const video = figure.querySelector('video');
  const hint = figure.querySelector('.play-hint');

  function playFromBeginning() {
    video.currentTime = 0;
    video.focus();
    video.play();
  }

  hint.addEventListener('click', playFromBeginning);
  video.addEventListener('play', () => { hint.hidden = true; });
  video.addEventListener('ended', () => {
    hint.hidden = false;
  });
}
