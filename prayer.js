// Prayer times calculated locally (based on the PrayTimes.org algorithm).
// Nothing is sent over the network.

export const METHODS = {
  MWL: { name: 'Muslim World League', fajr: 18, isha: 17 },
  ISNA: { name: 'ISNA (North America)', fajr: 15, isha: 15 },
  Egypt: { name: 'Egyptian General Authority', fajr: 19.5, isha: 17.5 },
  Makkah: { name: 'Umm al-Qura, Makkah', fajr: 18.5, ishaMinutes: 90 },
  Karachi: { name: 'Univ. of Islamic Sciences, Karachi', fajr: 18, isha: 18 },
  Gulf: { name: 'Gulf region', fajr: 19.5, ishaMinutes: 90 },
  Singapore: { name: 'Singapore / Malaysia / Indonesia', fajr: 20, isha: 18 },
  Turkey: { name: 'Diyanet (Turkey)', fajr: 18, isha: 17 },
};

export const PRAYERS = [
  { id: 'fajr', name: 'Fajr' },
  { id: 'sunrise', name: 'Sunrise' },
  { id: 'dhuhr', name: 'Dhuhr' },
  { id: 'asr', name: 'Asr' },
  { id: 'maghrib', name: 'Maghrib' },
  { id: 'isha', name: 'Isha' },
];

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const sin = (d) => Math.sin(rad(d));
const cos = (d) => Math.cos(rad(d));
const tan = (d) => Math.tan(rad(d));
const asin = (x) => deg(Math.asin(x));
const acos = (x) => deg(Math.acos(x));
const atan2 = (y, x) => deg(Math.atan2(y, x));
const acot = (x) => deg(Math.atan(1 / x));
const fix = (a, b) => {
  a -= b * Math.floor(a / b);
  return a < 0 ? a + b : a;
};

function julian(y, m, d) {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

function sunPosition(jd) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * sin(g) + 0.02 * sin(2 * g), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = atan2(cos(e) * sin(L), cos(L)) / 15;
  return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - fix(RA, 24) };
}

// Returns { fajr, sunrise, dhuhr, asr, maghrib, isha } as Date objects for the given day.
export function prayerTimes(date, lat, lng, { method = 'MWL', asr = 'standard', offsets = {} } = {}) {
  const m = METHODS[method] || METHODS.MWL;
  const y = date.getFullYear();
  const mo = date.getMonth();
  const d = date.getDate();
  const jDate = julian(y, mo + 1, d) - lng / (15 * 24);

  const midDay = (t) => fix(12 - sunPosition(jDate + t).eqt, 24);
  const angleTime = (angle, t, ccw) => {
    const { decl } = sunPosition(jDate + t);
    const v = acos((-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15;
    return midDay(t) + (ccw ? -v : v);
  };
  const asrTime = (factor, t) => {
    const { decl } = sunPosition(jDate + t);
    return angleTime(-acot(factor + tan(Math.abs(lat - decl))), t);
  };

  const p = (h) => h / 24;
  // Start from rough guesses, then refine using the sun's position at each estimated time.
  let t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18 };
  for (let i = 0; i < 3; i++) {
    t = {
      fajr: angleTime(m.fajr, p(t.fajr), true),
      sunrise: angleTime(0.833, p(t.sunrise), true),
      dhuhr: midDay(p(t.dhuhr)),
      asr: asrTime(asr === 'hanafi' ? 2 : 1, p(t.asr)),
      maghrib: angleTime(0.833, p(t.maghrib)),
    };
  }
  t.isha = m.ishaMinutes ? t.maghrib + m.ishaMinutes / 60 : angleTime(m.isha, p(18));

  // High latitudes: when the sun never gets low enough, use a portion of the night instead.
  const night = fix(t.sunrise - t.maghrib, 24);
  const fajrMax = (m.fajr / 60) * night;
  if (isNaN(t.fajr) || fix(t.sunrise - t.fajr, 24) > fajrMax) t.fajr = t.sunrise - fajrMax;
  if (!m.ishaMinutes) {
    const ishaMax = (m.isha / 60) * night;
    if (isNaN(t.isha) || fix(t.isha - t.maghrib, 24) > ishaMax) t.isha = t.maghrib + ishaMax;
  }

  const midnight = new Date(y, mo, d).getTime();
  const tz = -new Date(y, mo, d, 12).getTimezoneOffset() / 60;
  const out = {};
  for (const [k, h] of Object.entries(t)) {
    const local = h + tz - lng / 15 + (offsets[k] || 0) / 60;
    out[k] = new Date(Math.round((midnight + local * 3_600_000) / 60_000) * 60_000);
  }
  return out;
}

export function nextPrayer(lat, lng, opts, now = new Date()) {
  const today = prayerTimes(now, lat, lng, opts);
  for (const pr of PRAYERS) {
    if (pr.id !== 'sunrise' && today[pr.id] > now) return { ...pr, time: today[pr.id], today };
  }
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { ...PRAYERS[0], time: prayerTimes(tomorrow, lat, lng, opts).fajr, today };
}
