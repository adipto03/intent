// Quran memorisation: text, translation and audio come from api.alquran.cloud
// and are cached in extension storage, so each portion is downloaded once.

const API = 'https://api.alquran.cloud/v1';
// Strip vowel marks so letters can be compared regardless of how diacritics are encoded.
const bare = (w) => w.replace(/[ً-ٰٟۖ-ۭ]/g, '');

export async function surahList() {
  const { surahs } = await chrome.storage.local.get('surahs');
  if (surahs?.length === 114) return surahs;
  const res = await fetch(`${API}/surah`);
  if (!res.ok) throw new Error('Could not load the surah list');
  const list = (await res.json()).data.map((s) => ({
    number: s.number,
    name: s.name,
    englishName: s.englishName,
    meaning: s.englishNameTranslation,
    ayahs: s.numberOfAyahs,
  }));
  await chrome.storage.local.set({ surahs: list });
  return list;
}

const QURAN_COM = 'https://api.quran.com/api/v4';
const stripTags = (s) => (s || '').replace(/<[^>]*>/g, '');

// Word-by-word Arabic (in the KFGQPC Hafs encoding), transliteration and meaning from quran.com.
async function wordsFor(surah, n) {
  const res = await fetch(
    `${QURAN_COM}/verses/by_key/${surah}:${n}?words=true&word_fields=text_qpc_hafs&fields=text_qpc_hafs`,
  );
  if (!res.ok) throw new Error('quran.com unavailable');
  const v = (await res.json()).verse;
  return {
    qpc: v.text_qpc_hafs.replace(/\s*[٠-٩]+$/, ''),
    words: v.words
      .filter((w) => w.char_type_name === 'word')
      .map((w) => ({ ar: w.text_qpc_hafs, tr: w.transliteration?.text || '', en: w.translation?.text || '' })),
  };
}

// Returns { surah, englishName, name, total, ayahs: [{ n, ar, en, translit, audio, words }] }.
export async function loadPortion(surah, from, count) {
  const key = `v2:${surah}:${from}:${count}`;
  const { hifzCache = {} } = await chrome.storage.local.get('hifzCache');
  if (hifzCache[key]) return hifzCache[key];

  const res = await fetch(
    `${API}/surah/${surah}/editions/quran-uthmani,en.sahih,ar.alafasy,en.transliteration?offset=${from - 1}&limit=${count}`,
  );
  if (!res.ok) throw new Error('Could not load these ayahs');
  const [ar, en, audio, translit] = (await res.json()).data;
  // Word-by-word is a bonus: if quran.com is down, the ayahs still show.
  const extra = await Promise.allSettled(ar.ayahs.map((a) => wordsFor(surah, a.numberInSurah)));
  const portion = {
    surah,
    name: ar.name,
    englishName: ar.englishName,
    total: ar.numberOfAyahs,
    ayahs: ar.ayahs.map((a, i) => {
      let text = a.text.trim();
      // This text edition puts the Bismillah (4 words) inside ayah 1; it isn't part of the ayah (except Al-Fatiha).
      const words = text.split(/\s+/);
      if (surah !== 1 && a.numberInSurah === 1 && words.length > 4 && bare(words[0]) === 'بسم') text = words.slice(4).join(' ');
      const qc = extra[i].status === 'fulfilled' ? extra[i].value : null;
      return {
        n: a.numberInSurah,
        ar: qc?.qpc || text,
        en: en.ayahs[i]?.text || '',
        translit: stripTags(translit.ayahs[i]?.text),
        audio: audio.ayahs[i]?.audio || '',
        words: qc?.words || [],
      };
    }),
  };

  // Don't cache a portion missing its word-by-word data, so it's retried next time.
  if (extra.some((e) => e.status !== 'fulfilled')) return portion;

  // Keep the cache small: the 12 most recent portions.
  const keys = Object.keys(hifzCache);
  for (const k of keys.slice(0, Math.max(0, keys.length - 11))) delete hifzCache[k];
  hifzCache[key] = portion;
  await chrome.storage.local.set({ hifzCache });
  return portion;
}

export const toArabicDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
