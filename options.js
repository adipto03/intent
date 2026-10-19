import { getState, CATEGORIES, THEMES } from './shared.js';
import { METHODS, PRAYERS } from './prayer.js';
import { surahList } from './hifz.js';

const $ = (id) => document.getElementById(id);
let state;

const cleanDomain = (d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

function siteRow(site = { id: '', name: '', domains: [], maxMinutes: 15, dailyUnlocks: 2 }) {
  const row = document.createElement('div');
  row.className = 'site-row';
  row.dataset.id = site.id;
  const field = (label, name, value, type = 'text') => {
    const l = document.createElement('label');
    l.textContent = label;
    l.append(Object.assign(document.createElement('input'), { name, value, type, min: 1 }));
    return l;
  };
  const remove = Object.assign(document.createElement('button'), { type: 'button', className: 'ghost', textContent: 'Remove' });
  remove.onclick = () => row.remove();
  row.append(
    field('Name', 'name', site.name),
    field('Domains (comma separated)', 'domains', site.domains.join(', ')),
    field('Max minutes', 'maxMinutes', site.maxMinutes, 'number'),
    field('Unlocks / day', 'dailyUnlocks', site.dailyUnlocks, 'number'),
    remove,
  );
  return row;
}

function altRow(alt = { title: '', url: '' }) {
  const row = document.createElement('div');
  row.className = 'alt-row';
  const field = (label, name, value, placeholder) => {
    const l = document.createElement('label');
    l.textContent = label;
    l.append(Object.assign(document.createElement('input'), { name, value, placeholder }));
    return l;
  };
  const remove = Object.assign(document.createElement('button'), { type: 'button', className: 'ghost', textContent: 'Remove' });
  remove.onclick = () => row.remove();
  row.append(field('What to do', 'title', alt.title, 'e.g. Memorise one ayah'), field('Link (optional)', 'url', alt.url, 'https://…'), remove);
  return row;
}

function renderSettings() {
  const s = state.settings;
  $('sites').replaceChildren(...s.sites.map((site) => siteRow(site)));
  $('pauseSeconds').value = s.pauseSeconds;
  $('hideDistractions').checked = s.hideDistractions;
  $('habits').value = s.habits.join('\n');
  $('extraVague').value = s.extraVague.join('\n');
  $('alts').replaceChildren(...s.alternatives.map((a) => altRow(a)));
  renderThemes();
  renderPrayerSettings();
  renderHifzSettings();
}

let surahs = [];
async function renderHifzSettings() {
  const h = state.settings.hifz;
  $('hEnabled').checked = h.enabled;
  $('hFrom').value = h.from;
  $('hCount').value = String(h.count);
  $('hTranslation').checked = h.translation;
  $('hTranslit').checked = h.transliteration;
  $('hWords').checked = h.wordByWord;

  // Group memorised portions by surah: "Ar-Rahmaan: 1–12".
  const bySurah = new Map();
  for (const m of h.memorised) {
    const s = bySurah.get(m.surah) || { name: m.englishName, ranges: [] };
    s.ranges.push(m.from === m.to ? `${m.from}` : `${m.from}–${m.to}`);
    bySurah.set(m.surah, s);
  }
  $('hDone').textContent = bySurah.size
    ? [...bySurah.values()].map((s) => `${s.name}: ayahs ${s.ranges.join(', ')}`).join(' · ')
    : 'Nothing marked yet.';

  try {
    surahs = await surahList();
    $('hSurah').replaceChildren(
      ...surahs.map((s) =>
        Object.assign(document.createElement('option'), { value: s.number, textContent: `${s.number}. ${s.englishName} (${s.meaning}) · ${s.ayahs} ayahs` }),
      ),
    );
    $('hSurah').value = String(h.surah);
  } catch {
    $('hSurah').replaceChildren(Object.assign(document.createElement('option'), { textContent: "Couldn't load surahs (offline?)" }));
  }
}

$('hSurah').onchange = () => {
  $('hFrom').value = 1;
};
$('hSave').onclick = async () => {
  const surah = Number($('hSurah').value) || state.settings.hifz.surah;
  const info = surahs.find((s) => s.number === surah);
  const total = info?.ayahs || 286;
  const from = Math.min(total, Math.max(1, Number($('hFrom').value) || 1));
  const changedPlace = surah !== state.settings.hifz.surah || from !== state.settings.hifz.from;
  await save({
    hifz: {
      ...state.settings.hifz,
      enabled: $('hEnabled').checked,
      surah,
      from,
      total: info?.ayahs ?? null,
      englishName: info?.englishName ?? null,
      count: Number($('hCount').value),
      translation: $('hTranslation').checked,
      transliteration: $('hTranslit').checked,
      wordByWord: $('hWords').checked,
      ...(changedPlace && { practiceDays: [] }),
    },
  });
  $('hFrom').value = from;
  flash('hSaved', 'Saved.');
};

function renderThemes() {
  $('themes').replaceChildren(
    ...THEMES.map((t) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'theme' });
      b.setAttribute('aria-pressed', String(state.settings.theme === t.id));
      // Preview the theme's own colours by scoping data-theme to the swatch.
      const sw = document.createElement('div');
      sw.className = 'swatch';
      if (t.id !== 'auto') sw.dataset.theme = t.id;
      sw.style.background = t.id === 'auto' ? 'linear-gradient(135deg,#f5f2ec 50%,#131311 50%)' : 'var(--bg)';
      for (const v of ['--ink', '--accent', '--surface']) {
        const dot = document.createElement('i');
        dot.style.background = `var(${v})`;
        sw.append(dot);
      }
      b.append(sw, t.name);
      b.onclick = async () => {
        await save({ theme: t.id });
        renderThemes();
      };
      return b;
    }),
  );
}

