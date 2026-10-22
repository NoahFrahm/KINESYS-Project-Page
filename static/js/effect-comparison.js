function showComparisonError(root, error) {
  const message = document.createElement('p');
  message.className = 'comparison-error';
  message.setAttribute('role', 'alert');
  message.textContent = `Could not load effect comparisons: ${error.message}`;
  root.replaceChildren(message);
}

async function initializeEffectComparison(root) {
  const response = await fetch(root.dataset.effectsSrc);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const { effects } = await response.json();
  if (!Array.isArray(effects) || effects.length === 0) {
    throw new Error('No effects are defined.');
  }
  for (const effect of effects) {
    if (!effect.name || !effect.reference?.image || !effect.source?.image ||
        !Array.isArray(effect.results) ||
        effect.results.some(result => !result.name || !result.image)) {
      throw new Error('Each effect needs a name, reference, source, and named results.');
    }
    effect.ours = effect.results.find(result => result.id === 'kinesys');
    effect.baselines = effect.results.filter(result => result.id !== 'kinesys');
    if (!effect.ours || effect.baselines.length === 0) {
      throw new Error('Each effect needs a KINESYS result and a comparison method.');
    }
  }

  root.innerHTML = `
    <div class="effect-selectors" role="group" aria-label="Choose an effect"></div>
    <p class="comparison-status" role="status"></p>
    <div class="comparison-row">
      <button type="button" class="effect-arrow effect-prev" aria-label="Previous effect">←</button>
      <div class="comparison-cards">
        <div class="comparison-inputs">
          <figure class="comparison-card">
            <figcaption>Source image</figcaption>
            <img class="comparison-source" alt="" decoding="async">
          </figure>
          <figure class="comparison-card">
            <figcaption>Effect reference</figcaption>
            <img class="comparison-reference" alt="" decoding="async">
          </figure>
        </div>
        <figure class="comparison-card comparison-ours">
          <figcaption></figcaption>
          <img class="comparison-ours-image" alt="" decoding="async">
        </figure>
        <figure class="comparison-card comparison-result">
          <figcaption class="comparison-method-name"></figcaption>
          <img class="comparison-result-image" alt="" decoding="async">
        </figure>
      </div>
      <button type="button" class="effect-arrow effect-next" aria-label="Next effect">→</button>
    </div>
    <div class="comparison-toolbar">
      <button type="button" class="method-rotation"></button>
    </div>
  `;
  const selectors = root.querySelector('.effect-selectors');
  const rotationButton = root.querySelector('.method-rotation');
  const previous = root.querySelector('.effect-prev');
  const next = root.querySelector('.effect-next');
  const resultImage = root.querySelector('.comparison-result-image');
  const resultCard = root.querySelector('.comparison-result');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let effectIndex = 0;
  let methodIndex = 0;
  let rotating = true;
  let resultRevision = 0;
  let resultReady = false;
  let visible = false;
  let rotationTimer;

  function reportError(error) {
    clearTimeout(rotationTimer);
    showComparisonError(root, error);
  }

  function makeButton(label, callback) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', callback);
    return button;
  }

  function updateRotationButton() {
    rotationButton.disabled = effects[effectIndex].baselines.length < 2;
    rotationButton.textContent = rotationButton.disabled ? 'One comparison method' :
      rotating ? 'Pause method rotation' : 'Resume method rotation';
  }

  function scheduleRotation() {
    clearTimeout(rotationTimer);
    const baselines = effects[effectIndex].baselines;
    if (!rotating || !visible || !resultReady || document.hidden || baselines.length < 2) return;
    rotationTimer = setTimeout(() => {
      showResult((methodIndex + 1) % baselines.length, true).catch(reportError);
    }, 4000);
  }

  async function showResult(index, animate = false) {
    clearTimeout(rotationTimer);
    resultReady = false;
    const revision = ++resultRevision;
    const effect = effects[effectIndex];
    const result = effect.baselines[index];
    for (const animation of resultCard.getAnimations()) animation.cancel();
    let outgoing;
    if (animate && !reducedMotion.matches) {
      outgoing = resultCard.animate(
        [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-12px)', opacity: 0 }],
        { duration: 150, easing: 'ease-in', fill: 'forwards' },
      );
      await outgoing.finished.catch(() => {});
      if (revision !== resultRevision) return;
    }
    resultImage.src = result.image;
    resultImage.alt = result.alt || `${effect.name}: ${result.name} result.`;
    root.querySelector('.comparison-method-name').textContent = result.name;
    methodIndex = index;
    root.dataset.methodIndex = String(methodIndex);
    try {
      await resultImage.decode();
    } catch (error) {
      if (revision !== resultRevision) return;
      throw error;
    }
    if (revision !== resultRevision) return;
    outgoing?.cancel();
    if (animate && !reducedMotion.matches) {
      const incoming = resultCard.animate(
        [{ transform: 'translateY(12px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
        { duration: 150, easing: 'ease-out' },
      );
      await incoming.finished.catch(() => {});
      if (revision !== resultRevision) return;
    }
    resultReady = true;
    scheduleRotation();
  }

  async function showEffect(index) {
    effectIndex = (index + effects.length) % effects.length;
    const effect = effects[effectIndex];
    for (const [field, selector] of [['source', '.comparison-source'], ['reference', '.comparison-reference']]) {
      const image = root.querySelector(selector);
      image.src = effect[field].image;
      image.alt = effect[field].alt || `${effect.name}: ${field} image.`;
    }
    const ours = root.querySelector('.comparison-ours-image');
    ours.src = effect.ours.image;
    ours.alt = effect.ours.alt || `${effect.name}: ${effect.ours.name} result.`;
    root.querySelector('.comparison-ours figcaption').textContent = effect.ours.name;
    for (const button of selectors.children) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.effectIndex) === effectIndex));
    }
    const selectedBounds = selectors.children[effectIndex].getBoundingClientRect();
    const selectorBounds = selectors.getBoundingClientRect();
    if (selectedBounds.left < selectorBounds.left || selectedBounds.right > selectorBounds.right) {
      selectors.scrollBy({
        left: selectedBounds.left < selectorBounds.left ?
          selectedBounds.left - selectorBounds.left : selectedBounds.right - selectorBounds.right,
        behavior: reducedMotion.matches ? 'instant' : 'smooth',
      });
    }
    root.querySelector('.comparison-status').textContent = `${effect.name} · ${effectIndex + 1} / ${effects.length}`;
    root.dataset.effectIndex = String(effectIndex);
    previous.disabled = next.disabled = effects.length < 2;
    updateRotationButton();
    await showResult(0);
  }

  effects.forEach((effect, index) => {
    const button = makeButton(effect.name, () => showEffect(index).catch(reportError));
    button.dataset.effectIndex = String(index);
    selectors.append(button);
  });
  previous.addEventListener('click', () => showEffect(effectIndex - 1).catch(reportError));
  next.addEventListener('click', () => showEffect(effectIndex + 1).catch(reportError));
  rotationButton.addEventListener('click', () => {
    rotating = !rotating;
    updateRotationButton();
    scheduleRotation();
  });
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    scheduleRotation();
  }).observe(root);
  document.addEventListener('visibilitychange', scheduleRotation);
  await showEffect(0);
}

for (const root of document.querySelectorAll('[data-effect-comparison]')) {
  initializeEffectComparison(root).catch(error => showComparisonError(root, error));
}
