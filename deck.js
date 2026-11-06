import { Scene3D } from './scene.js?v=20261106b';

const SCENES = {
  title:     { liver: 1, lobule: 0, inflame: 0,    shift: 0.26,  camZ: 7.2, camY: 0.3, cells: 'orbit',     abs: 'hidden' },
  attack:    { liver: 1, lobule: 0, inflame: 1, shift: 0.27, camZ: 6.2, camY: 0.3, cells: 'attack',    abs: 'hidden' },
  ambient:   { liver: 0, lobule: 0, inflame: 0,    shift: 0,    camZ: 7,   camY: 0.3, cells: 'scatter',   abs: 'hidden' },
  ambientAb: { liver: 0, lobule: 0, inflame: 0,    shift: 0,    camZ: 7,   camY: 0.3, cells: 'scatter',   abs: 'scatter' },
  bind:      { liver: 0.8, lobule: 0, inflame: 0.45, shift: 0.33, camZ: 7.2, camY: 0.3, cells: 'retreat',   abs: 'bind' },
  swarm:     { liver: 0, lobule: 0, inflame: 0,    shift: 0.34, camZ: 7.6, camY: 0.3, cells: 'scatter',   abs: 'swarm' },
  lobule:    { liver: 0, lobule: 1, inflame: 0,    shift: 0.21, camZ: 7.4, camY: 0.6, cells: 'interface', abs: 'hidden' },
  treated:   { liver: 0.85, lobule: 0, inflame: 0, shift: 0.31, camZ: 7.8, camY: 0.3, cells: 'retreat',   abs: 'hidden' },
  attackR:   { liver: 0.85, lobule: 0, inflame: 0.95, shift: 0.31, camZ: 7.8, camY: 0.3, cells: 'attack',    abs: 'hidden' },
};
for (let n = 0; n <= 6; n++) {
  SCENES['patho' + n] = { liver: 0, lobule: 0, inflame: 0, shift: 0.2, camZ: 9.2, camY: 0.15, cells: 'hidden', abs: 'hidden', patho: n };
}

let scene3d = null;
try {
  scene3d = new Scene3D(document.getElementById('gl'));
} catch (e) {
  console.warn('WebGL unavailable; continuing without 3D', e);
}

const stage = document.querySelector('.stage');
const slides = [...document.querySelectorAll('.slide')];
const firstBackup = slides.findIndex((s) => s.hasAttribute('data-backup'));
const mainEnd = firstBackup < 0 ? slides.length - 1 : firstBackup - 1;
let returnSlide = mainEnd;
const ticks = document.querySelector('.ticks');
const titleEl = document.querySelector('.deck-title');
const notesEl = document.getElementById('notes');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || location.search.includes('still');
let index = -1;
if (location.search.includes('still')) { document.body.classList.add('still'); gsap.ticker.lagSmoothing(0); gsap.globalTimeline.timeScale(20); }

// ---------- layout ----------
function fit() {
  const s = Math.min(innerWidth / 1600, innerHeight / 900);
  stage.style.setProperty('--s', s);
  document.documentElement.style.setProperty('--s', s);
}
fit();
addEventListener('resize', fit);

// ---------- headline word split ----------
function split(el) {
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span'); w.className = 'w';
          const wi = document.createElement('span'); wi.className = 'wi'; wi.textContent = part;
          w.appendChild(wi); frag.appendChild(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
    });
  };
  walk(el);
}
document.querySelectorAll('.h').forEach(split);

// ---------- generated charts ----------
function gauss(x, m, s) { return Math.exp(-0.5 * ((x - m) / s) ** 2); }
const bim = document.querySelector('[data-curve="bimodal"]');
if (bim) {
  const W = 720, H = 300, base = 270;
  let d = '', fill = `M0 ${base}`;
  for (let age = 0; age <= 85; age += 0.5) {
    const v = 0.62 * gauss(age, 14, 5.5) + 1.0 * gauss(age, 50, 10) + 0.35 * gauss(age, 72, 7);
    const x = (age / 85) * W, y = base - v * 220;
    d += (age === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
    fill += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  fill += ` L${W} ${base} Z`;
  bim.querySelector('.curve').setAttribute('d', d);
  bim.querySelector('.area').setAttribute('d', fill);
}

// ---------- progress ticks & pathogenesis pills ----------
slides.forEach((s, i) => {
  const b = document.createElement('button');
  b.className = 'tick';
  if (s.hasAttribute('data-backup')) b.classList.add('tick-backup');
  if (i === firstBackup) b.classList.add('backup-start');
  b.setAttribute('aria-label', `Slide ${i + 1}: ${s.dataset.title}`);
  b.title = s.dataset.title;
  b.addEventListener('click', () => go(i));
  ticks.appendChild(b);
});

document.querySelectorAll('.s-patho .pbar i').forEach((pill, idx) => {
  pill.setAttribute('role', 'button');
  pill.setAttribute('tabindex', '0');
  pill.setAttribute('aria-label', `Pathogenesis stage ${idx + 1}`);
  const jump = () => {
    const s = slides[index];
    if (!s || !s.classList.contains('s-patho')) return;
    s._step = idx;
    soloUpdate(s);
    applyScene(s);
  };
  pill.addEventListener('click', jump);
  pill.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jump(); } });
});

