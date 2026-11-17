// Epic Clicker — click the face, earn Epic Points, buy upgrades up to The
// Subatomic Drill. Best score is reported to the HUB's Epic Points leaderboard.
import * as backend from './backend.js';

const CEILING = 1e15;   // matches the DB clamp
const SAVE_KEY = 'epic_clicker_v1';

// 20 unique upgrades, one-time buys, ending in The Subatomic Drill.
const UPGRADES = [
  { id: 'c1',  name: 'Cursor Overclock',   kind: 'click', amount: 1,       cost: 15,          ds: '+1 per click' },
  { id: 'a1',  name: 'Auto-Clicker Bot',   kind: 'auto',  amount: 1,       cost: 100,         ds: '+1 EP/sec' },
  { id: 'c2',  name: 'Double Fingers',     kind: 'click', amount: 3,       cost: 500,         ds: '+3 per click' },
  { id: 'a2',  name: 'Dial-Up Miner',      kind: 'auto',  amount: 5,       cost: 1200,        ds: '+5 EP/sec' },
  { id: 'a3',  name: 'Script Kiddie',      kind: 'auto',  amount: 12,      cost: 3000,        ds: '+12 EP/sec' },
  { id: 'c3',  name: 'Bronze Cursor',      kind: 'click', amount: 15,      cost: 7000,        ds: '+15 per click' },
  { id: 'a4',  name: 'Botnet Node',        kind: 'auto',  amount: 40,      cost: 18000,       ds: '+40 EP/sec' },
  { id: 'm1',  name: 'Caffeine Injector',  kind: 'mult',  amount: 2,       cost: 45000,       ds: '×2 everything' },
  { id: 'a5',  name: 'GPU Rig',            kind: 'auto',  amount: 120,     cost: 90000,       ds: '+120 EP/sec' },
  { id: 'c4',  name: 'Golden Cursor',      kind: 'click', amount: 120,     cost: 180000,      ds: '+120 per click' },
  { id: 'a6',  name: 'Server Farm',        kind: 'auto',  amount: 400,     cost: 400000,      ds: '+400 EP/sec' },
  { id: 'm2',  name: 'Overclocked Core',   kind: 'mult',  amount: 2,       cost: 900000,      ds: '×2 everything' },
  { id: 'a7',  name: 'Data Center',        kind: 'auto',  amount: 1500,    cost: 2000000,     ds: '+1.5K EP/sec' },
  { id: 'a8',  name: 'Neural Net',         kind: 'auto',  amount: 5000,    cost: 5000000,     ds: '+5K EP/sec' },
  { id: 'a9',  name: 'Fusion Reactor',     kind: 'auto',  amount: 16000,   cost: 12000000,    ds: '+16K EP/sec' },
  { id: 'c5',  name: 'Quantum Cursor',     kind: 'click', amount: 5000,    cost: 28000000,    ds: '+5K per click' },
  { id: 'a10', name: 'Orbital Array',      kind: 'auto',  amount: 60000,   cost: 70000000,    ds: '+60K EP/sec' },
  { id: 'm3',  name: 'Reality Compiler',   kind: 'mult',  amount: 3,       cost: 200000000,   ds: '×3 everything' },
  { id: 'a11', name: 'Singularity Engine', kind: 'auto',  amount: 400000,  cost: 600000000,   ds: '+400K EP/sec' },
  { id: 'drill', name: 'The Subatomic Drill', kind: 'auto', amount: 3000000, cost: 2000000000, ds: '+3M EP/sec — harvest reality itself' },
];
const byId = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

let state = load();
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s.points === 'number') return { points: s.points, earned: s.earned || s.points, owned: Array.isArray(s.owned) ? s.owned : [] };
  } catch (_) {}
  return { points: 0, earned: 0, owned: [] };
}
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (_) {} }

function derive() {
  let click = 1, auto = 0, mult = 1;
  for (const id of state.owned) {
    const u = byId[id]; if (!u) continue;
    if (u.kind === 'click') click += u.amount;
    else if (u.kind === 'auto') auto += u.amount;
    else if (u.kind === 'mult') mult *= u.amount;
  }
  return { perClick: click * mult, perSecond: auto * mult };
}

function fmt(n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
  let i = 0; let v = n;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v)) + u[i];
}

const $ = (id) => document.getElementById(id);
const faceBtn = $('face'), shopEl = $('shop'), floatEl = $('floaties'), statusEl = $('status');

faceBtn.addEventListener('click', (e) => {
  const { perClick } = derive();
  gain(perClick);
  floatie('+' + fmt(perClick), e);
});

function gain(amount) {
  state.points = Math.min(CEILING, state.points + amount);
  state.earned = Math.min(CEILING, state.earned + amount);
}

