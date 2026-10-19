import { getState, dayKey, todaySummary, addLog } from './shared.js';
import { PRAYERS, nextPrayer } from './prayer.js';
import { loadPortion, toArabicDigits } from './hifz.js';

const $ = (id) => document.getElementById(id);
const key = dayKey();
let state;

function renderClock() {
  const now = new Date();
  $('clock').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const greg = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  let hijri = '';
  try {
    hijri = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  } catch {}
  $('date').textContent = hijri ? `${greg} · ${hijri}` : greg;
}

async function saveDay(patch) {
  const { days } = await getState();
  days[key] = { ...(days[key] || {}), ...patch };
  // Keep about two months of history.
  const keys = Object.keys(days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete days[k];
  await chrome.storage.local.set({ days });
  state.days = days;
}

function renderFocus() {
  const focus = state.days[key]?.focus;
  $('focusForm').hidden = !!focus;
  $('focusShown').hidden = !focus;
  $('focusShown').textContent = focus || '';
  if (!focus) $('focus').focus();
}

function renderHabits() {
  const done = new Set(state.days[key]?.done || []);
  $('habitList').replaceChildren(
    ...state.settings.habits.map((h) => {
      const li = document.createElement('li');
      const label = document.createElement('label');
      const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: done.has(h) });
      box.onchange = () => {
        box.checked ? done.add(h) : done.delete(h);
        saveDay({ done: [...done] });
      };
      label.append(box, Object.assign(document.createElement('span'), { textContent: h }));
      li.append(label);
      return li;
    }),
  );
}

function renderStats() {
  const t = todaySummary(state.log);
  const parts = state.settings.sites.map((s) => {
    const u = t.unlocks.filter((e) => e.siteId === s.id);
    const mins = u.reduce((n, e) => n + e.minutes, 0);
    return `${s.name}: ${u.length} unlock${u.length === 1 ? '' : 's'}${mins ? ` (${mins} min)` : ''}`;
  });
  if (t.redirected) parts.push(`${t.redirected} urge${t.redirected === 1 ? '' : 's'} redirected`);
  if (t.denied) parts.push(`${t.denied} weak reason${t.denied === 1 ? '' : 's'} turned down`);
  if (t.stillMinutes) parts.push(`${t.stillMinutes} min of stillness`);
  $('stats').textContent = parts.join(' · ');
}

const fmtTime = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtIn = (ms) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

function renderPrayer() {
  const p = state.settings.prayer;
  const box = $('prayer');
  box.hidden = !p.enabled;
  if (!p.enabled) return;

  if (p.lat == null || p.lng == null) {
    box.innerHTML = `<div class="prayer-setup"><p class="muted">Show prayer times for where you are.</p>
      <button id="locate" class="primary">Use my location</button></div>`;
    $('locate').onclick = locate;
    return;
  }

  const now = new Date();
  const next = nextPrayer(p.lat, p.lng, p, now);
  const grid = document.createElement('div');
  grid.className = 'prayer-grid';
  for (const pr of PRAYERS) {
    const time = next.today[pr.id];
    const slot = document.createElement('div');
    slot.className = `slot ${pr.id}`;
    if (pr.id === next.id && next.time.toDateString() === now.toDateString()) slot.classList.add('next');
    else if (time < now) slot.classList.add('past');
    slot.append(
      Object.assign(document.createElement('div'), { className: 'n', textContent: pr.name }),
      Object.assign(document.createElement('div'), { className: 't', textContent: fmtTime(time) }),
    );
    grid.append(slot);
  }
  const line = document.createElement('p');
  line.className = 'prayer-next';
  line.append(Object.assign(document.createElement('strong'), { textContent: next.name }), ` in ${fmtIn(next.time - now)}`);
  box.replaceChildren(grid, line);
}

function locate() {
  const btn = $('locate');
  btn.disabled = true;
  btn.textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { settings } = await getState();
      settings.prayer = {
        ...settings.prayer,
        lat: +pos.coords.latitude.toFixed(4),
        lng: +pos.coords.longitude.toFixed(4),
      };
      await chrome.storage.local.set({ settings });
      state.settings = settings;
      renderPrayer();
    },
    () => {
      $('prayer').innerHTML = `<div class="prayer-setup"><p class="muted">Couldn't get your location.
        Turn on location for your browser, or enter it in settings.</p>
        <a class="btn" href="options.html#prayer">Open settings</a></div>`;
    },
    { timeout: 15_000 },
  );
}