// ---------- animation ----------
const steps = (s) => [...s.querySelectorAll('[data-step]')];

function animateIn(slide, showAllSteps) {
  const tl = gsap.timeline();
  const D = reduced ? 0.01 : 1;
  tl.fromTo(slide, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 * D });

  const words = slide.querySelectorAll('.h .wi');
  tl.fromTo(words, { yPercent: 118, rotate: 5 }, { yPercent: 0, rotate: 0, duration: 1.0 * D, ease: 'expo.out', stagger: 0.045 * D }, 0.05);

  const stepEls = steps(slide);
  const hasSolo = slide.querySelector('[data-solo]');
  if (slide._step === undefined) slide._step = showAllSteps ? stepEls.length : 0;
  stepEls.forEach((el, i) => {
    if (!el.hasAttribute('data-solo')) gsap.set(el, { autoAlpha: i < slide._step ? 1 : 0 });
  });

  const pieces = [...slide.querySelectorAll('[data-a]')].filter((el) => !el.closest('[data-step]') || showAllSteps);
  pieces.forEach((el, i) => {
    const kind = el.dataset.a;
    const from = kind === 'left' ? { x: -40, autoAlpha: 0 } : kind === 'pop' ? { scale: 0.6, autoAlpha: 0 } : kind === 'fade' ? { autoAlpha: 0 } : { y: 28, autoAlpha: 0 };
    tl.fromTo(el, from, { x: 0, y: 0, scale: 1, autoAlpha: 1, duration: 0.8 * D, ease: kind === 'pop' ? 'back.out(2)' : 'power3.out' }, 0.3 + i * 0.07 * D);
  });

  slide.querySelectorAll('[data-draw]').forEach((p) => {
    if (p.closest('[data-step]') && !showAllSteps) return;
    drawPath(tl, p, 0.5);
  });
  soloUpdate(slide);
  slide.querySelectorAll('[data-bar]').forEach((b, i) => {
    tl.fromTo(b, { scaleX: 0 }, { scaleX: 1, transformOrigin: '0% 50%', duration: 1.2 * D, ease: 'expo.out' }, 0.5 + i * 0.12 * D);
  });
  slide.querySelectorAll('[data-count]').forEach((el) => {
    const end = parseFloat(el.dataset.count), o = { v: 0 };
    tl.to(o, { v: end, duration: 1.4 * D, ease: 'power2.out', onUpdate: () => (el.textContent = Math.round(o.v)) }, 0.4);
  });
  return tl;
}

function drawPath(tl, p, at) {
  const len = p.getTotalLength();
  const dur = parseFloat(p.dataset.draw) || 1.6;
  tl.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: reduced ? 0.01 : dur, ease: 'power2.inOut' }, at);
}

// captions that replace each other (pathogenesis walkthrough)
function soloUpdate(slide, animate = true) {
  const caps = [...slide.querySelectorAll('[data-solo]')];
  if (!caps.length) return;
  const idx = Math.min(slide._step || 0, caps.length - 1);
  caps.forEach((c, i) => {
    if (i === idx) gsap.fromTo(c, { autoAlpha: 0, x: animate ? 30 : 0 }, { autoAlpha: 1, x: 0, duration: reduced || !animate ? 0.01 : 0.6, ease: 'power3.out', delay: animate ? 0.15 : 0 });
    else gsap.to(c, { autoAlpha: 0, x: -30, duration: reduced ? 0.01 : 0.3, ease: 'power2.in' });
  });
  slide.querySelectorAll('.pbar i').forEach((b, i) => b.classList.toggle('on', i <= idx));
}

function prevStep() {
  const s = slides[index];
  if (s && s._step > 0) {
    const el = steps(s)[s._step - 1];
    s._step--;
    if (!el.hasAttribute('data-solo')) gsap.to(el, { autoAlpha: 0, y: 16, duration: reduced ? 0.01 : 0.3 });
    soloUpdate(s);
    applyScene(s);
    return;
  }
  go(index - 1);
}

function revealStep(slide) {
  const el = steps(slide)[slide._step];
  if (!el) return false;
  slide._step++;
  const tl = gsap.timeline();
  if (!el.hasAttribute('data-solo')) tl.fromTo(el, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: reduced ? 0.01 : 0.7, ease: 'power3.out' });
  el.querySelectorAll('[data-a]').forEach((c, i) => tl.fromTo(c, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.6 }, 0.1 + i * 0.06));
  el.querySelectorAll('[data-draw]').forEach((p) => drawPath(tl, p, 0.1));
  soloUpdate(slide);
  applyScene(slide);
  return true;
}

function applyScene(slide) {
  if (!scene3d) return;
  let name = slide.dataset.scene;
  steps(slide).slice(0, slide._step).forEach((s) => { if (s.dataset.scene) name = s.dataset.scene; });
  scene3d.set(SCENES[name] || SCENES.ambient);
}