function renderPrayerSettings() {
  const p = state.settings.prayer;
  $('pEnabled').checked = p.enabled;
  $('pMethod').replaceChildren(
    ...Object.entries(METHODS).map(([id, m]) => Object.assign(document.createElement('option'), { value: id, textContent: m.name })),
  );
  $('pMethod').value = p.method;
  $('pAsr').value = p.asr;
  $('pLat').value = p.lat ?? '';
  $('pLng').value = p.lng ?? '';
  $('pOffsets').replaceChildren(
    ...PRAYERS.filter((x) => x.id !== 'sunrise').map((x) => {
      const l = document.createElement('label');
      l.textContent = x.name;
      l.append(Object.assign(document.createElement('input'), { type: 'number', step: 1, name: x.id, value: p.offsets[x.id] || 0 }));
      return l;
    }),
  );
}

async function save(patch) {
  const { settings } = await getState();
  await chrome.storage.local.set({ settings: { ...settings, ...patch } });
  state = await getState();
}

const flash = (id, text) => {
  $(id).textContent = text;
  setTimeout(() => ($(id).textContent = ''), 2500);
};

function readSettings() {
  const sites = [...document.querySelectorAll('.site-row')]
    .map((row) => {
      const v = (n) => row.querySelector(`[name="${n}"]`).value;
      const name = v('name').trim();
      const domains = v('domains').split(',').map(cleanDomain).filter(Boolean);
      if (!name || !domains.length) return null;
      return {
        id: row.dataset.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 6),
        name,
        domains,
        maxMinutes: Math.max(1, Number(v('maxMinutes')) || 10),
        dailyUnlocks: Math.max(0, Number(v('dailyUnlocks')) || 0),
      };
    })
    .filter(Boolean);
  return {
    sites,
    pauseSeconds: Math.min(300, Math.max(5, Number($('pauseSeconds').value) || 20)),
    hideDistractions: $('hideDistractions').checked,
    extraVague: lines('extraVague'),
  };
}

const lines = (id) => $(id).value.split('\n').map((l) => l.trim()).filter(Boolean);
const normalizeUrl = (u) => {
  u = u.trim();
  if (!u) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : 'https://' + u;
};