// ---------- Memorisation ----------

let hideText = false;
let loop = false;
const player = new Audio();
let queue = [];

async function saveHifz(patch) {
  const { settings } = await getState();
  settings.hifz = { ...settings.hifz, ...patch };
  await chrome.storage.local.set({ settings });
  state.settings = settings;
}

const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

function stopAudio() {
  queue = [];
  player.pause();
  document.querySelectorAll('.playing').forEach((b) => b.classList.remove('playing'));
}

function play(items) {
  stopAudio();
  queue = items.slice();
  next();
  function next() {
    document.querySelectorAll('.playing').forEach((b) => b.classList.remove('playing'));
    const item = queue.shift();
    if (!item) {
      if (loop && items.length) return play(items);
      return;
    }
    item.btn.classList.add('playing');
    player.src = item.audio;
    player.onended = next;
    player.play().catch(stopAudio);
  }
}

async function renderHifz() {
  const h = state.settings.hifz;
  const details = $('hifzBox');
  const box = $('hifz');
  details.hidden = !h.enabled;
  if (!h.enabled) return;
  stopAudio();
  const setHead = (title, meta = '') => {
    $('hifzTitle').textContent = title;
    $('hifzMeta').textContent = meta;
  };
  const progress = el('div', { className: 'hifz-progress' }, el('div'));

  // Finished the surah (total is remembered from the last portion we loaded).
  if (h.total && h.from > h.total) {
    setHead(`You finished ${h.englishName || 'the surah'}`);
    progress.firstChild.style.width = '100%';
    const nextBtn = el('button', { className: 'primary', textContent: 'Start the next surah' });
    nextBtn.onclick = async () => {
      await saveHifz({ surah: Math.min(114, h.surah + 1), from: 1, practiceDays: [], total: null, englishName: null });
      renderHifz();
    };
    const again = el('button', { textContent: 'Revise this surah from the start' });
    again.onclick = async () => {
      await saveHifz({ from: 1, practiceDays: [] });
      renderHifz();
    };
    box.replaceChildren(
      progress,
      el('p', { className: 'muted', textContent: 'Alhamdulillah. Keep revising it in your salah so it stays.' }),
      el('div', { className: 'row hifz-actions' }, nextBtn, again),
    );
    return;
  }

  if (!$('hifzTitle').textContent.includes('·')) setHead(h.englishName || 'Memorising');
  box.replaceChildren(el('p', { className: 'muted', textContent: 'Loading your ayahs…' }));
  let portion;
  try {
    portion = await loadPortion(h.surah, h.from, h.count);
  } catch {
    box.replaceChildren(el('p', { className: 'muted', textContent: "Couldn't load your ayahs. Check your internet connection." }));
    return;
  }
  if (h.total !== portion.total || h.englishName !== portion.englishName) {
    await saveHifz({ total: portion.total, englishName: portion.englishName });
  }
  const first = portion.ayahs[0].n;
  const last = portion.ayahs.at(-1).n;
  setHead(`${portion.englishName} · ${first === last ? `ayah ${first}` : `ayahs ${first}–${last}`}`, `${portion.total} ayahs`);
  progress.firstChild.style.width = `${Math.min(100, ((h.from - 1) / portion.total) * 100)}%`;

  const list = el('div', { className: hideText ? 'hidden-text' : '' });
  const playable = [];
  for (const a of portion.ayahs) {
    const endMark = el('span', { className: 'end-mark quran', textContent: `﴿${toArabicDigits(a.n)}﴾` });
    let arabic;
    if (h.wordByWord && a.words?.length) {
      // Word by word: Arabic, transliteration and meaning stacked under each word.
      arabic = el('div', { className: 'words' },
        ...a.words.map((w) =>
          el('div', { className: 'word' },
            el('span', { className: 'w-ar quran', textContent: w.ar }),
            el('span', { className: 'w-tr', textContent: w.tr }),
            el('span', { className: 'w-en', textContent: w.en }))),
        endMark);
    } else {
      arabic = el('div', { className: 'ayah-ar quran' }, `${a.ar} `, endMark);
    }
    arabic.onclick = () => arabic.classList.toggle('peek');

    const btn = el('button', { textContent: `▶ ${a.n}`, title: 'Listen' });
    btn.onclick = () => play([{ audio: a.audio, btn }]);
    playable.push({ audio: a.audio, btn });

    const ayah = el('div', { className: 'ayah' }, arabic);
    const line = (text, src) => el('div', { className: 'ayah-line' }, text, el('span', { className: 'src', textContent: `— ${src}` }));
    if (h.transliteration && a.translit) ayah.append(line(a.translit, 'Transliteration'));
    if (h.translation && a.en) ayah.append(line(a.en, 'Sahih International'));
    if (a.audio) ayah.append(el('div', { className: 'ayah-tools' }, btn));
    list.append(ayah);
  }

  const playAll = el('button', { textContent: '▶ Play all' });
  playAll.onclick = () => play(playable);
  const loopBtn = el('button', { textContent: loop ? '🔁 Repeat on' : '🔁 Repeat off' });
  loopBtn.onclick = () => {
    loop = !loop;
    loopBtn.textContent = loop ? '🔁 Repeat on' : '🔁 Repeat off';
  };
  const hideBtn = el('button', { textContent: hideText ? 'Show text' : 'Test myself (hide text)' });
  hideBtn.onclick = () => {
    hideText = !hideText;
    list.className = hideText ? 'hidden-text' : '';
    list.querySelectorAll('.peek').forEach((x) => x.classList.remove('peek'));
    hideBtn.textContent = hideText ? 'Show text' : 'Test myself (hide text)';
  };

  const done = el('button', { className: 'primary', textContent: '✓ Memorised, next ayahs' });
  done.onclick = async () => {
    const memorised = [...h.memorised, { surah: h.surah, englishName: portion.englishName, from: first, to: last, ts: Date.now() }].slice(-200);
    await saveHifz({ from: last + 1, practiceDays: [], memorised });
    hideText = false;
    renderHifz();
  };
  const keep = el('button', { textContent: 'Not yet, keep these' });
  keep.onclick = async () => {
    const days = new Set(h.practiceDays);
    days.add(key);
    await saveHifz({ practiceDays: [...days] });
    renderHifz();
  };
  const back = el('button', { className: 'ghost', textContent: '‹ Previous ayahs' });
  back.hidden = h.from <= 1;
  back.onclick = async () => {
    await saveHifz({ from: Math.max(1, h.from - h.count), practiceDays: [] });
    renderHifz();
  };

  const practised = h.practiceDays.length;
  const note = practised
    ? `Practised on ${practised} day${practised === 1 ? '' : 's'}. Keep going; repetition is how it sticks.`
    : 'Listen, repeat each ayah until you can say it without looking, then test yourself.';

  box.replaceChildren(
    progress,
    el('div', { className: 'row' }, playAll, loopBtn, hideBtn),
    list,
    el('div', { className: 'row hifz-actions' }, done, keep, back),
    el('p', { className: 'hifz-note', textContent: note }),
  );
}