function go(n, opts = {}) {
  n = Math.max(0, Math.min(slides.length - 1, n));
  if (n === index) {
    if (opts.step !== undefined) {
      slides[index]._step = opts.step;
      soloUpdate(slides[index]);
      applyScene(slides[index]);
    }
    return;
  }
  const prev = slides[index];
  const next = slides[n];
  if (n > mainEnd && index >= 0 && index <= mainEnd) returnSlide = index;
  const back = n < index;
  if (prev) {
    prev.classList.remove('is-active');
    gsap.killTweensOf(prev);
    gsap.to(prev, { autoAlpha: 0, y: back ? 30 : -30, duration: reduced ? 0.01 : 0.35, ease: 'power2.in', onComplete: () => gsap.set(prev, { y: 0 }) });
  }
  index = n;
  next.classList.add('is-active');
  gsap.delayedCall(prev ? 0.25 : 0, () => animateIn(next, back || opts.all));
  if (opts.step !== undefined) next._step = opts.step;
  else next._step = (back || opts.all) ? steps(next).length : 0;
  applyScene(next);
  [...ticks.children].forEach((t, i) => t.classList.toggle('on', i === n));
  [...ticks.children].forEach((t, i) => {
    if (i === n) t.setAttribute('aria-current', 'step');
    else t.removeAttribute('aria-current');
  });
  titleEl.textContent = n === 0 ? '' : next.dataset.title;
  document.querySelector('.nav-backup').textContent = n > mainEnd ? 'Return to talk' : 'Backup';
  document.querySelector('.nav-backup').setAttribute('aria-pressed', String(n > mainEnd));
  history.replaceState(null, '', `#${n + 1}`);
  renderNotes();
}

function nextStep() {
  const s = slides[index];
  if (s && revealStep(s)) return;
  if (index === mainEnd) return;
  go(index + 1);
}

function toggleBackup() {
  if (firstBackup < 0) return;
  go(index > mainEnd ? returnSlide : firstBackup);
}

// ---------- notes ----------
function renderNotes() {
  const n = slides[index].querySelector('.notes');
  notesEl.innerHTML = n ? n.innerHTML : '<p>No notes for this slide.</p>';
}

// ---------- input ----------
addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.target.matches('input, textarea, select, [contenteditable="true"]')) return;
  if (e.target.closest('button, a, [role="button"]') && [' ', 'Enter'].includes(e.key)) return;
  switch (e.key) {
    case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
      e.preventDefault(); nextStep(); break;
    case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
      e.preventDefault(); prevStep(); break;
    case 'Home': go(0); break;
    case 'End': go(index > mainEnd ? slides.length - 1 : mainEnd); break;
    case 'b': case 'B': toggleBackup(); break;
    case 'n': case 'N': document.body.classList.toggle('show-notes'); break;
    case 'f': case 'F':
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
      break;
  }
});
document.querySelector('.nav-prev').addEventListener('click', () => prevStep());
document.querySelector('.nav-next').addEventListener('click', () => nextStep());
document.querySelector('.nav-backup').addEventListener('click', toggleBackup);

let tx = null;
addEventListener('touchstart', (e) => (tx = e.touches[0].clientX), { passive: true });
addEventListener('touchend', (e) => {
  if (tx === null) return;
  const dx = e.changedTouches[0].clientX - tx;
  if (Math.abs(dx) > 50) dx < 0 ? nextStep() : prevStep();
  tx = null;
});

// ---------- score calculator ----------
const calc = document.querySelector('.calc');
if (calc) {
  const ring = calc.querySelector('.ring-fg');
  const total = calc.querySelector('.total');
  const verdict = calc.querySelector('.verdict');
  const C = 2 * Math.PI * 120;
  ring.style.strokeDasharray = C;
  ring.style.strokeDashoffset = C;
  const counter = { v: 0 };
  const update = () => {
    let sum = 0;
    calc.querySelectorAll('input:checked').forEach((i) => (sum += +i.value));
    gsap.to(ring, { strokeDashoffset: C * (1 - sum / 8), opacity: sum ? 1 : 0, duration: 0.8, ease: 'expo.out' });
    gsap.to(counter, { v: sum, duration: 0.6, ease: 'power2.out', onUpdate: () => (total.textContent = Math.round(counter.v)) });
    let text = 'Below threshold. Does not exclude AIH.', cls = 'low';
    if (sum >= 7) { text = 'Definite AIH by criteria'; cls = 'def'; }
    else if (sum === 6) { text = 'Probable AIH by criteria'; cls = 'prob'; }
    verdict.textContent = text;
    calc.dataset.level = cls;
  };
  calc.addEventListener('change', update);
  update();
}

// ---------- start ----------
// #N opens slide N (all steps shown); #N.k opens slide N at step k
function goHash() {
  const [hs, hk] = location.hash.slice(1).split('.');
  const start = parseInt(hs, 10);
  if (hk !== undefined && Number.isFinite(start)) {
    go(start - 1, { step: +hk });
  } else {
    go(Number.isFinite(start) ? start - 1 : 0, { all: Number.isFinite(start) && start > 1 });
  }
}
addEventListener('hashchange', goHash);
goHash();
