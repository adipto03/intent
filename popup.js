import { getState, todaySummary, fmtClock } from './shared.js';

const $ = (id) => document.getElementById(id);
const open = (path) => chrome.tabs.create({ url: chrome.runtime.getURL(path) }).then(() => window.close());
let ticks = [];

async function render() {
  const { settings, sessions, log } = await getState();
  ticks = [];
  $('sites').replaceChildren(
    ...settings.sites.map((site) => {
      const s = sessions[site.id];
      const row = document.createElement('div');
      row.className = 'site';
      const top = document.createElement('div');
      top.className = 'top';
      const status = document.createElement('span');
      top.append(Object.assign(document.createElement('strong'), { textContent: site.name }), status);
      row.append(top);

      if (s && s.until > Date.now()) {
        status.className = 'status open';
        ticks.push(() => (status.textContent = `Open · ${fmtClock(s.until - Date.now())} left`));
        const end = Object.assign(document.createElement('button'), { textContent: "I'm done, lock it" });
        end.style.marginTop = '8px';
        end.onclick = async () => {
          await chrome.runtime.sendMessage({ type: 'end', siteId: site.id });
          render();
        };
        row.append(Object.assign(document.createElement('p'), { className: 'intent', textContent: `“${s.intention}”` }), end);
      } else {
        status.className = 'status';
        status.textContent = 'Paused';
      }
      return row;
    }),
  );
  ticks.forEach((f) => f());

  const t = todaySummary(log);
  const mins = t.unlocks.reduce((n, e) => n + e.minutes, 0);
  $('stats').textContent =
    `Today: ${t.unlocks.length} unlocks (${mins} min) · ${t.redirected} urges redirected · ${t.stillMinutes} min stillness`;
}

$('still').onclick = () => open('still.html');
$('options').onclick = () => open('options.html');
render();
setInterval(() => ticks.forEach((f) => f()), 1000);
