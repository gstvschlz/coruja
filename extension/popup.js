const D = CorujaTyping.DEFAULT_SETTINGS;
const $ = (id) => document.getElementById(id);
const store = chrome.storage.local;

function renderStatus(s = {}) {
  const rows = [['State', s.state || 'off'], ['Sessions', s.sessions || 0], ['Skips', s.skips || 0],
    ['Wrong', s.wrong || 0], ['Last stop', s.lastStop || '-']];
  $('status').replaceChildren(...rows.map(([k, v]) => {
    const d = document.createElement('div');
    d.append(Object.assign(document.createElement('span'), { textContent: k }),
      Object.assign(document.createElement('b'), { textContent: v }));
    return d;
  }));
}

function renderSettings(saved = {}) {
  $('settings').replaceChildren(...Object.keys(D).map((k) => {
    const input = Object.assign(document.createElement('input'), { type: 'number', step: 'any', value: saved[k] ?? D[k] });
    input.addEventListener('change', async () => {
      const n = Number(input.value);
      if (!Number.isFinite(n) || n < 0) { input.value = saved[k] ?? D[k]; return; }
      const { settings = {} } = await store.get('settings');
      settings[k] = n;
      await store.set({ settings });
    });
    const label = document.createElement('label');
    label.append(k, input);
    return label;
  }));
}

store.get(['enabled', 'legendary', 'settings', 'status']).then((v) => {
  $('enabled').checked = !!v.enabled;
  $('legendary').checked = !!v.legendary;
  renderSettings(v.settings);
  renderStatus(v.status);
});

$('enabled').addEventListener('change', async (e) => {
  const on = e.target.checked;
  const { status = {} } = await store.get('status');
  const next = on
    ? { state: 'starting', sessions: 0, skips: 0, wrong: 0, sessionWrong: 0, sessionSolved: 0, lastStop: '' }
    : { ...status, state: 'off', lastStop: 'switched off' };
  await store.set({ enabled: on, status: next });
});
$('legendary').addEventListener('change', (e) => store.set({ legendary: e.target.checked }));
$('reset').addEventListener('click', async () => { await store.remove('settings'); renderSettings(); });

chrome.storage.onChanged.addListener((ch) => {
  if (ch.status) renderStatus(ch.status.newValue);
  if (ch.enabled) $('enabled').checked = !!ch.enabled.newValue;
});
