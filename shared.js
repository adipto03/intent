// Shared settings, storage helpers and the intention "judge".

export const DEFAULT_SETTINGS = {
  sites: [
    { id: 'youtube', name: 'YouTube', domains: ['youtube.com', 'youtu.be'], maxMinutes: 30, dailyUnlocks: 3 },
    { id: 'instagram', name: 'Instagram', domains: ['instagram.com'], maxMinutes: 10, dailyUnlocks: 2 },
  ],
  pauseSeconds: 20,
  hideDistractions: true,
  habits: [
    'Read a book for 20 minutes',
    'Learn about Islam: Quran with tafsir, or a hadith',
    'Deep work on my YouTube channel or business',
    'Eat a meal without a screen',
    'Do nothing for 5 minutes',
  ],
  extraVague: [],
  // Shown when a site is blocked and on the new tab. url is optional.
  alternatives: [
    { title: 'Read Quran with translation', url: 'https://quran.com' },
    { title: 'Read a hadith', url: 'https://sunnah.com' },
    { title: 'Read a book for 20 minutes', url: '' },
    { title: 'Work on my next video', url: '' },
    { title: 'Go for a walk', url: '' },
    { title: 'Do nothing for 5 minutes', url: '' },
  ],
  theme: 'auto',
  hifz: {
    enabled: true,
    surah: 55,
    from: 1,
    count: 3,
    translation: true,
    transliteration: true,
    wordByWord: true,
    practiceDays: [], // days you pressed "keep practising" on the current portion
    memorised: [], // { surah, englishName, from, to, ts }
  },
  prayer: {
    enabled: true,
    method: 'MWL',
    asr: 'standard',
    lat: null,
    lng: null,
    offsets: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
  },
};

export const THEMES = [
  { id: 'auto', name: 'Match system' },
  { id: 'sand', name: 'Sand' },
  { id: 'paper', name: 'Paper' },
  { id: 'night', name: 'Night' },
  { id: 'forest', name: 'Forest' },
  { id: 'midnight', name: 'Midnight' },
  { id: 'dusk', name: 'Dusk' },
  { id: 'oled', name: 'Black' },
];

export const CATEGORIES = [
  { id: 'learn', label: 'Learning a specific skill or topic' },
  { id: 'islam', label: 'Islamic knowledge: a lecture, tafsir, Quran recitation' },
  { id: 'work', label: 'Research or work for my channel or business' },
  { id: 'specific', label: 'A specific video, post or message someone sent me' },
  { id: 'other', label: 'Something else (needs more explanation)' },
];

export async function getState() {
  const s = await chrome.storage.local.get(['settings', 'sessions', 'log', 'days']);
  const stored = s.settings || {};
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...stored,
      prayer: {
        ...DEFAULT_SETTINGS.prayer,
        ...(stored.prayer || {}),
        offsets: { ...DEFAULT_SETTINGS.prayer.offsets, ...(stored.prayer?.offsets || {}) },
      },
      hifz: { ...DEFAULT_SETTINGS.hifz, ...(stored.hifz || {}) },
    },
    sessions: s.sessions || {},
    log: s.log || [],
    days: s.days || {},
  };
}

export async function addLog(entry) {
  const { log } = await getState();
  const e = { id: crypto.randomUUID(), ts: Date.now(), ...entry };
  log.push(e);
  await chrome.storage.local.set({ log: log.slice(-1500) });
  return e;
}

export async function updateLog(id, patch) {
  const { log } = await getState();
  const e = log.find((x) => x.id === id);
  if (e) Object.assign(e, patch);
  await chrome.storage.local.set({ log });
}

export function hostMatches(domains, url) {
  try {
    const h = new URL(url).hostname;
    return domains.some((d) => h === d || h.endsWith('.' + d));
  } catch {
    return false;
  }
}

export const siteForUrl = (settings, url) => settings.sites.find((s) => hostMatches(s.domains, url));

