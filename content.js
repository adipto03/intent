// Runs on every page but exits immediately unless it's one of your paused sites.
// Catches what network rules miss (back/forward cache, single-page navigation),
// hides feeds/Shorts while unlocked, and shows your intention + countdown.
(() => {
  const host = location.hostname;
  const matches = (domains) => domains.some((d) => host === d || host.endsWith('.' + d));

  chrome.storage.local.get(['settings', 'sessions']).then(({ settings, sessions = {} }) => {
    if (!settings) return;
    const site = settings.sites.find((s) => matches(s.domains));
    if (!site) return;

    const session = sessions[site.id];
    if (!session || session.until <= Date.now()) {
      location.replace(chrome.runtime.getURL('blocked.html') + '#' + location.href);
      return;
    }
    if (settings.hideDistractions) hideDistractions();
    if (document.body) banner(site, session);
    else document.addEventListener('DOMContentLoaded', () => banner(site, session), { once: true });
  });

  function hideDistractions() {
    let css = '';
    if (/(^|\.)youtube\.com$/.test(host)) {
      css = `
        ytd-browse[page-subtype="home"] ytd-rich-grid-renderer,
        ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts], ytd-rich-section-renderer,
        ytd-video-renderer:has(a[href^="/shorts/"]),
        ytd-guide-entry-renderer:has(a[title="Shorts"]), ytd-mini-guide-entry-renderer[aria-label="Shorts"],
        #secondary #related, ytd-watch-next-secondary-results-renderer,
        .ytp-endscreen-content, .ytp-ce-element, .ytp-autonav-endscreen-countdown-overlay
        { display: none !important; }`;
      // Shorts open as normal videos, so there's no endless swipe.
      const fixShorts = () => {
        const m = location.pathname.match(/^\/shorts\/([\w-]+)/);
        if (m) location.replace('/watch?v=' + m[1]);
      };
      fixShorts();
      document.addEventListener('yt-navigate-finish', fixShorts);
    } else if (/(^|\.)instagram\.com$/.test(host)) {
      css = `
        a[href="/reels/"], a[href="/explore/"], a[href^="/reels/"] { display: none !important; }
        html[data-intent-home] main article { display: none !important; }`;
      const markHome = () => {
        if (location.pathname === '/') document.documentElement.dataset.intentHome = '';
        else delete document.documentElement.dataset.intentHome;
      };
      markHome();
      setInterval(markHome, 1000);
    }
    if (!css) return;
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function banner(site, session) {
    const hostEl = document.createElement('div');
    hostEl.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483647;';
    const root = hostEl.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        .pill{display:flex;align-items:center;gap:10px;max-width:min(520px,calc(100vw - 32px));
          font:13px/1.3 system-ui,"Segoe UI",sans-serif;color:#ebe6dd;background:rgba(20,20,18,.92);
          border:1px solid #3a3832;border-radius:999px;padding:8px 8px 8px 14px;box-shadow:0 6px 24px rgba(0,0,0,.25)}
        .dot{width:8px;height:8px;border-radius:50%;background:#86bfa9;flex:none}
        .txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .time{font-variant-numeric:tabular-nums;color:#9a9388;flex:none}
        .time.low{color:#e09a85}
        button{font:inherit;color:#0f1a16;background:#86bfa9;border:0;border-radius:999px;padding:5px 12px;cursor:pointer;flex:none}
        .min{background:transparent;color:#9a9388;padding:5px 6px}
      </style>
      <div class="pill">
        <span class="dot"></span><span class="txt"></span><span class="time"></span>
        <button class="done" title="Lock it again now">Done</button>
        <button class="min" title="Hide">–</button>
      </div>`;
    const txt = root.querySelector('.txt');
    txt.textContent = session.intention;
    txt.title = session.intention;
    const time = root.querySelector('.time');
    const tick = () => {
      const left = session.until - Date.now();
      const s = Math.max(0, Math.ceil(left / 1000));
      time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} left`;
      time.classList.toggle('low', left < 120_000);
    };
    tick();
    setInterval(tick, 1000);
    root.querySelector('.done').onclick = () => chrome.runtime.sendMessage({ type: 'end', siteId: site.id });
    root.querySelector('.min').onclick = () => {
      txt.hidden = !txt.hidden;
    };
    document.documentElement.appendChild(hostEl);
  }
})();
