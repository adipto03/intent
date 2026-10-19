import { addLog, fmtClock } from './shared.js';

const $ = (id) => document.getElementById(id);
const show = (id) => document.querySelectorAll('main > section').forEach((s) => (s.hidden = s.id !== id));

let timer, startedAt, quietTimer;

function start(minutes) {
  show('run');
  startedAt = Date.now();
  const end = startedAt + minutes * 60_000;
  const tick = () => {
    const left = end - Date.now();
    $('remaining').textContent = fmtClock(left);
    if (left <= 0) finish(minutes);
  };
  tick();
  timer = setInterval(tick, 1000);
  // Fade the text away so there's nothing left to look at but the breath.
  quietTimer = setTimeout(() => document.body.classList.add('quiet'), 8000);
  document.addEventListener('mousemove', () => {
    document.body.classList.remove('quiet');
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => document.body.classList.add('quiet'), 4000);
  });
}

async function finish(minutes) {
  clearInterval(timer);
  document.body.classList.remove('quiet');
  chime();
  await addLog({ type: 'still', minutes });
  $('mins').textContent = `${minutes} minute${minutes === 1 ? '' : 's'}`;
  show('done');
}

function chime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 528;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 3);
  } catch {}
}

document.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => start(Number(b.dataset.m))));
$('stop').onclick = () => {
  const mins = Math.floor((Date.now() - startedAt) / 60_000);
  if (mins >= 1) return finish(mins);
  clearInterval(timer);
  show('pick');
};

const auto = Number(new URLSearchParams(location.search).get('m'));
if (auto > 0) start(auto);