$('addAlt').onclick = () => $('alts').append(altRow());
$('aSave').onclick = async () => {
  const alternatives = [...document.querySelectorAll('.alt-row')]
    .map((row) => ({
      title: row.querySelector('[name="title"]').value.trim(),
      url: normalizeUrl(row.querySelector('[name="url"]').value),
    }))
    .filter((a) => a.title);
  await save({ alternatives, habits: lines('habits') });
  renderSettings();
  flash('aSaved', 'Saved.');
};

$('pLocate').onclick = () => {
  $('pLocMsg').textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      $('pLat').value = pos.coords.latitude.toFixed(4);
      $('pLng').value = pos.coords.longitude.toFixed(4);
      $('pLocMsg').textContent = 'Found. Press save.';
    },
    () => ($('pLocMsg').textContent = "Couldn't get your location. Check that location is on for your browser, or type it in (search \"<your city> latitude longitude\")."),
    { timeout: 15_000 },
  );
};
$('pSave').onclick = async () => {
  const num = (id) => ($(id).value === '' ? null : Number($(id).value));
  const offsets = Object.fromEntries([...$('pOffsets').querySelectorAll('input')].map((i) => [i.name, Number(i.value) || 0]));
  await save({
    prayer: { enabled: $('pEnabled').checked, method: $('pMethod').value, asr: $('pAsr').value, lat: num('pLat'), lng: num('pLng'), offsets },
  });
  flash('pSaved', 'Saved.');
};

function renderJournal() {
  const names = Object.fromEntries(state.settings.sites.map((s) => [s.id, s.name]));
  const cats = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
  const weekAgo = Date.now() - 7 * 864e5;
  const week = state.log.filter((e) => e.ts > weekAgo);
  const unlocks = week.filter((e) => e.type === 'unlock');
  const reflected = unlocks.filter((e) => e.stuck !== undefined);
  const stuck = reflected.filter((e) => e.stuck).length;
  const mins = unlocks.reduce((n, e) => n + e.minutes, 0);
  const still = week.filter((e) => e.type === 'still').reduce((n, e) => n + e.minutes, 0);
  $('summary').textContent =
    `Last 7 days: ${unlocks.length} unlocks (${mins} min), ` +
    (reflected.length ? `stuck to your intention ${stuck} of ${reflected.length} times, ` : '') +
    `${week.filter((e) => e.type === 'redirected').length} urges redirected, ${still} min of stillness.`;

  const label = { unlock: 'Unlocked', denied: 'Turned down', redirected: 'Redirected', still: 'Stillness' };
  $('journal').replaceChildren(
    ...[...state.log].reverse().slice(0, 200).map((e) => {
      const tr = document.createElement('tr');
      const when = new Date(e.ts).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const td = (text, cls) => Object.assign(document.createElement('td'), { textContent: text, className: cls || '' });
      const tag = document.createElement('td');
      tag.append(Object.assign(document.createElement('span'), { className: `tag ${e.type}`, textContent: label[e.type] || e.type }));
      const body = document.createElement('td');
      if (e.type === 'still') body.textContent = `${e.minutes} min doing nothing`;
      else if (e.type === 'redirected') body.textContent = `${names[e.siteId] || 'New tab'} →${e.habit}`;
      else {
        body.append(Object.assign(document.createElement('div'), { textContent: e.intention || '(empty)' }));
        const sub = [names[e.siteId], cats[e.category], e.minutes && `${e.minutes} min`];
        if (e.stuck !== undefined) sub.push(e.stuck ? 'stuck to it ✓' : 'drifted');
        if (e.reasons) sub.push(e.reasons.join(' '));
        body.append(Object.assign(document.createElement('div'), { className: 'sub', textContent: sub.filter(Boolean).join(' · ') }));
      }
      tr.append(td(when), tag, body);
      return tr;
    }),
  );
}

$('addSite').onclick = () => $('sites').append(siteRow());
$('save').onclick = async () => {
  if ($('confirm').value.trim().toLowerCase() !== 'on purpose') {
    $('saved').textContent = 'Type "on purpose" first.';
    return;
  }
  await save(readSettings());
  renderSettings();
  $('confirm').value = '';
  $('saved').textContent = 'Saved.';
};

(async () => {
  state = await getState();
  renderSettings();
  renderJournal();
})();
