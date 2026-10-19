// Applies the saved theme before the page paints (cached in localStorage),
// then confirms it from extension storage and follows later changes.
(() => {
  const apply = (t) => {
    if (!t || t === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    try { localStorage.setItem('intentTheme', t || 'auto'); } catch {}
  };
  try { apply(localStorage.getItem('intentTheme')); } catch {}
  chrome.storage.local.get('settings').then(({ settings }) => apply(settings?.theme));
  chrome.storage.onChanged.addListener((c) => c.settings && apply(c.settings.newValue?.theme));
})();
