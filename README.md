# Intent

A browser extension for using your laptop on purpose. YouTube and Instagram stay paused until you name a real reason, and your new tab becomes a calm home screen with prayer times, Quran memorisation and the habits you actually want to build.

Works in Chrome, Brave and Edge.

## Install

1. Click the green **Code** button on this page, then **Download ZIP**, and unzip it somewhere you won't delete.
2. Open `chrome://extensions` (or `brave://extensions` / `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the unzipped folder (the one containing `manifest.json`).
5. Pin the Intent icon to your toolbar.

To update, download the new ZIP, replace the folder, and click reload ↻ on Intent.

## What it does

**Blocking with intention**
- Opening YouTube or Instagram shows a pause page with a 20-second breathing pause.
- To get in, pick a category, write exactly what you'll do, and choose how long.
  Vague reasons ("bored", "just checking", "scroll", "while I eat", "movie") are turned down.
- If a real reason gets caught, you can argue your case in 25+ words.
- Daily limits: YouTube 3 unlocks of up to 30 minutes, Instagram 2 of up to 10 (adjustable).
- While unlocked, a banner shows your reason and a countdown. The YouTube home feed, Shorts,
  recommendations and end screens are hidden, as are Instagram Reels and Explore.
- When time's up it locks again and asks whether you stuck to your reason.

**New tab**
- Prayer times for your location, calculated on your laptop (several methods, Hanafi or
  standard Asr, per-prayer minute adjustments).
- "What did you open your laptop for?" and a daily habits checklist.
- Quran memorisation: a few ayahs at a time with word-by-word transliteration and meaning,
  recitation by Mishary Alafasy, and a hide-text self test.
- "Instead of scrolling": your own list of better things to do, with optional links.
- Stare at the wall: a 2–15 minute do-nothing timer.

**Also:** 8 themes, and a journal of your unlocks, turned-down reasons and redirected urges.
Settings that loosen the blocking rules need you to type "on purpose" to save.

## Privacy

Everything you write (reasons, journal, habits, location, settings) stays in your browser's
local storage. Nothing is sent to any server of ours, because there isn't one.

The only network requests are for Quran text and audio:
[alquran.cloud](https://alquran.cloud) (text, translation, transliteration, audio) and
[quran.com](https://quran.com) (word-by-word data). They receive which ayahs you're
loading and nothing else. Prayer times are calculated locally, so your location never leaves your laptop.

## Optional: the Mushaf font

By default the Quran text uses [Amiri Quran](https://fonts.google.com/specimen/Amiri+Quran)
(SIL Open Font License). If you prefer the King Fahd Complex font used by quran.com, download
**KFGQPC Uthmanic Script HAFS** from the [official font site](https://fonts.qurancomplex.gov.sa/),
convert or save it as `fonts/UthmanicHafs.woff2` inside this folder, and reload the extension.
It isn't included here because its licence doesn't allow redistribution.

## Credits

- Prayer time calculation based on the [PrayTimes.org](http://praytimes.org) algorithm.
- Quran text, translation (Sahih International), transliteration and audio via
  [alquran.cloud](https://alquran.cloud); word-by-word data via the [quran.com](https://quran.com) API.

## License

The code is released under the MIT License (see `LICENSE`). Quran text, translations, audio and
fonts belong to their respective owners and are not covered by this licence.
