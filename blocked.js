import { getState, addLog, updateLog, siteForUrl, judgeIntention, CATEGORIES, isToday } from './shared.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const rawTarget = location.hash.slice(1);
const target = /^https?:\/\//.test(rawTarget) ? rawTarget : null;

const PROMPTS = [
  'Breathe in slowly… and out.',
  'What are you feeling right now?',
  'Bored? Tired? Avoiding something? All of that is okay.',
  'The urge will pass whether or not you follow it.',
  'Boredom is where ideas come from.',
  'What would you be proud of doing with the next hour?',
];

let state, site, dest, reflectId;
let appealing = false;

function show(id) {
  document.querySelectorAll('main > section').forEach((s) => (s.hidden = s.id !== id));
  window.scrollTo(0, 0);
}

const closeTab = () => chrome.tabs.getCurrent((t) => chrome.tabs.remove(t.id));
const unlocksToday = () =>
  state.log.filter((e) => e.type === 'unlock' && e.siteId === site.id && isToday(e.ts)).length;

async function init() {
  state = await getState();
  const endedId = params.get('ended');
  site =
    state.settings.sites.find((s) => s.id === endedId) ||
    (target && siteForUrl(state.settings, target)) ||
    state.settings.sites[0];
  dest = target || `https://${site.domains[0]}/`;
  document.title = `${site.name} · paused`;
  document.querySelectorAll('.site-name').forEach((n) => (n.textContent = site.name));

  const session = state.sessions[site.id];
  if (session && session.until > Date.now()) return location.replace(dest);

  renderHabits($('habits'));
  renderHabits($('habits2'));
  renderForm();

  if (endedId) {
    const last = [...state.log].reverse().find((e) => e.type === 'unlock' && e.siteId === site.id);
    if (last && last.stuck === undefined) {
      reflectId = last.id;
      $('reflectIntent').textContent = last.intention;
      return show('reflect');
    }
  }
  show('home');
}

function renderHabits(box) {
  box.replaceChildren(
    ...state.settings.alternatives.map(({ title, url }) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = url ? `${title} ↗` : title;
      b.onclick = async () => {
        await addLog({ type: 'redirected', siteId: site.id, habit: title });
        if (url) return location.assign(url);
        if (/nothing|still/i.test(title)) return goStill();
        $('chosenText').textContent = title;
        show('chosen');
      };
      return b;
    }),
  );
}

function renderForm() {
  const legend = document.createElement('legend');
  legend.textContent = 'This is…';
  $('cats').replaceChildren(
    legend,
    ...CATEGORIES.map((c) => {
      const label = document.createElement('label');
      label.className = 'cat';
      const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'cat', value: c.id });
      label.append(input, c.label);
      return label;
    }),
  );
  const opts = [5, 10, 15, 20, 30, 45, 60].filter((m) => m < site.maxMinutes);
  opts.push(site.maxMinutes);
  $('minutes').replaceChildren(
    ...opts.map((m) => Object.assign(document.createElement('option'), { value: m, textContent: `${m} minutes` })),
  );
  $('minutes').value = String(opts.find((m) => m >= 10) ?? opts[opts.length - 1]);
  $('left').textContent = `${Math.max(0, site.dailyUnlocks - unlocksToday())} of ${site.dailyUnlocks} unlocks left today`;
}

function startPause() {
  show('pause');
  const total = state.settings.pauseSeconds;
  let left = total;
  let i = 0;
  const btn = $('pauseContinue');
  btn.disabled = true;
  $('pausePrompt').textContent = PROMPTS[0];
  const timer = setInterval(tick, 1000);
  tick();
  function tick() {
    if (document.hidden) return; // the pause only counts while you're actually here
    $('pauseCount').textContent = left > 0 ? `${left}s` : '';
    if (left <= 0) {
      clearInterval(timer);
      btn.disabled = false;
      btn.focus();
      return;
    }
    if (left !== total && left % 5 === 0) $('pausePrompt').textContent = PROMPTS[++i % PROMPTS.length];
    left--;
  }
}

function goStill() {
  location.href = 'still.html?m=5';
}

$('toPause').onclick = startPause;
$('toStill').onclick = goStill;
$('toStill2').onclick = goStill;
$('pauseContinue').onclick = () => {
  show('form');
  $('intent').focus();
};
document.querySelectorAll('.close-tab').forEach((b) => (b.onclick = closeTab));

$('stuckYes').onclick = async () => {
  await updateLog(reflectId, { stuck: true });
  show('home');
};
$('stuckNo').onclick = async () => {
  await updateLog(reflectId, { stuck: false });
  show('home');
};

$('rewrite').onclick = () => {
  show('form');
  $('intent').focus();
};
$('appealBtn').onclick = () => {
  appealing = true;
  $('appealBox').hidden = false;
  show('form');
  $('appeal').focus();
};

$('intentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  state = await getState();
  const text = $('intent').value.trim();
  const category = document.querySelector('input[name="cat"]:checked')?.value;
  const minutes = Number($('minutes').value);
  const appeal = appealing ? $('appeal').value.trim() : '';
  const verdict = judgeIntention({
    text, category, site, log: state.log, extraVague: state.settings.extraVague, appeal,
  });

  if (!verdict.ok) {
    await addLog({ type: 'denied', siteId: site.id, intention: text, category, reasons: verdict.reasons });
    $('reasons').replaceChildren(
      ...verdict.reasons.map((r) => Object.assign(document.createElement('li'), { textContent: r })),
    );
    $('rewrite').hidden = !!verdict.limit;
    $('appealBtn').hidden = !!verdict.limit || appealing;
    return show('denied');
  }

  await addLog({ type: 'unlock', siteId: site.id, intention: text, category, minutes, ...(appeal && { appeal }) });
  await chrome.runtime.sendMessage({ type: 'unlock', siteId: site.id, intention: text, category, minutes });
  location.replace(dest);
});

init();