// Remember whether the memorisation card is open or closed.
function setupHifzToggle() {
  const details = $('hifzBox');
  try {
    details.open = localStorage.getItem('intentHifzOpen') !== '0';
  } catch {
    details.open = true;
  }
  details.addEventListener('toggle', () => {
    try { localStorage.setItem('intentHifzOpen', details.open ? '1' : '0'); } catch {}
    if (!details.open) stopAudio();
  });
}

function renderInstead() {
  $('instead').replaceChildren(
    ...state.settings.alternatives.map((a) => {
      if (!a.url && !/nothing|still/i.test(a.title)) return Object.assign(document.createElement('span'), { textContent: a.title });
      const link = Object.assign(document.createElement('a'), {
        className: 'btn',
        textContent: a.title,
        href: a.url || 'still.html?m=5',
      });
      link.onclick = () => addLog({ type: 'redirected', siteId: 'newtab', habit: a.title });
      return link;
    }),
  );
}

$('focusForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = $('focus').value.trim();
  if (!v) return;
  await saveDay({ focus: v });
  renderFocus();
});
$('focusShown').onclick = () => {
  $('focus').value = state.days[key]?.focus || '';
  $('focusForm').hidden = false;
  $('focusShown').hidden = true;
  $('focus').focus();
};

(async () => {
  state = await getState();
  renderClock();
  setInterval(renderClock, 10_000);
  renderFocus();
  renderHabits();
  renderInstead();
  renderStats();
  renderPrayer();
  setupHifzToggle();
  renderHifz();
  setInterval(() => state.settings.prayer.lat != null && renderPrayer(), 30_000);
})();