export function dayKey(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const isToday = (ts) => dayKey(ts) === dayKey();

export function todaySummary(log) {
  const today = log.filter((e) => isToday(e.ts));
  const of = (type) => today.filter((e) => e.type === type);
  return {
    unlocks: of('unlock'),
    denied: of('denied').length,
    redirected: of('redirected').length,
    stillMinutes: of('still').reduce((n, e) => n + (e.minutes || 0), 0),
  };
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const wordCount = (s) => s.trim().split(/\s+/).filter(Boolean).length;

// Each rule: a pattern that signals a mindless reason, and what to tell yourself instead.
const RULES = [
  [/\b(bored|boring|boredom|nothing (else )?to do)\b/, "Boredom isn't a reason to open it. It's the thing you're practising. Try sitting with it for a few minutes."],
  [/\b(kill|pass|waste|killing|passing|wasting) (some |the )?time\b/, 'Killing time is exactly the habit you want to break.'],
  [/\b(chill|chilling|relax|relaxing|unwind|vibe|vibing|decompress|zone out)\b/, "Rest is good, but scrolling isn't rest. Try the stillness timer, a walk, or lying down."],
  [/\b(scroll|scrolling|browse|browsing|feed|reels|shorts|trending|recommended|explore page|for you page|fyp)\b/, "Scrolling the feed is the mindless mode you're trying to leave."],
  [/\bsee what'?s? (new|up|on|happening)\b|\bcatch(ing)? up\b|\bwhat'?s new\b/, '"What\'s new" has no finish line. Name the exact thing.'],
  [/\b(just|quick(ly)?|quickly) (a )?(look|check|peek|watch|see|browse)\b|\bquick (look|check|peek)\b/, '"Just checking" has no finish line. What exactly?'],
  [/\b(something|anything|whatever|random|idk|dunno|not sure|stuff)\b/, "That's not specific yet. Name the video, topic or person."],
  [/\bprocrastinat\w*/, "That's honest, and it's also the reason to stay paused. Do 10 minutes of the real task first."],
  [/\b(fun|funny|memes?|entertain\w*|comedy|drama|gossip)\b/, 'Autopilot entertainment is what you want less of.'],
  [/\b(eat|eats|eating|ate|lunch|dinner|breakfast|brunch|supper|meal|meals|snack|snacking|munch\w*|iftar|suhoor|sehri|takeaway|takeout)\b/, 'You wanted to eat without a screen. Put it away, say bismillah, and taste your food.'],
  [/\b(movie|movies|film|films|netflix|anime|binge\w*|sitcom|tv show|tv series|k-?drama)\b/, 'Movies and shows on a whim are the mindless mode. If you want one, plan it ahead, not in the moment.'],
  [/\b(break|tired|sleepy|can'?t sleep|exhausted)\b/, 'If you need a break, take a real one: the stillness timer, water, a short walk, or wudu.'],
];

export function judgeIntention({ text, category, site, log, extraVague = [], appeal = '' }) {
  const used = log.filter((e) => e.type === 'unlock' && e.siteId === site.id && isToday(e.ts)).length;
  if (used >= site.dailyUnlocks) {
    return { ok: false, limit: true, reasons: [`You've used all ${site.dailyUnlocks} ${site.name} unlocks for today. Tomorrow is a new day.`] };
  }

  const reasons = [];
  const t = text.trim().toLowerCase();
  if (!category) reasons.push('Pick what kind of use this is.');

  // Appeal path: you argue your case at length instead of passing the keyword checks.
  if (appeal) {
    if (wordCount(t) < 5) reasons.push('Still describe what you will do in at least 5 words.');
    const aw = wordCount(appeal);
    if (aw < 25) reasons.push(`Your explanation needs at least 25 words (you have ${aw}). Make the case to yourself properly.`);
    return { ok: reasons.length === 0, reasons };
  }

  const minWords = category === 'other' ? 10 : 5;
  if (wordCount(t) < minWords) {
    reasons.push(`Too short to be intentional. Use at least ${minWords} words: what exactly, and what will you do when it's done?`);
  }
  for (const [re, msg] of RULES) if (re.test(t)) reasons.push(msg);
  for (const w of extraVague) {
    if (w && t.includes(w.toLowerCase())) reasons.push(`"${w}" is on your own list of not-good-enough reasons.`);
  }
  return { ok: reasons.length === 0, reasons };
}
