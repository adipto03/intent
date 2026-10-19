import { getState, hostMatches, DEFAULT_SETTINGS } from './shared.js';

const blockedUrl = () => chrome.runtime.getURL('blocked.html');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Rebuild redirect rules: every site without an active session is blocked.
async function sync() {
  const { settings, sessions } = await getState();
  const now = Date.now();
  let expired = false;
  for (const id of Object.keys(sessions)) {
    if (sessions[id].until <= now) {
      delete sessions[id];
      expired = true;
    }
  }
  if (expired) await chrome.storage.local.set({ sessions });

  const addRules = [];
  let ruleId = 1;
  for (const site of settings.sites) {
    if (sessions[site.id]) continue;
    for (const domain of site.domains) {
      addRules.push({
        id: ruleId++,
        priority: 1,
        action: { type: 'redirect', redirect: { regexSubstitution: blockedUrl() + '#\\0' } },
        condition: {
          regexFilter: `^https?://([^/?#]*\\.)?${escapeRe(domain)}([/?#:].*)?$`,
          resourceTypes: ['main_frame'],
        },
      });
    }
  }
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules,
  });

  await chrome.alarms.clearAll();
  for (const [siteId, s] of Object.entries(sessions)) {
    chrome.alarms.create('relock:' + siteId, { when: s.until });
  }
}

async function relock(siteId) {
  const { settings, sessions } = await getState();
  delete sessions[siteId];
  await chrome.storage.local.set({ sessions });
  await sync();

  const site = settings.sites.find((s) => s.id === siteId);
  if (!site) return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url && hostMatches(site.domains, tab.url)) {
      chrome.tabs.update(tab.id, { url: `${blockedUrl()}?ended=${encodeURIComponent(siteId)}#${tab.url}` });
    }
  }
}

async function handle(msg) {
  if (msg.type === 'unlock') {
    const { sessions } = await getState();
    const now = Date.now();
    sessions[msg.siteId] = {
      intention: msg.intention,
      category: msg.category,
      start: now,
      until: now + msg.minutes * 60_000,
    };
    await chrome.storage.local.set({ sessions });
    await sync();
    return { ok: true };
  }
  if (msg.type === 'end') {
    await relock(msg.siteId);
    return { ok: true };
  }
  return { error: 'unknown message' };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg).then(sendResponse, (e) => sendResponse({ error: e.message }));
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('relock:')) relock(alarm.name.slice('relock:'.length));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) sync();
});

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  await sync();
});

chrome.runtime.onStartup.addListener(sync);