function floatie(text, e) {
  const f = document.createElement('div');
  f.className = 'float';
  f.textContent = text;
  const r = faceBtn.getBoundingClientRect();
  const x = e && e.clientX ? e.clientX - r.left : r.width / 2;
  f.style.left = Math.max(10, Math.min(r.width - 10, x)) + 'px';
  f.style.top = (e && e.clientY ? e.clientY - r.top : 20) + 'px';
  faceBtn.appendChild(f);
  setTimeout(() => f.remove(), 1000);
}

function buy(u) {
  if (state.owned.includes(u.id) || state.points < u.cost) return;
  state.points -= u.cost;
  state.owned.push(u.id);
  save();
  renderShop();
  if (u.id === 'drill') {
    faceBtn.classList.add('charged');
    setStatus('⚡ THE SUBATOMIC DRILL IS ONLINE — HARVEST EVERYTHING ⚡', 'big');
  }
}

let lastShopKey = '';
function renderShop() {
  // Only re-render when something that changes the layout changed (owned set or
  // which rows are revealed/affordable), so buttons stay clickable between ticks.
  const key = UPGRADES.map((u) => {
    const owned = state.owned.includes(u.id);
    const revealed = owned || state.earned >= u.cost * 0.2;
    const affordable = !owned && state.points >= u.cost;
    return (owned ? 'o' : revealed ? (affordable ? 'a' : 'r') : 'h');
  }).join('');
  if (key === lastShopKey) return;
  lastShopKey = key;

  shopEl.replaceChildren(...UPGRADES.map((u) => {
    const owned = state.owned.includes(u.id);
    const revealed = owned || state.earned >= u.cost * 0.2;
    const row = document.createElement('div');
    row.className = 'up' + (owned ? ' owned' : revealed ? '' : ' locked') + (u.id === 'drill' ? ' final' : '');
    const info = document.createElement('div');
    info.className = 'info';
    const nm = document.createElement('div'); nm.className = 'nm';
    const ds = document.createElement('div'); ds.className = 'ds';
    if (revealed) { nm.textContent = u.name; ds.textContent = u.ds; }
    else { nm.textContent = '████████'; ds.textContent = '// encrypted'; }
    info.append(nm, ds);
    row.append(info);

    if (owned) {
      const tag = document.createElement('div'); tag.className = 'cost'; tag.textContent = '✓ OWNED';
      row.append(tag);
    } else {
      const cost = document.createElement('div'); cost.className = 'cost';
      cost.textContent = revealed ? fmt(u.cost) + ' EP' : '??? EP';
      const btn = document.createElement('button');
      btn.textContent = 'buy';
      btn.disabled = !revealed || state.points < u.cost;
      btn.addEventListener('click', () => buy(u));
      row.append(cost, btn);
    }
    return row;
  }));
}

// enable/disable buy buttons without a full re-render (cheap, every tick)
function refreshButtons() {
  const rows = shopEl.children;
  UPGRADES.forEach((u, i) => {
    const row = rows[i]; if (!row) return;
    const btn = row.querySelector('button');
    if (btn && !state.owned.includes(u.id)) {
      const revealed = state.earned >= u.cost * 0.2;
      btn.disabled = !revealed || state.points < u.cost;
    }
  });
}

function setStatus(html, cls) { statusEl.className = 'status' + (cls ? ' ' + cls : ''); statusEl.innerHTML = html; }

// ---- main loop ----
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  const { perClick, perSecond } = derive();
  if (perSecond > 0) gain(perSecond * dt);
  $('points').textContent = fmt(state.points);
  $('rate').textContent = fmt(perSecond);
  $('per-click').textContent = fmt(perClick);
  refreshButtons();
  renderShop();
  requestAnimationFrame(tick);
}

setInterval(save, 3000);

// ---- leaderboard reporting (reuses the HUB session) ----
let signedIn = false;
async function connect() {
  try {
    await backend.start();
    if (backend.me) {
      signedIn = true;
      if (!statusEl.textContent) setStatus('harvesting as <b>' + escapeHtml(backend.me.username) + '</b> — reporting to the Epic Points board');
    } else if (!statusEl.textContent) {
      setStatus('playing offline — <a href="index.html">pick a username on the HUB</a> to join the Epic Points board');
    }
  } catch (_) {}
}
function report() { if (signedIn && state.earned > 0) backend.reportEpic(state.earned); }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

setInterval(report, 10000);
addEventListener('visibilitychange', () => { if (document.hidden) { save(); report(); } });
addEventListener('pagehide', () => { save(); report(); });

// restore the drill glow on reload
if (state.owned.includes('drill')) faceBtn.classList.add('charged');
renderShop();
requestAnimationFrame(tick);
connect();
