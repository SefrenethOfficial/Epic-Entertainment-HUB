// Epic Entertainment HUB — the site interface, drawn in three.js.
//
// The page is laid out in "pixel units": the camera sits far enough back that
// one world unit at z = 0 equals one CSS pixel, so panels can be positioned
// like elements on a website while still tilting, floating and spinning in 3D.
// Text and artwork are painted onto 2D canvases and used as textures.

import * as THREE from '../vendor/three.module.min.js';
import { GAMES } from './games.js';
import * as backend from './backend.js';
import * as dialogs from './dialogs.js';

const C = {
  bg: '#000008',
  silver: '#C0C0C0',
  navy: '#000080',
  yellow: '#FFFF00',
  lime: '#00FF00',
  cyan: '#00FFFF',
  magenta: '#FF00FF',
  link: '#0000EE',
  ink: '#000000',
  cream: '#FFF7DC',
  pink: '#F8BBD9',
  maroon: '#861B42',
};
const TIMES = '"Times New Roman", Times, serif';
const COMIC = '"Comic Sans MS", "Comic Sans", "Chalkboard SE", "Comic Neue", cursive';
const SANS = 'Tahoma, "MS Sans Serif", Geneva, Verdana, sans-serif';
const MONO = '"Courier New", Courier, monospace';
const FOV = 40;
const NAV_H = 52;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (id) => document.getElementById(id);

// How many times this browser has opened the HUB (for the footer counter).
let visits = 1;
try {
  visits = (parseInt(localStorage.getItem('eehub-visits'), 10) || 0) + 1;
  localStorage.setItem('eehub-visits', String(visits));
} catch (e) { /* storage unavailable: just show 1 */ }
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Loading screen                                                      */
/* ------------------------------------------------------------------ */

const LOADING_IMAGES = ['assets/loading-stonks.jpg', 'assets/loading-invasion.jpg'];
const TIPS = [
  'Stonks only go up.',
  'What the heck is happening?',
  'Dialing up at 56k…',
  'Please wait, the modem is making noises…',
  'Asking the aliens to wait a moment…',
  'Reading the newspaper while it loads…',
  'Investing in fun.',
];
let loadingImageIndex = 0;
let loaderTimer = 0;

const loader = {
  show(title, image) {
    $('loader-img').src = image;
    $('loader-title').textContent = title;
    $('loader-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    this.progress = 0;
    $('loader-fill').style.width = '0%';
    $('loader').classList.remove('hidden');
    document.body.classList.add('loading');
    clearInterval(loaderTimer);
    // Creep towards 90% while we wait; finish() fills the rest.
    loaderTimer = setInterval(() => {
      this.progress += (90 - this.progress) * 0.08;
      $('loader-fill').style.width = this.progress.toFixed(1) + '%';
    }, 120);
  },
  async finish() {
    clearInterval(loaderTimer);
    $('loader-fill').style.width = '100%';
    await wait(300);
    $('loader').classList.add('hidden');
    document.body.classList.remove('loading');
  },
  hideNow() {
    clearInterval(loaderTimer);
    $('loader').classList.add('hidden');
    document.body.classList.remove('loading');
  },
};

function nextLoadingImage() {
  const src = LOADING_IMAGES[loadingImageIndex % LOADING_IMAGES.length];
  loadingImageIndex++;
  return src;
}

// Warm the cache so game loading screens appear instantly.
LOADING_IMAGES.forEach((src) => { new Image().src = src; });

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */

let toastTimer = 0;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ------------------------------------------------------------------ */
/* Background music: "Backroom Beat" by Sefreneth                      */
/* ------------------------------------------------------------------ */

// Browsers only allow sound after the visitor has clicked, tapped or pressed
// a key, so the song starts on the first interaction with the page.
const music = new Audio('assets/backroom-beat.mp3');
music.loop = true;
music.volume = 0.5;
music.preload = 'auto';
let musicOn = true;
try { musicOn = localStorage.getItem('eehub-music') !== 'off'; } catch (e) { /* default on */ }

// The shop has its own theme (Friday Theme) that takes over while it's open.
const shopSong = new Audio('assets/shop-theme.mp3');
shopSong.loop = true;
shopSong.volume = 0.55;
shopSong.preload = 'auto';
let shopActive = false;
let theaterActive = false;   // the Shows tab runs its own quiet, so hush the hub beat

function syncMusic() {
  if (secretActive) { music.pause(); shopSong.pause(); return; }   // the secret has taken the stage
  if (theaterActive) { music.pause(); shopSong.pause(); return; }  // the theater keeps its own silence
  if (shopActive) {   // the shop's Friday Theme plays instead of the hub beat
    music.pause();
    if (musicOn && !document.hidden) shopSong.play().catch(() => {}); else shopSong.pause();
    return;
  }
  shopSong.pause();
  if (musicOn && !playing && !document.hidden) music.play().catch(() => {});
  else music.pause();
}

// A tiny synthesized "ta-dum" sting for the parody studio intro (no audio file).
function playTaDum() {
  if (!musicOn) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ac = new Ctx();
    const now = ac.currentTime;
    const note = (freq, t0, dur, peak) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = freq;
      o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, now + t0);
      g.gain.exponentialRampToValueAtTime(peak, now + t0 + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t0 + dur);
      o.start(now + t0); o.stop(now + t0 + dur + 0.05);
    };
    note(146.83, 0, 0.35, 0.3);     // D3 — "ta"
    note(196.00, 0.34, 1.1, 0.34);  // G3 — "dummm"
    note(392.00, 0.34, 1.1, 0.12);  // G4 shimmer on top
    setTimeout(() => ac.close().catch(() => {}), 1800);
  } catch (e) { /* no audio, no problem */ }
}

function toggleMusic() {
  musicOn = !musicOn;
  try { localStorage.setItem('eehub-music', musicOn ? 'on' : 'off'); } catch (e) { /* not saved */ }
  syncMusic();
  toast(musicOn ? 'Music on: Backroom Beat by Sefreneth' : 'Music off');
  if (hub) hub.rebuild();
}

['pointerdown', 'keydown'].forEach((type) => addEventListener(type, function unlock() {
  removeEventListener(type, unlock, true);
  syncMusic();
}, true));
document.addEventListener('visibilitychange', syncMusic);

/* ------------------------------------------------------------------ */
/* (shhh)                                                              */
/* ------------------------------------------------------------------ */

let secretActive = false;
const secretSong = new Audio('assets/secret-song.mp3');
secretSong.loop = true;
secretSong.volume = 1;
secretSong.preload = 'auto';

// Called once the last shape is smashed. From here until the page is refreshed,
// the timer stays up and the song owns the speakers.
function revealSecret() {
  if (secretActive) return;
  secretActive = true;
  music.pause();
  secretSong.currentTime = 0;
  secretSong.play().catch(() => {});
  startSecretTimer();
}

// A LiveSplit-style timer that runs and splits on its own.
function startSecretTimer() {
  const SEGMENTS = [
    { name: 'Boot', at: 3.20 },
    { name: 'Dial-Up', at: 12.80 },
    { name: 'Lobby', at: 41.50 },
    { name: 'The Backrooms', at: 98.00 },
    { name: 'Exit', at: 203.00 },
  ];
  const fmt = (s, dec = true) => {
    if (s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = s - m * 60;
    if (m > 0) return m + ':' + (sec < 10 ? '0' : '') + sec.toFixed(dec ? 2 : 0);
    return sec.toFixed(dec ? 2 : 0);
  };
  const fmtSplit = (s) => {
    const m = Math.floor(s / 60), sec = Math.floor(s - m * 60);
    return (m > 0 ? m + ':' + (sec < 10 ? '0' : '') + sec : '0:' + (sec < 10 ? '0' : '') + sec);
  };
  const delta = (d) => (d <= 0 ? '−' : '+') + fmt(Math.abs(d), true);

  const wrap = document.createElement('div');
  wrap.className = 'ls-timer';
  const splits = document.createElement('div');
  splits.className = 'ls-splits';
  const rows = SEGMENTS.map((seg) => {
    const row = document.createElement('div');
    row.className = 'ls-split';
    row.innerHTML = `<span class="ls-name"></span><span class="ls-delta"></span><span class="ls-time"></span>`;
    row.querySelector('.ls-name').textContent = seg.name;
    row.querySelector('.ls-time').textContent = fmtSplit(seg.at);
    splits.appendChild(row);
    return row;
  });
  const big = document.createElement('div');
  big.className = 'ls-big';
  big.textContent = '0.00';
  const info = document.createElement('div');
  info.className = 'ls-info';
  info.innerHTML = `<span>Previous Segment</span><span class="ls-prev">−</span>`;
  const prev = info.querySelector('.ls-prev');
  wrap.append(splits, big, info);
  document.body.appendChild(wrap);

  // drag the window around by grabbing it
  let dragging = null;
  wrap.addEventListener('pointerdown', (e) => {
    dragging = { dx: e.clientX - wrap.offsetLeft, dy: e.clientY - wrap.offsetTop };
    wrap.setPointerCapture(e.pointerId);
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    wrap.style.left = Math.max(0, Math.min(innerWidth - wrap.offsetWidth, e.clientX - dragging.dx)) + 'px';
    wrap.style.top = Math.max(0, Math.min(innerHeight - wrap.offsetHeight, e.clientY - dragging.dy)) + 'px';
    wrap.style.right = 'auto'; wrap.style.bottom = 'auto';
  });
  wrap.addEventListener('pointerup', () => { dragging = null; });

  const start = performance.now();
  let cur = 0;
  const step = () => {
    const t = (performance.now() - start) / 1000;
    big.textContent = fmt(t, true);
    while (cur < SEGMENTS.length && t >= SEGMENTS[cur].at) {
      const seg = SEGMENTS[cur];
      const d = seg.at - (seg.at * 1.035);   // always a touch ahead of the "PB"
      const row = rows[cur];
      row.querySelector('.ls-delta').textContent = delta(d);
      row.querySelector('.ls-delta').classList.add(d <= 0 ? 'ahead' : 'behind');
      row.querySelector('.ls-time').textContent = fmt(seg.at, true);
      prev.textContent = delta(d);
      prev.className = 'ls-prev ' + (d <= 0 ? 'ahead' : 'behind');
      cur++;
    }
    rows.forEach((r, i) => r.classList.toggle('current', i === cur));
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ------------------------------------------------------------------ */
/* Game player (the games themselves are separate pages in an iframe)  */
/* ------------------------------------------------------------------ */

const frame = $('player-frame');
let playing = null;
let openToken = 0;
let blobUrl = null;

// Built-in games plus any added from inside the HUB.
let allGames = [...GAMES];

// Leaderboard data, loaded lazily. null = not fetched yet.
// The standalone page ranks by XP (all-time), Diamonds and Epic Points.
const board = { scope: 'all', all: null, diamonds: null, epic: null };
const BOARD_TABS = [
  { scope: 'all', label: 'XP', unit: 'XP', blurb: 'Earned by playing games' },
  { scope: 'diamonds', label: 'Diamonds', unit: '💎', blurb: 'Daily rewards & streaks' },
  { scope: 'epic', label: 'Epic Points', unit: 'EP', blurb: 'Harvested in the Epic Clicker' },
];

/* ---- active play time: fuels XP (1/min) and diamonds (1/10min) ---- */
// Time only counts while a game is open, the tab is visible, and the window
// is focused — so leaving a game open in a background tab earns nothing.
let activeAccum = 0;
let activeTimer = 0;
function activeNow() { return Boolean(playing) && !document.hidden && document.hasFocus(); }
function flushActiveTime() {
  const secs = activeAccum;
  activeAccum = 0;
  return secs > 0 ? backend.reportActiveTime(secs) : Promise.resolve();
}
function startActiveTracking() {
  stopActiveTracking();
  activeTimer = setInterval(() => {
    if (activeNow()) {
      activeAccum += 1;
      if (activeAccum >= 25) flushActiveTime();   // send in small batches
    }
  }, 1000);
}
function stopActiveTracking() {
  if (activeTimer) { clearInterval(activeTimer); activeTimer = 0; }
}
addEventListener('pagehide', flushActiveTime);

// Reload every leaderboard (XP, diamonds, Epic Points) and redraw.
async function refreshBoard() {
  if (!backend.configured) return;
  try {
    const [all, diamonds, epic] = await Promise.all([
      backend.leaderboard('all'), backend.leaderboard('diamonds'), backend.leaderboard('epic'),
    ]);
    board.all = all; board.diamonds = diamonds; board.epic = epic;
  } catch (err) {
    console.error('Could not load the leaderboard', err);
    board.all = board.all || []; board.diamonds = board.diamonds || []; board.epic = board.epic || [];
  }
  if (hub) hub.rebuild();
  if (lbOpen) renderBoardPage();   // keep the open page in sync
}

async function claimDailyFlow() {
  try {
    const r = await backend.claimDaily();
    if (r && r.claimed) toast(`Day ${r.streak}! +${r.reward} diamonds 💎`);
    else toast('Already claimed today — come back tomorrow!');
  } catch (err) {
    toast(err.message);
  }
  if (hub) hub.rebuild();
}

// A hidden game, not in the registry. Loaded from a local launcher that pulls
// the rest from its own host, and run sandboxed like any uploaded game.
const SECRET_GAME = { id: 'saul-run', title: '???', fileUrl: 'games/saul.html' };

const SAVE_PREFIX = 'eehub:save:';         // per-game save, kept in the HUB's own storage
const MAX_SAVE_BYTES = 1024 * 1024;        // cap one game's save at ~1 MB

// Slipped into the top of every uploaded game. A sandboxed game runs in an
// "opaque" origin where localStorage / sessionStorage / document.cookie THROW
// the moment they're touched. Engine loaders (Unity and friends) read those
// while starting up and die on the exception — the black screen some uploads
// showed. So we install stand-ins only if the real ones throw.
//
// localStorage is also where most games save. The opaque origin has none that
// persists, so we seed the stand-in from the game's saved data (passed in) and
// mirror every write back to the HUB via postMessage, which stores it. Next
// time the game opens, it's seeded again — so the game saves. Reads stay
// synchronous (the seed is already in memory), and the game still can't reach
// the HUB: it only posts its own save out through a one-way channel.
function buildShim(saveData) {
  const seed = JSON.stringify(saveData || {}).replace(/</g, '\\u003c');
  return `<script>(function(){
  var SEED = ${seed};
  function mem(init, persist){
    var s = init || {};
    return {
      getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(s,k)?s[k]:null;},
      setItem:function(k,v){s[String(k)]=String(v);persist&&persist(s);},
      removeItem:function(k){delete s[String(k)];persist&&persist(s);},
      clear:function(){for(var k in s)delete s[k];persist&&persist(s);},
      key:function(i){return Object.keys(s)[i]||null;},
      get length(){return Object.keys(s).length;}
    };
  }
  var timer=null, latest=null;
  function persist(s){ latest=s; if(timer)return; timer=setTimeout(function(){timer=null;try{parent.postMessage({__eehub:"save",data:latest},"*");}catch(e){}},300); }
  function guard(name,init,save){try{window[name].getItem("__t__");}catch(e){try{Object.defineProperty(window,name,{value:mem(init,save),configurable:true});}catch(_){}}}
  guard("localStorage",SEED,persist);
  guard("sessionStorage",{},null);
  try{void document.cookie;}catch(e){try{Object.defineProperty(document,"cookie",{configurable:true,get:function(){return"";},set:function(){}});}catch(_){}}
})();<\/script>`;
}

function injectShim(html, saveData) {
  const shim = buildShim(saveData);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + shim);
  if (/<script/i.test(html)) return html.replace(/<script/i, shim + '<script');
  return shim + html;
}

// Persist a game's save when its sandboxed frame posts one out.
addEventListener('message', (e) => {
  if (!playing || !playing.fileUrl || e.source !== frame.contentWindow) return;
  const d = e.data;
  if (!d || d.__eehub !== 'save' || !d.data || typeof d.data !== 'object') return;
  try {
    const json = JSON.stringify(d.data);
    if (json.length <= MAX_SAVE_BYTES) localStorage.setItem(SAVE_PREFIX + playing.id, json);
  } catch (_) {}
});

function loadSave(id) {
  try { return JSON.parse(localStorage.getItem(SAVE_PREFIX + id) || '{}') || {}; } catch (_) { return {}; }
}

async function openGame(game) {
  if (playing === game) return;
  const token = ++openToken;
  playing = game;
  syncMusic();            // the game brings its own sound
  backend.recordPlay(game.id);        // count this play (built-in or added)
  game.plays = (game.plays || 0) + 1;
  if (backend.me) {
    backend.reportVariety(game.id);   // first play of this game today earns a bonus
    startActiveTracking();
  }
  loader.show('Loading ' + game.title, nextLoadingImage());
  $('player-title').textContent = game.title;
  $('player-open').hidden = !game.url;
  if (game.url) $('player-open').href = game.url;
  $('player-comments').hidden = !backend.configured;
  frame.title = game.title;
  $('player').hidden = false;
  document.body.classList.add('game-open');
  history.replaceState(null, '', '#play=' + game.id);
  document.title = game.title + ' — Epic Entertainment HUB';

  const loaded = new Promise((resolve) => {
    frame.addEventListener('load', resolve, { once: true });
  });
  if (game.fileUrl) {
    // An uploaded HTML file. It runs in a sandbox (no allow-same-origin) so it
    // cannot touch the HUB or anyone's account, whatever the file contains, and
    // we serve it as a blob so it always renders as real HTML regardless of how
    // the storage host labels it. We also slip in a small storage shim (see
    // STORAGE_SHIM) so engine games survive the sandbox's origin-less storage.
    frame.setAttribute('sandbox', 'allow-scripts allow-pointer-lock allow-forms allow-modals');
    try {
      const res = await fetch(game.fileUrl);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      let html = await res.text();
      if (token !== openToken) return;
      html = injectShim(html, loadSave(game.id));
      blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      frame.src = blobUrl;
    } catch (err) {
      console.error(err);
      if (token === openToken) { closeGame(); toast('Could not load ' + game.title + '.'); }
      return;
    }
  } else {
    frame.removeAttribute('sandbox');
    frame.src = game.url;
  }
  // Keep the loading screen up long enough to be seen, but never forever.
  await Promise.all([wait(1600), Promise.race([loaded, wait(12000)])]);
  if (token !== openToken) return;
  await loader.finish();
  if (token === openToken) frame.focus();
}

function closeGame() {
  if (!playing) return;
  openToken++;
  playing = null;
  stopActiveTracking();
  // Bank the last of the play time, then refresh stats + board + play counts.
  flushActiveTime().then(() => { if (backend.configured) refreshBoard(); });
  if (backend.configured) refreshGames();   // pick up the new play count + re-sort
  syncMusic();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  frame.src = 'about:blank';
  if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
  $('player').hidden = true;
  document.body.classList.remove('game-open');
  loader.hideNow();
  history.replaceState(null, '', location.pathname + location.search);
  document.title = 'Epic Entertainment HUB';
  lastTime = 0;
  if (hub) requestAnimationFrame(tick);
}

function gameFromHash() {
  const m = /^#play=([\w-]+)$/.exec(location.hash);
  return m ? allGames.find((g) => g.id === m[1]) : null;
}

$('player-back').addEventListener('click', closeGame);
$('player-comments').addEventListener('click', () => { if (playing) dialogs.openComments(playing); });
$('player-full').addEventListener('click', () => {
  const wrap = $('player-frame-wrap');
  if (document.fullscreenElement) document.exitFullscreen();
  else if (wrap.requestFullscreen) wrap.requestFullscreen().catch(() => toast('Fullscreen is not available here'));
  else toast('Fullscreen is not available here');
});
addEventListener('hashchange', () => {
  const g = gameFromHash();
  if (g) openGame(g);
  else closeGame();
});

// Hidden-until-focused buttons: keyboard and screen-reader access, and the
// plain fallback when WebGL will not start.
function renderQuickList() {
  const add = (label, action) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', action);
    li.appendChild(b);
    return li;
  };
  $('quick-list').replaceChildren(
    ...allGames.map((game) => add('Play ' + game.title, () => openGame(game))),
    add('Toggle music', toggleMusic),
    add(backend.me ? 'My account' : 'Pick a username', openAccountOrAuth),
  );
}

function openAccountOrAuth() {
  if (backend.me) dialogs.openAccount();
  else if (backend.configured) dialogs.openAuth();
  else toast('Accounts are coming soon!');
}

/* ------------------------- the leaderboard page ------------------------- */
// Its own full-screen Windows 95 window: a tab per point type (XP, Diamonds,
// Epic Points), the whole roster for that tab, and a footer to change your
// name or claim the daily reward.
let lbOpen = false;

function mk(tag, props, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'class') n.className = v;
    else if (k in n) n[k] = v; else n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return n;
}

function openLeaderboard() {
  if (!$('leaderboard')) return;
  lbOpen = true;
  $('leaderboard').hidden = false;
  renderBoardPage();
  if (backend.configured && board[board.scope] == null) refreshBoard();   // lazy first load
  const x = $('lb-close'); if (x) x.focus();
}
function closeLeaderboard() {
  lbOpen = false;
  if ($('leaderboard')) $('leaderboard').hidden = true;
}

function renderBoardPage() {
  const tabsEl = $('lb-tabs'), body = $('lb-body'), foot = $('lb-foot'), unitEl = $('lb-unit');
  if (!tabsEl || !body) return;
  const active = BOARD_TABS.find((t) => t.scope === board.scope) || BOARD_TABS[0];
  const myName = backend.me ? backend.me.username : null;

  // tabs
  tabsEl.replaceChildren(...BOARD_TABS.map((t) => mk('button', {
    class: 'lb-tab', type: 'button', role: 'tab', 'aria-selected': String(t.scope === board.scope),
    title: t.blurb,
    onclick: () => { if (board.scope !== t.scope) { board.scope = t.scope; renderBoardPage(); if (backend.configured && board[t.scope] == null) refreshBoard(); } },
  }, t.label)));

  if (unitEl) unitEl.textContent = active.unit === '💎' ? 'Diamonds' : active.label;

  // the roster
  const rows = board[board.scope];
  if (!backend.configured) {
    body.replaceChildren(mk('tr', {}, mk('td', { class: 'lb-note', colSpan: 3 }, 'Leaderboards light up once accounts are switched on.')));
  } else if (rows == null) {
    body.replaceChildren(mk('tr', {}, mk('td', { class: 'lb-note', colSpan: 3 }, 'Loading…')));
  } else if (!rows.length) {
    body.replaceChildren(mk('tr', {}, mk('td', { class: 'lb-note', colSpan: 3 }, 'No one here yet — be the first!')));
  } else {
    body.replaceChildren(...rows.map((p, i) => {
      const mine = p.username === myName;
      const medal = i < 3 ? ' lb-medal' + (i + 1) : '';
      const badge = p.rank === 'owner' ? '♔' : p.rank === 'admin' ? '★' : '';
      const nameTd = mk('td', { class: 'lb-nm r-' + p.rank },
        mk('img', { class: 'lb-av', src: backend.pfpSrc(p.pfp), alt: '', draggable: false }),
        p.username + (mine ? ' (you)' : ''),
        badge ? mk('span', { class: 'lb-badge' }, badge) : null);
      return mk('tr', { class: mine ? 'lb-me' : '' },
        mk('td', { class: 'lb-rk' + medal }, '#' + (i + 1)),
        nameTd,
        mk('td', { class: 'lb-sc' }, (p.score || 0).toLocaleString() + ' ' + active.unit));
    }));
  }

  // footer
  if (!foot) return;
  const bits = [];
  if (backend.configured && backend.me) {
    const me = backend.me;
    const myScore = board.scope === 'epic' ? (me.epicPoints || 0) : board.scope === 'diamonds' ? (me.diamonds || 0) : (me.xp || 0);
    const pos = (rows || []).findIndex((p) => p.username === me.username);
    bits.push(mk('span', { class: 'lb-me-line' },
      me.username + ' — ' + (pos >= 0 ? 'Rank #' + (pos + 1) : 'Unranked') + ' · ' + myScore.toLocaleString() + ' ' + active.unit));
    bits.push(mk('button', { class: 'lb-btn', type: 'button', onclick: () => dialogs.openRename() }, 'Change name…'));
    bits.push(mk('button', { class: 'lb-btn', type: 'button', onclick: () => dialogs.openMembers() }, 'Members…'));
    if (backend.dailyAvailable()) bits.push(mk('button', { class: 'lb-btn', type: 'button', onclick: () => { claimDailyFlow(); } }, 'Claim daily 💎'));
  } else if (backend.configured) {
    bits.push(mk('button', { class: 'lb-btn', type: 'button', onclick: () => openAccountOrAuth() }, 'Pick a username to join!'));
  }
  bits.push(mk('button', { class: 'lb-btn primary', type: 'button', onclick: closeLeaderboard }, 'Close'));
  foot.replaceChildren(...bits);
}

// After a rename: refresh the roster + the open page, nav label and account.
function onRenamed() {
  if (hub) hub.rebuild();
  renderQuickList();
  syncSidebarAccount();
  if (lbOpen) renderBoardPage();
  refreshBoard();
}

// Wire the leaderboard window's static controls once.
(() => {
  const close = $('lb-close'); if (close) close.addEventListener('click', closeLeaderboard);
  const bd = $('leaderboard');
  if (bd) bd.addEventListener('click', (e) => { if (e.target === bd) closeLeaderboard(); });   // click the dim desktop to close
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && lbOpen) closeLeaderboard(); });
})();

/* ----------------------------- the face shop ----------------------------- */
// A department store: shelves of face "packs". Tap one, it rides to the
// counter, and a pack-opening animation reveals the face — now equipped.
let shopOpen = false;
let shopCatalog = null;          // loaded lazily from the backend
let packBusy = false;            // one opening at a time

const RARITY_FOIL = { starter: '#9aa6b2', common: '#5fae5f', uncommon: '#3f98da', rare: '#a862d8', legendary: '#e3a93a' };
const RARITY_LABEL = { starter: 'STARTER', common: 'COMMON', uncommon: 'UNCOMMON', rare: 'RARE', legendary: 'LEGENDARY' };

async function openShop() {
  if (!$('shop')) return;
  shopOpen = true; shopActive = true;
  $('shop').hidden = false;
  syncMusic();                   // Friday Theme takes over
  if (!shopCatalog) { try { shopCatalog = await backend.shopItems(); } catch (e) { shopCatalog = []; } }
  renderShop();
  const x = $('shop-close'); if (x) x.focus();
}
function closeShop() {
  shopOpen = false; shopActive = false;
  if ($('shop')) $('shop').hidden = true;
  if ($('pack-open')) { $('pack-open').hidden = true; $('pack-open').replaceChildren(); }
  packBusy = false;
  syncMusic();                   // hand the stage back to the hub beat
}

function renderShop() {
  const aisle = $('shop-aisle'), wallet = $('shop-wallet');
  if (!aisle) return;
  if (wallet) wallet.textContent = '💎 ' + (backend.me ? (backend.me.diamonds || 0).toLocaleString() : '—');
  const items = shopCatalog || [];
  const blocks = [];
  if (backend.isStaff()) {   // staff get a shelf-management toolbar
    blocks.push(mk('div', { class: 'shop-manage' },
      mk('span', {}, '🛠 Editor tools'),
      mk('button', { class: 'lb-btn', type: 'button', onclick: () => dialogs.openAddFace() }, '+ Add a face')));
  }
  if (!items.length) {
    blocks.push(mk('p', { class: 'lb-note' }, 'Shelves are being restocked…'));
  } else {
    for (let i = 0; i < items.length; i += 3) {
      const group = items.slice(i, i + 3), si = i / 3;
      blocks.push(mk('div', { class: 'shelf' },
        mk('div', { class: 'shelf-label' }, si === 0 ? 'FACE PACKS · AISLE 1' : 'AISLE ' + (si + 1)),
        mk('div', { class: 'shelf-row' }, ...group.map((it) => packEl(it))),
        mk('div', { class: 'shelf-board' })));
    }
  }
  aisle.replaceChildren(...blocks);
}

function packEl(it) {
  const owned = backend.owns(it.id);
  const equipped = backend.me && backend.me.pfp === it.id;
  const el = mk('div', {
    class: 'pack' + (owned ? ' owned' : '') + (equipped ? ' equipped' : ''),
    style: '--foil:' + (RARITY_FOIL[it.rarity] || '#999'),
    role: 'button', tabindex: '0', title: it.name,
    onclick: () => packTap(it, el),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); packTap(it, el); } },
  },
    mk('div', { class: 'pack-top' }, RARITY_LABEL[it.rarity] || 'FACE'),
    mk('div', { class: 'pack-window' }, mk('img', { src: it.src || backend.pfpSrc(it.id), alt: it.name, draggable: false })),
    mk('div', { class: 'pack-name' }, it.name),
    equipped ? mk('div', { class: 'pack-price' }, 'Equipped')
      : owned ? mk('div', { class: 'pack-price' }, 'Equip')
      : mk('div', { class: 'pack-price' + (it.price ? '' : ' free') }, it.price ? '💎 ' + it.price : 'FREE'),
    equipped ? mk('div', { class: 'pack-ribbon' }, '✓ ON')
      : owned ? mk('div', { class: 'pack-ribbon' }, 'OWNED') : null,
    backend.isStaff() ? mk('div', { class: 'pack-staff' },
      mk('button', { type: 'button', title: 'Edit', onclick: (e) => { e.stopPropagation(); dialogs.openEditFace(it); } }, '✎'),
      it.id === 'classic' ? null
        : mk('button', { type: 'button', title: 'Delete', onclick: (e) => { e.stopPropagation(); deleteFaceFlow(it); } }, '🗑')) : null,
  );
  return el;
}

async function deleteFaceFlow(it) {
  const yes = await dialogs.confirmWindow('Remove "' + it.name + '" from the shop? Anyone wearing it goes back to the default face.', 'Delete');
  if (!yes) return;
  try { await backend.deletePfp(it.id); facesChanged(); toast('Removed ' + it.name + '.'); }
  catch (e) { toast(e.message || 'Could not delete that.'); }
}

// Reload the catalogue after a staff change and refresh avatars everywhere.
async function facesChanged() {
  try { shopCatalog = await backend.loadFaces(); } catch (e) { /* keep what we have */ }
  afterPfpChange();   // re-renders the shop + avatars
}

async function packTap(it, el) {
  if (packBusy) return;
  if (!backend.me) { if (backend.configured) dialogs.openAuth(); else toast('Accounts are coming soon!'); return; }
  if (backend.me.pfp === it.id) { toast(it.name + ' is already your face.'); return; }

  if (backend.owns(it.id)) {            // already own it → just equip
    packBusy = true;
    try { await backend.equipPfp(it.id); afterPfpChange(); toast('Equipped ' + it.name + '!'); }
    catch (e) { toast(e.message || 'Could not equip that.'); }
    packBusy = false;
    return;
  }
  if ((backend.me.diamonds || 0) < it.price) {   // friendly shake before hitting the server
    el.classList.remove('denied'); void el.offsetWidth; el.classList.add('denied');
    toast('Not enough 💎 — you need ' + it.price + '.');
    return;
  }

  packBusy = true;
  try {
    await backend.buyPfp(it.id);        // server deducts diamonds + equips
    if ($('shop-wallet')) $('shop-wallet').textContent = '💎 ' + (backend.me.diamonds || 0).toLocaleString();
    await runOpening(it, el);           // ride to the counter + open the pack
    afterPfpChange();
  } catch (e) {
    toast(e.message || 'Could not buy that.');
  }
  packBusy = false;
}

// Pack rides to the counter, then bursts open to reveal the face.
function runOpening(it, el) {
  return new Promise((resolve) => {
    const foilCol = RARITY_FOIL[it.rarity] || '#999';
    const r = el.getBoundingClientRect();
    const fly = mk('div', { class: 'pack-fly', style: '--foil:' + foilCol });
    fly.style.left = r.left + 'px'; fly.style.top = r.top + 'px'; fly.style.width = r.width + 'px';
    fly.appendChild(el.cloneNode(true));
    document.body.appendChild(fly);
    const counter = document.querySelector('.shop-counter');
    const cr = counter ? counter.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight - 40, width: 0, height: 0 };
    const tx = (cr.left + cr.width / 2) - (r.left + r.width / 2);
    const ty = (cr.top + cr.height / 2) - (r.top + r.height / 2);
    requestAnimationFrame(() => { fly.style.transform = `translate(${tx}px, ${ty}px) scale(0.4) rotate(12deg)`; fly.style.opacity = '0.2'; });

    setTimeout(() => {
      fly.remove();
      const stage = $('pack-open');
      const foil = mk('div', { class: 'open-foil', style: '--foil:' + foilCol });
      const glow = mk('div', { class: 'open-glow' });
      const face = mk('div', { class: 'open-face' }, mk('img', { src: it.src || backend.pfpSrc(it.id), alt: it.name, draggable: false }));
      const cap = mk('div', { class: 'open-caption' },
        mk('div', { class: 'got' }, 'You got ', mk('b', {}, it.name)),
        mk('div', { class: 'tap' }, 'tap to continue'));
      const wrap = mk('div', { class: 'open-stage' }, glow, foil, face, cap);
      stage.replaceChildren(wrap);
      stage.hidden = false;

      setTimeout(() => {
        foil.classList.add('pop'); glow.classList.add('on'); face.classList.add('reveal'); cap.classList.add('show');
        spawnConfetti(wrap);
      }, 720);

      let done = false;
      const finish = () => { if (done) return; done = true; stage.hidden = true; stage.replaceChildren(); stage.removeEventListener('click', finish); resolve(); };
      stage.addEventListener('click', finish);
      setTimeout(finish, 2600);         // auto-dismiss
    }, 640);
  });
}

function spawnConfetti(wrap) {
  const cols = ['#ffe14d', '#ff5d8f', '#4ad4ff', '#7CFC58', '#c0398a', '#fff'];
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 150;
    const c = mk('div', { class: 'confetti' });
    c.style.background = cols[i % cols.length];
    c.style.setProperty('--dx', Math.cos(a) * d + 'px');
    c.style.setProperty('--dy', Math.sin(a) * d + 'px');
    c.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
    c.style.borderRadius = Math.random() < 0.5 ? '50%' : '1px';
    c.style.animation = `confetti-go ${0.7 + Math.random() * 0.5}s ease-out forwards`;
    wrap.appendChild(c);
  }
}

// After buying/equipping: refresh the avatar everywhere.
function afterPfpChange() {
  renderShop();
  if (hub) hub.rebuild();
  renderQuickList();
  syncSidebarAccount();
  if (lbOpen) renderBoardPage();
}

// Wire the shop's static controls once.
(() => {
  const close = $('shop-close'); if (close) close.addEventListener('click', closeShop);
  const bd = $('shop');
  if (bd) bd.addEventListener('click', (e) => { if (e.target === bd) closeShop(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && shopOpen && $('pack-open') && $('pack-open').hidden) closeShop(); });
})();

/* ------------------------------ the Shows tab ----------------------------- */
// Walk in and the Windows-95 world gives way to a little cinema: a parody
// "EPIC PICTURES" intro, a featured hero, and Netflix-style rows of cards.
let theaterOpen = false;
let shows = null;              // loaded lazily
let heroIdx = 0, heroTimer = 0;

async function openTheater() {
  if (!$('theater')) return;
  theaterOpen = true; theaterActive = true;
  $('theater').hidden = false;
  document.body.classList.add('theater-open');
  syncMusic();                 // hush the hub
  playIntro();                 // parody opening, plays once per entry
  try { shows = await backend.listShows(); } catch (e) { shows = shows || []; }
  renderTheater();
}
function closeTheater() {
  theaterOpen = false; theaterActive = false;
  stopHeroRotate();
  closeWatch();
  if ($('th-modal')) { $('th-modal').hidden = true; $('th-modal').replaceChildren(); }
  if ($('theater')) $('theater').hidden = true;
  document.body.classList.remove('theater-open');
  syncMusic();                 // bring the hub beat back
}

function playIntro() {
  const intro = $('th-intro');
  if (!intro) return;
  intro.classList.remove('gone');
  intro.replaceChildren(
    mk('div', { class: 'th-spot l' }), mk('div', { class: 'th-spot r' }),
    mk('div', { class: 'th-curtain l' }), mk('div', { class: 'th-curtain r' }),
    mk('div', { class: 'th-logo' },
      mk('div', { class: 'mark' }, 'EPIC PICTURES'),
      mk('div', { class: 'sub' }, 'A SEFRENETH PRODUCTION')),
    mk('div', { class: 'th-shine' }),
    mk('button', { class: 'th-skip', type: 'button', onclick: endIntro }, 'Skip ▸'),
  );
  playTaDum();
  clearTimeout(intro._t);
  intro._t = setTimeout(endIntro, 2800);
}
function endIntro() {
  const intro = $('th-intro');
  if (!intro || intro.classList.contains('gone')) return;
  clearTimeout(intro._t);
  intro.classList.add('gone');
  setTimeout(() => { if (intro.classList.contains('gone')) intro.replaceChildren(); }, 600);
}

function stars(n) {
  const full = Math.round(n * 2) / 2;   // nearest half
  let s = '';
  for (let i = 1; i <= 5; i++) s += i <= full ? '★' : (i - 0.5 === full ? '⯪' : '☆');
  return s;
}

function renderTheater() {
  renderHero();
  renderRows();
}

function renderHero() {
  const host = $('th-hero');
  if (!host) return;
  const feats = (shows || []).filter((s) => s.featured);
  stopHeroRotate();
  if (!feats.length) {
    host.style.backgroundImage = '';
    host.replaceChildren(mk('div', { class: 'th-hero-empty' },
      backend.isStaff() ? 'No featured title yet — add one below and tick “Feature in the hero”.' : 'Now showing: nothing yet. Check back soon!'));
    return;
  }
  if (heroIdx >= feats.length) heroIdx = 0;
  const s = feats[heroIdx];
  host.style.backgroundImage = s.backdrop ? `url("${cssUrl(s.backdrop)}")` : (s.banner ? `url("${cssUrl(s.banner)}")` : '');
  host.replaceChildren(
    mk('div', { class: 'th-hero-inner' },
      mk('div', { class: 'th-hero-kicker' }, s.kind === 'movie' ? 'FEATURED FILM' : 'FEATURED SERIES'),
      s.banner ? mk('img', { class: 'th-hero-banner', src: s.banner, alt: s.title })
        : mk('h2', { class: 'th-hero-title' }, s.title),
      mk('div', { class: 'th-meta' },
        mk('span', { class: 'th-kindtag' }, s.kind === 'movie' ? 'MOVIE' : 'SERIES'),
        s.rating ? mk('span', { class: 'th-badge' }, s.rating) : null,
        s.stars ? mk('span', { class: 'th-stars' }, stars(s.stars), mk('small', {}, s.stars.toFixed(1))) : null),
      s.description ? mk('p', { class: 'th-hero-desc' }, s.description) : null,
      mk('div', { class: 'th-hero-btns' },
        mk('button', { class: 'th-btn play', type: 'button', onclick: () => (s.watchUrl ? openWatch(s) : openShowDetails(s)) }, '▶  Watch'),
        mk('button', { class: 'th-btn more', type: 'button', onclick: () => openShowDetails(s) }, 'More info'))),
    feats.length > 1 ? mk('div', { class: 'th-dots' }, ...feats.map((_, i) =>
      mk('button', { class: 'th-dot' + (i === heroIdx ? ' on' : ''), type: 'button', onclick: () => { heroIdx = i; renderHero(); } }))) : null,
  );
  if (feats.length > 1) heroTimer = setInterval(() => { heroIdx = (heroIdx + 1) % feats.length; renderHero(); }, 6000);
}
function stopHeroRotate() { if (heroTimer) { clearInterval(heroTimer); heroTimer = 0; } }
const cssUrl = (u) => String(u).replace(/"/g, '%22');

function renderRows() {
  const host = $('th-rows');
  if (!host) return;
  const list = shows || [];
  const blocks = [];
  if (backend.isStaff()) {
    blocks.push(mk('div', { class: 'th-manage' },
      mk('span', {}, '🎬 Editor tools — add shows & movies, set posters, ratings and the hero'),
      mk('button', { class: 'th-add', type: 'button', onclick: () => dialogs.openAddShow() }, '+ Add a title')));
  }
  const rowFor = (title, items) => items.length
    ? mk('div', { class: 'th-row' }, mk('h3', {}, title), mk('div', { class: 'th-rowscroll' }, ...items.map(cardFor)))
    : null;
  const feats = list.filter((s) => s.featured);
  blocks.push(rowFor('Featured', feats));
  blocks.push(rowFor('Series', list.filter((s) => s.kind === 'show')));
  blocks.push(rowFor('Movies', list.filter((s) => s.kind === 'movie')));
  if (!list.length) blocks.push(mk('div', { class: 'th-empty' }, backend.isStaff() ? 'Nothing showing yet — add your first title above.' : 'The marquee is empty for now. Check back soon!'));
  host.replaceChildren(...blocks.filter(Boolean));
}

function cardFor(s) {
  const poster = mk('div', { class: 'th-poster' });
  if (s.banner) poster.style.backgroundImage = `url("${cssUrl(s.banner)}")`;
  else poster.appendChild(mk('span', {}, s.title));
  return mk('div', { class: 'th-card', role: 'button', tabindex: '0', title: s.title,
    onclick: () => openShowDetails(s),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openShowDetails(s); } } },
    s.featured ? mk('div', { class: 'th-hero-badge' }, '★ HERO') : null,
    poster,
    mk('div', { class: 'th-card-info' },
      mk('div', { class: 'th-card-title' }, s.title),
      mk('div', { class: 'th-card-sub' },
        s.stars ? mk('span', { class: 's' }, '★ ' + s.stars.toFixed(1)) : null,
        s.rating ? mk('span', { class: 'r' }, s.rating) : null)),
    backend.isStaff() ? mk('div', { class: 'th-card-staff' },
      mk('button', { type: 'button', title: 'Edit', onclick: (e) => { e.stopPropagation(); dialogs.openEditShow(s); } }, '✎'),
      mk('button', { type: 'button', title: 'Delete', onclick: (e) => { e.stopPropagation(); deleteShowFlow(s); } }, '🗑')) : null);
}

function openShowDetails(s) {
  const m = $('th-modal');
  if (!m) return;
  const top = mk('div', { class: 'th-sheet-top' },
    mk('button', { class: 'th-sheet-x', type: 'button', onclick: closeShowDetails }, '✕'),
    s.banner && !s.backdrop ? mk('img', { class: 'th-hero-banner', src: s.banner, alt: s.title })
      : mk('h2', { class: 'th-sheet-title' }, s.title));
  if (s.backdrop) top.style.backgroundImage = `url("${cssUrl(s.backdrop)}")`;
  m.replaceChildren(mk('div', { class: 'th-sheet' }, top,
    mk('div', { class: 'th-sheet-body' },
      mk('div', { class: 'th-meta', style: 'margin-top:14px' },
        mk('span', { class: 'th-kindtag' }, s.kind === 'movie' ? 'MOVIE' : 'SERIES'),
        s.rating ? mk('span', { class: 'th-badge' }, s.rating) : null,
        s.stars ? mk('span', { class: 'th-stars' }, stars(s.stars), mk('small', {}, s.stars.toFixed(1))) : null),
      s.description ? mk('p', { class: 'th-sheet-desc' }, s.description) : mk('p', { class: 'th-sheet-desc' }, 'No description yet.'),
      mk('div', { class: 'th-hero-btns' },
        s.watchUrl ? mk('button', { class: 'th-btn play', type: 'button', onclick: () => openWatch(s) }, '▶  Watch') : null,
        backend.isStaff() ? mk('button', { class: 'th-btn more', type: 'button', onclick: () => { closeShowDetails(); dialogs.openEditShow(s); } }, 'Edit') : null))));
  m.hidden = false;
}
function closeShowDetails() { const m = $('th-modal'); if (m) { m.hidden = true; m.replaceChildren(); } }

function openWatch(s) {
  const w = $('th-watch'), frame = $('th-watch-frame'), title = $('th-watch-title');
  if (!w || !s.watchUrl) { if (s && !s.watchUrl) toast('No video link set for this title yet.'); return; }
  if (title) title.textContent = s.title;
  // Always offer an "open in new tab" escape hatch (and a Drive-sharing hint).
  const open = $('th-watch-open'), hint = $('th-watch-hint');
  if (open) { open.href = s.watchUrl; open.hidden = false; }
  if (hint) { hint.hidden = !isDriveUrl(s.watchUrl); hint.textContent = 'Drive file must be shared “Anyone with the link”'; }
  frame.src = watchEmbedUrl(s.watchUrl);
  w.hidden = false;
}
function closeWatch() {
  const w = $('th-watch'), frame = $('th-watch-frame');
  if (w) w.hidden = true;
  if (frame) frame.src = 'about:blank';
  const open = $('th-watch-open'), hint = $('th-watch-hint');
  if (open) open.hidden = true;
  if (hint) hint.hidden = true;
}

// Make common share links embeddable (YouTube, Google Drive); otherwise use as-is.
function watchEmbedUrl(url) {
  try {
    const u = new URL(url, location.href);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return 'https://www.youtube.com/embed/' + u.pathname.slice(1);
    if (host.endsWith('youtube.com')) { const v = u.searchParams.get('v'); if (v) return 'https://www.youtube.com/embed/' + v; }
    if (host.endsWith('drive.google.com')) {
      // works for /file/d/<id>/..., /d/<id>, open?id=<id>, uc?id=<id>
      const m = u.pathname.match(/\/d\/([^/]+)/);
      const id = (m && m[1]) || u.searchParams.get('id');
      if (id) return 'https://drive.google.com/file/d/' + id + '/preview';
    }
  } catch (e) { /* not a URL we rewrite */ }
  return url;
}
const isDriveUrl = (url) => { try { return new URL(url, location.href).hostname.endsWith('drive.google.com'); } catch (e) { return false; } };

async function deleteShowFlow(s) {
  const yes = await dialogs.confirmWindow('Remove "' + s.title + '" from the theater?', 'Delete');
  if (!yes) return;
  try { await backend.deleteShow(s.id); await showsChanged(); toast('Removed ' + s.title + '.'); }
  catch (e) { toast(e.message || 'Could not delete that.'); }
}

// Reload the catalogue after a staff change and re-render.
async function showsChanged() {
  try { shows = await backend.listShows(); } catch (e) { /* keep what we have */ }
  if (theaterOpen) renderTheater();
}

// Wire the theater's static controls once.
(() => {
  const close = $('th-close'); if (close) close.addEventListener('click', closeTheater);
  const wb = $('th-watch-back'); if (wb) wb.addEventListener('click', closeWatch);
  const m = $('th-modal'); if (m) m.addEventListener('click', (e) => { if (e.target === m) closeShowDetails(); });
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !theaterOpen) return;
    if ($('th-watch') && !$('th-watch').hidden) closeWatch();
    else if ($('th-modal') && !$('th-modal').hidden) closeShowDetails();
    else closeTheater();
  });
})();

// Reload the list of HUB-added games, apply play counts, sort most-played first.
async function refreshGames() {
  let added = [], counts = {}, comments = {};
  try { [added, counts, comments] = await Promise.all([backend.listGames(), backend.listPlayCounts(), backend.listCommentCounts()]); } catch (err) { console.error('Could not load games', err); }
  allGames = [...GAMES, ...added];
  for (const g of allGames) { g.plays = counts[g.id] || 0; g.comments = comments[g.id] || 0; }
  allGames.sort((a, b) => b.plays - a.plays);   // most played rises to the top
  renderQuickList();
  if (hub) hub.rebuild();
}

async function removeGameFlow(game) {
  const yes = await dialogs.confirmWindow('Remove "' + game.title + '" from the HUB? This cannot be undone.', 'Remove');
  if (!yes) return;
  try {
    await backend.removeGame(game);
    toast(game.title + ' was removed.');
  } catch (err) {
    toast(err.message);
  }
  refreshGames();
}

// Pictures uploaded for HUB-added games, loaded once and shared by redraws.
const imageCache = new Map();
function cardImage(url, onReady) {
  let entry = imageCache.get(url);
  if (!entry) {
    entry = { img: new Image(), ok: false, waiting: [] };
    entry.img.crossOrigin = 'anonymous';   // needed to use it as a WebGL texture
    entry.img.onload = () => { entry.ok = true; entry.waiting.splice(0).forEach((fn) => fn()); };
    entry.img.src = url;
    imageCache.set(url, entry);
  }
  if (!entry.ok && onReady) entry.waiting.push(onReady);
  return entry.ok ? entry.img : null;
}

/* ------------------------------------------------------------------ */
/* Canvas drawing helpers                                              */
/* ------------------------------------------------------------------ */

function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// The house style: a grey Windows 95 bevel, raised or pressed in.
function bevel(g, x, y, w, h, { fill = C.silver, pressed = false, t = 2 } = {}) {
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
  const edge = (i, tl, br) => {
    g.fillStyle = tl;
    g.fillRect(x + i, y + i, w - 2 * i, t);
    g.fillRect(x + i, y + i, t, h - 2 * i);
    g.fillStyle = br;
    g.fillRect(x + i, y + h - i - t, w - 2 * i, t);
    g.fillRect(x + w - i - t, y + i, t, h - 2 * i);
  };
  if (pressed) { edge(0, '#000000', '#ffffff'); edge(t, '#808080', '#dfdfdf'); }
  else { edge(0, '#ffffff', '#000000'); edge(t, '#dfdfdf', '#808080'); }
}

function rainbow(g, x0, x1) {
  const grad = g.createLinearGradient(x0, 0, x1, 0);
  ['#FF0000', '#FF9900', '#FFFF00', '#00FF00', '#00FFFF', '#3366FF', '#FF00FF'].forEach((c, i, a) => grad.addColorStop(i / (a.length - 1), c));
  return grad;
}

// Largest font size (<= max) at which `text` fits in `width`.
function fitFont(g, text, width, max, family, min = 12, style = '') {
  let size = max;
  for (; size > min; size -= 1) {
    g.font = `${style} ${size}px ${family}`;
    if (g.measureText(text).width <= width) break;
  }
  g.font = `${style} ${size}px ${family}`;
  return size;
}

function wrapLines(g, text, width, maxLines = 99) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (g.measureText(test).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last && g.measureText(last + '…').width > width) last = last.slice(0, -1);
    lines[maxLines - 1] = last.trimEnd() + '…';
  }
  return lines;
}

function drawLines(g, lines, x, y, lineHeight) {
  lines.forEach((l, i) => g.fillText(l, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

/* ---------- card artwork ---------- */

function artTaco(g, w, h) {
  g.fillStyle = '#FF9F1C';
  g.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.5;
  g.fillStyle = '#FFBB45';
  for (let i = 0; i < 12; i += 2) {
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, w, (i * Math.PI) / 6, ((i + 1) * Math.PI) / 6);
    g.closePath();
    g.fill();
  }
  const r = Math.min(w * 0.3, h * 0.46), top = h * 0.42;
  g.lineWidth = 4;
  g.strokeStyle = C.ink;
  const blob = (x, y, rad, color) => {
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
    g.stroke();
  };
  for (let i = 0; i < 6; i++) blob(cx - r * 0.8 + i * r * 0.32, top - 4 - (i % 2) * 7, r * 0.2, '#5BBF4A');
  blob(cx - r * 0.5, top + 1, r * 0.13, '#E23D28');
  blob(cx + r * 0.1, top - 1, r * 0.13, '#E23D28');
  blob(cx + r * 0.58, top + 2, r * 0.12, '#7A4A21');
  g.beginPath();
  g.arc(cx, top, r, 0, Math.PI);
  g.closePath();
  g.fillStyle = '#F6C453';
  g.fill();
  g.lineWidth = 5;
  g.stroke();
  g.fillStyle = '#D9A032';
  [[-0.45, 0.3], [0.1, 0.55], [0.5, 0.25], [-0.1, 0.2]].forEach(([dx, dy]) => {
    g.beginPath();
    g.arc(cx + dx * r, top + dy * r, 4, 0, Math.PI * 2);
    g.fill();
  });
}

function artBlocks(g, w, h) {
  g.fillStyle = '#3A86FF';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.18)';
  g.lineWidth = 1;
  for (let x = 0; x < w; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y < h; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.fillStyle = '#1B4FBF';
  g.fillRect(0, h - 26, w, 26);
  g.strokeStyle = C.ink;
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(0, h - 26); g.lineTo(w, h - 26); g.stroke();
  const box = (x, y, s, rot, color) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = color;
    g.fillRect(-s / 2, -s / 2, s, s);
    g.strokeRect(-s / 2, -s / 2, s, s);
    g.restore();
  };
  box(w * 0.3, h - 26 - 29, 58, 0, C.yellow);
  box(w * 0.47, h - 26 - 24, 48, 0, C.cream);
  box(w * 0.39, h - 26 - 80, 46, 0.12, C.pink);
  box(w * 0.72, h * 0.36, 44, 0.6, C.yellow);
  g.beginPath();
  g.arc(w * 0.6, h * 0.56, 22, 0, Math.PI * 2);
  g.fillStyle = C.maroon;
  g.fill();
  g.stroke();
  g.lineWidth = 3;
  g.strokeStyle = '#fff';
  [[0.78, 0.2], [0.84, 0.28], [0.86, 0.4]].forEach(([x, y]) => {
    g.beginPath(); g.moveTo(w * x, h * y); g.lineTo(w * x + 16, h * y - 8); g.stroke();
  });
}

function artDice(g, w, h) {
  g.fillStyle = '#1c0710';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#35101f';
  for (let y = 0; y < h; y += 6) for (let x = (y / 6) % 2 ? 6 : 0; x < w; x += 12) g.fillRect(x, y, 6, 6);
  // elevator doors
  const dw = w * 0.34, dh = h * 0.78, dx = w / 2 - dw / 2, dy = h - dh;
  g.fillStyle = '#0c0307';
  g.fillRect(dx - 8, dy - 8, dw + 16, dh + 8);
  g.fillStyle = '#5b1a2c';
  g.fillRect(dx, dy, dw / 2 - 2, dh);
  g.fillRect(dx + dw / 2 + 2, dy, dw / 2 - 2, dh);
  g.fillStyle = C.yellow;
  g.fillRect(w / 2 - 14, dy - 22, 28, 9);
  // dice
  const die = (x, y, s, rot, pips) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = '#C1121F';
    g.strokeStyle = C.cream;
    g.lineWidth = 4;
    g.fillRect(-s / 2, -s / 2, s, s);
    g.strokeRect(-s / 2, -s / 2, s, s);
    g.fillStyle = C.cream;
    pips.forEach(([px, py]) => g.fillRect(px * s * 0.27 - 4, py * s * 0.27 - 4, 8, 8));
    g.restore();
  };
  die(w * 0.2, h * 0.66, 56, -0.25, [[-1, -1], [0, 0], [1, 1]]);
  die(w * 0.82, h * 0.58, 48, 0.35, [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]);
  g.fillStyle = 'rgba(0,0,0,.22)';
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 2);
}

function artFallback(g, w, h, game) {
  g.fillStyle = game.accent || C.maroon;
  g.fillRect(0, 0, w, h);
  g.font = `bold ${h * 0.7}px ${TIMES}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = C.ink;
  g.fillStyle = C.cream;
  const letter = (game.title || '?').charAt(0).toUpperCase();
  g.strokeText(letter, w / 2, h / 2);
  g.fillText(letter, w / 2, h / 2);
}

function artCity(g, w, h) {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#2B1055');
  sky.addColorStop(0.7, '#FF5E3A');
  sky.addColorStop(1, '#FFB347');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#FFE066';
  g.beginPath();
  g.arc(w * 0.78, h * 0.5, 30, 0, Math.PI * 2);
  g.fill();
  const road = h - 34;
  const towers = [[0.02, 0.5], [0.14, 0.72], [0.27, 0.42], [0.4, 0.8], [0.55, 0.55], [0.68, 0.66], [0.84, 0.46]];
  towers.forEach(([x, tall], i) => {
    const bw = w * 0.13, bh = road * tall, bx = w * x, by = road - bh;
    g.fillStyle = i % 2 ? '#1a1033' : '#241747';
    g.fillRect(bx, by, bw, bh);
    g.fillStyle = '#FFE066';
    for (let wy = by + 9; wy < road - 12; wy += 15) {
      for (let wx = bx + 7; wx < bx + bw - 9; wx += 13) {
        if (Math.floor(wx * 7 + wy * 13 + i) % 5 > 1) g.fillRect(wx, wy, 6, 8);
      }
    }
  });
  g.fillStyle = '#2a2a2e';
  g.fillRect(0, road, w, h - road);
  g.fillStyle = '#FFE066';
  for (let x = 6; x < w; x += 42) g.fillRect(x, road + 15, 22, 4);
  // getaway car
  const cx = w * 0.3, cy = road + 8;
  g.fillStyle = '#E01B24';
  g.fillRect(cx, cy - 12, 78, 16);
  g.fillRect(cx + 16, cy - 26, 40, 16);
  g.fillStyle = '#9BE7FF';
  g.fillRect(cx + 21, cy - 22, 13, 9);
  g.fillRect(cx + 38, cy - 22, 13, 9);
  g.fillStyle = '#000';
  [cx + 17, cx + 60].forEach((x) => { g.beginPath(); g.arc(x, cy + 5, 9, 0, Math.PI * 2); g.fill(); });
  g.fillStyle = '#fff';
  for (let i = 0; i < 3; i++) g.fillRect(cx - 14 - i * 14, cy - 8 + i * 5, 9, 3);
}

const ART = { taco: artTaco, blocks: artBlocks, city: artCity, dice: artDice };

/* ------------------------------------------------------------------ */
/* three.js scene                                                      */
/* ------------------------------------------------------------------ */

let hub = null;      // set once the 3D interface is running
let lastTime = 0;
let tick = () => {};

function startHub(logoImage, doorImage) {
  const canvas = $('stage');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.bg);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 10, 5000);

  const page = new THREE.Group();   // scrolls
  const hud = new THREE.Group();    // fixed nav bar
  scene.add(page, hud);

  const logoTex = new THREE.Texture(logoImage);
  logoTex.colorSpace = THREE.SRGBColorSpace;
  logoTex.anisotropy = maxAniso;
  logoTex.needsUpdate = true;

  let doorTex = null;
  if (doorImage) {
    doorTex = new THREE.Texture(doorImage);
    doorTex.colorSpace = THREE.SRGBColorSpace;
    doorTex.anisotropy = maxAniso;
    doorTex.needsUpdate = true;
  }

  let W = 0, H = 0, total = 0, maxScroll = 0;
  let cLeft = 0, cTop = 0;   // canvas box offset in the viewport (sidebar pushes it right)
  let scroll = 0, scrollTarget = 0;
  const anchors = { top: 0, games: 0, board: 0 };
  let interactives = [];
  let updaters = [];
  let hovered = null;
  let logoClicks = 0;
  const pointer = { x: 0, y: 0, nx: 0, ny: 0, inside: false };

  /* ---------- building blocks ---------- */

  function panel(w, h, draw, order = 10) {
    const scale = 2;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w * scale);
    cv.height = Math.ceil(h * scale);
    const g = cv.getContext('2d');
    g.scale(scale, scale);
    draw(g, w, h);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }),
    );
    mesh.renderOrder = order;
    mesh.userData.redraw = (fn) => {
      g.clearRect(0, 0, w, h);
      fn(g, w, h);
      tex.needsUpdate = true;
    };
    return mesh;
  }

  // Position a mesh by its centre x and top edge, website-style.
  function place(mesh, cx, top, h, z = 0) {
    mesh.position.set(cx, -(top + h / 2), z);
    return mesh;
  }

  function interactive(mesh, zone, onClick, onHover) {
    interactives.push({ mesh, zone, onClick, onHover });
  }

  // A grey Windows 95 push button; it presses in while hovered.
  function button(label, w, h, { size = 14, down = false } = {}) {
    const draw = (hover) => (g) => {
      const pressed = hover || down;
      bevel(g, 0, 0, w, h, { pressed });
      fitFont(g, label, w - 12, size, SANS, 10, 'bold');
      g.fillStyle = C.ink;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const off = pressed ? 1 : 0;
      g.fillText(label, w / 2 + off, h / 2 + 1 + off);
    };
    const mesh = panel(w, h, draw(false));
    mesh.userData.setHover = (on) => mesh.userData.redraw(draw(on));
    return mesh;
  }

  function flat(w, h, color, order) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }),
    );
    mesh.renderOrder = order;
    return mesh;
  }

  function disposeGroup(group) {
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (m.map && m.map !== logoTex) m.map.dispose();
        m.dispose();
      }
    });
    group.clear();
  }

  /* ---------- sections ---------- */

  function buildNav(cw, wide) {
    // Silver toolbar with a raised bottom edge.
    const bar = flat(W * 3, NAV_H, C.silver, 100);
    const hi = flat(W * 3, 2, '#ffffff', 101);
    hi.position.y = NAV_H / 2 - 1;
    const lo = flat(W * 3, 2, '#808080', 101);
    lo.position.y = -NAV_H / 2 + 3;
    const edge = flat(W * 3, 2, '#000000', 101);
    edge.position.y = -NAV_H / 2 + 1;
    hud.add(bar, hi, lo, edge);

    const left = -cw / 2;
    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 36),
      new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, depthTest: false }),
    );
    logo.renderOrder = 102;
    logo.position.set(left + 18, 0, 0);
    hud.add(logo);

    const full = W >= 620;
    const bw = full ? 270 : 92;
    const brand = panel(bw, 40, (g, w, h) => {
      g.font = `italic bold 21px ${TIMES}`;
      g.textBaseline = 'middle';
      const head = full ? 'Epic Entertainment ' : 'EE ';
      g.fillStyle = C.navy;
      g.fillText(head, 0, h / 2 + 1);
      g.fillStyle = '#CC0000';
      g.fillText('HUB', g.measureText(head).width, h / 2 + 1);
    }, 102);
    brand.position.set(left + 46 + bw / 2, 0, 0);
    hud.add(brand);
    // The logo + name act as the "home" link.
    const home = new THREE.Mesh(
      new THREE.PlaneGeometry(46 + bw, 44),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    home.position.set(left + (46 + bw) / 2, 0, 0);
    hud.add(home);
    interactive(home, 'hud', () => scrollTo(anchors.top));
    // The page links and music switch now live in the left sidebar.
  }

  function buildHero(y, cw, wide) {
    const heroH = wide ? clamp(H * 0.72, 460, 620) : 0;
    const R = wide ? clamp(cw * 0.15, 110, 165) : 92;

    // The logo, as a chunky spinning coin.
    const coin = new THREE.Group();
    const faceMat = new THREE.MeshBasicMaterial({ map: logoTex });
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, R * 0.16, 72), [edgeMat, faceMat, faceMat]);
    disc.rotation.x = Math.PI / 2;
    disc.rotation.y = Math.PI / 2;
    coin.add(disc);

    let tw, th, textCx, textTop, coinX, coinY, align;
    if (wide) {
      tw = cw - (2 * R + 90);
      th = 262;
      align = 'left';
      const blockH = th + 64;
      textTop = y + (heroH - blockH) / 2;
      textCx = cw / 2 - tw / 2;
      coinX = -cw / 2 + R + 14;
      coinY = -(y + heroH / 2);
    } else {
      tw = cw;
      th = 290;
      align = 'center';
      coinX = 0;
      coinY = -(y + 44 + R);
      textTop = y + 44 + 2 * R + 30;
      textCx = 0;
    }
    coin.position.set(coinX, coinY, 0);
    page.add(coin);

    let spin = 0, spinFrom = 0, spinT = 1;
    updaters.push((t, dt) => {
      const idleY = REDUCED ? 0 : Math.sin(t * 0.9) * 0.3;
      const idleX = REDUCED ? 0 : Math.sin(t * 0.7) * 0.08;
      if (spinT < 1) {
        spinT = Math.min(1, spinT + dt / 0.9);
        spin = spinFrom + (1 - Math.pow(1 - spinT, 3)) * Math.PI * 2;
      }
      coin.rotation.y = idleY + spin + pointer.nx * 0.35;
      coin.rotation.x = idleX - pointer.ny * 0.25;
      coin.position.y = coinY + (REDUCED ? 0 : Math.sin(t * 1.3) * 8);
    });
    interactive(disc, 'page', () => {
      if (spinT >= 1) { spinFrom = spin; spinT = REDUCED ? 1 : 0; }
      if (++logoClicks >= 5) { logoClicks = 0; openGame(SECRET_GAME); return; }
      toast('Awesome!!!');
    });

    // Blinking "NEW!" starburst pinned to the logo.
    const burst = panel(104, 104, (g, w, h) => {
      g.translate(w / 2, h / 2);
      g.beginPath();
      for (let i = 0; i < 28; i++) {
        const rad = i % 2 ? 34 : 50;
        const a = (i / 28) * Math.PI * 2;
        g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      g.closePath();
      g.fillStyle = '#FF0000';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = C.yellow;
      g.stroke();
      g.rotate(-0.25);
      g.font = `bold 22px ${COMIC}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = C.yellow;
      g.fillText('NEW!', 0, 1);
    }, 12);
    burst.position.set(coinX + R * 0.78, coinY + R * 0.78, 40);
    page.add(burst);
    if (!REDUCED) updaters.push((t) => { burst.visible = t % 1.4 < 1; });

    const text = panel(tw, th, (g, w) => {
      const ax = align === 'left' ? 0 : w / 2;
      g.textAlign = align;
      g.textBaseline = 'alphabetic';

      const hello = '~*~ Welcome to the official homepage of ~*~';
      fitFont(g, hello, w - 4, 17, COMIC, 10, 'bold');
      g.fillStyle = C.yellow;
      g.fillText(hello, ax, 20);

      // Rainbow WordArt-style title
      const title = 'EPIC ENTERTAINMENT';
      const size = fitFont(g, title, w - 14, 70, TIMES, 22, 'italic bold');
      const by = 36 + size;
      const tW = g.measureText(title).width;
      const x0 = align === 'left' ? 0 : (w - tW) / 2;
      g.fillStyle = '#0000CC';
      g.fillText(title, ax + 4, by + 4);
      g.fillStyle = rainbow(g, x0, x0 + tW);
      g.fillText(title, ax, by);

      // Second row: "LLC" struck out, then HUB.
      const row = clamp(size * 0.95, 44, 64);
      g.font = `bold ${row * 0.7}px ${TIMES}`;
      const llcW = g.measureText('LLC').width;
      g.font = `bold ${row}px ${COMIC}`;
      const hubW = g.measureText('HUB').width;
      const rowW = llcW + 18 + hubW;
      let x = align === 'left' ? 0 : (w - rowW) / 2;
      const base = by + 16 + row * 0.86;
      g.textAlign = 'left';
      g.font = `bold ${row * 0.7}px ${TIMES}`;
      g.fillStyle = '#909090';
      g.fillText('LLC', x, base);
      g.fillStyle = '#FF0000';
      g.fillRect(x - 4, base - row * 0.26, llcW + 8, 4);
      x += llcW + 18;
      g.font = `bold ${row}px ${COMIC}`;
      g.fillStyle = C.magenta;
      g.fillText('HUB', x + 3, base + 3);
      g.fillStyle = C.lime;
      g.fillText('HUB', x, base);

      g.textAlign = align;
      g.font = `19px ${TIMES}`;
      g.fillStyle = '#ffffff';
      const lines = wrapLines(g, 'Awesome epic tuff games right here folks yes yes! Pick one and play it right here. ' + (backend.configured ? 'Sign up for a profile and a rank!' : 'Profiles, ranks and community-made games are coming soon.'), Math.min(w, 560), 4);
      drawLines(g, lines, ax, base + 44, 25);
    });
    place(text, textCx, textTop, th);
    page.add(text);

    const cta = button('Click here to PLAY!', 220, 46, { size: 17 });
    const ctaTop = textTop + th + 10;
    place(cta, wide ? textCx - tw / 2 + 110 : 0, ctaTop, 46);
    page.add(cta);
    interactive(cta, 'page', () => scrollTo(anchors.games), (on) => cta.userData.setHover(on));

    return wide ? y + heroH : ctaTop + 46 + 40;
  }

  // A real scrolling marquee: one strip of text, repeated and slid sideways.
  function buildMarquee(y, cw) {
    const message = `*** WELCOME TO EPIC ENTERTAINMENT HUB ***  ${allGames.length} GAMES ONLINE  ***  ${backend.configured ? 'SIGN UP TODAY - IT IS FREE' : 'SIGN-INS COMING SOON'}  ***  THANKS FOR STOPPING BY!  `;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = `bold 17px ${COMIC}`;
    const textW = Math.ceil(probe.measureText(message).width);
    const h = 32;
    const strip = panel(textW, h, (g, w, ph) => {
      g.fillStyle = C.navy;
      g.fillRect(0, 0, w, ph);
      g.font = `bold 17px ${COMIC}`;
      g.textBaseline = 'middle';
      g.fillStyle = C.yellow;
      g.fillText(message, 0, ph / 2 + 1);
    });
    strip.geometry.dispose();
    strip.geometry = new THREE.PlaneGeometry(cw, h);
    const tex = strip.material.map;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(cw / textW, 1);
    place(strip, 0, y, h);
    page.add(strip);
    if (!REDUCED) updaters.push((t, dt) => { tex.offset.x = (tex.offset.x + (dt * 70) / textW) % 1; });
    return y + h;
  }

  // The classic rainbow horizontal rule.
  function buildRule(y, cw) {
    const rule = panel(cw, 6, (g, w, h) => {
      g.fillStyle = rainbow(g, 0, w);
      g.fillRect(0, 0, w, h);
    });
    place(rule, 0, y, 6);
    page.add(rule);
    return y + 6;
  }

  function buildGames(y, cw) {
    const head = panel(cw, 84, (g) => {
      g.textBaseline = 'alphabetic';
      g.font = `bold 34px ${COMIC}`;
      const label = 'Playable Games';
      g.fillStyle = C.magenta;
      g.fillText(label, 3, 39);
      g.fillStyle = C.yellow;
      g.fillText(label, 0, 36);
      const tw = g.measureText(label).width;
      g.font = `bold 22px ${TIMES}`;
      g.fillStyle = C.cyan;
      g.fillText(`(${allGames.length})`, tw + 12, 36);
      g.font = `italic 18px ${TIMES}`;
      g.fillStyle = '#ffffff';
      g.fillText('Embedded right here - pick one and go!', 0, 68);
    });
    place(head, 0, y, 84);
    page.add(head);
    y += 84 + 22;

    // Owners and Admins get an "add a game" button next to the heading.
    if (backend.isStaff()) {
      const add = button('+ Add a game…', 150, 36);
      if (cw >= 560) place(add, cw / 2 - 75, y - 84 - 22 + 4, 36);
      else { place(add, -cw / 2 + 75, y - 10, 36); y += 44; }
      page.add(add);
      interactive(add, 'page', () => dialogs.openAddGame(), (on) => add.userData.setHover(on));
    }

    const gap = 30;
    const cardW = Math.min(336, cw);
    const cardH = 424;
    const cols = clamp(Math.floor((cw + gap) / (cardW + gap)), 1, 3);
    const rowW = (n) => n * cardW + (n - 1) * gap;

    allGames.forEach((game, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const inRow = Math.min(cols, allGames.length - row * cols);
      const x0 = cols > 1 && cw >= rowW(cols) ? -cw / 2 : -rowW(inRow) / 2;
      const stretch = cols > 1 ? (cw - rowW(cols)) / (cols - 1) : 0;
      const cx = x0 + cardW / 2 + col * (cardW + gap + stretch);
      const top = y + row * (cardH + gap);

      const draw = (hover) => (g, w, h) => drawCard(g, w, h, game, hover);
      const card = panel(cardW, cardH, draw(false));
      place(card, cx, top, cardH);
      page.add(card);

      if (game.image) cardImage(game.image, () => { if (card.parent) card.userData.redraw(draw(Boolean(card.userData.hover))); });

      const baseY = card.position.y;
      const target = { rx: 0, ry: 0, z: 0, s: 1 };
      updaters.push((t, dt) => {
        const k = REDUCED ? 1 : 1 - Math.pow(0.0005, dt);
        card.rotation.x += (target.rx - card.rotation.x) * k;
        card.rotation.y += (target.ry - card.rotation.y) * k;
        card.position.z += (target.z - card.position.z) * k;
        const s = card.scale.x + (target.s - card.scale.x) * k;
        card.scale.setScalar(s);
        card.position.y = baseY + (REDUCED ? 0 : Math.sin(t * 1.1 + i * 1.7) * 3);
      });
      interactive(card, 'page', (hit) => {
        if (hit && hit.uv) {
          const px = hit.uv.x * cardW, py = (1 - hit.uv.y) * cardH;
          if (py < 34) {
            // comment pill (everyone): opens this game's comments
            if (backend.configured && px >= cardW - 136 && px <= cardW - 90) return dialogs.openComments(game);
            // staff title-bar buttons: ✎ edits, × removes a HUB-added game
            if (game.removable && backend.isStaff()) {
              if (px > cardW - 42) return removeGameFlow(game);
              if (px > cardW - 66) return dialogs.openEditGame(game);
            }
          }
        }
        openGame(game);
      }, (on, hit) => {
        if (on && hit && hit.uv && !REDUCED) {
          target.ry = (hit.uv.x - 0.5) * 0.3;
          target.rx = (hit.uv.y - 0.5) * 0.22;
        } else {
          target.rx = target.ry = 0;
        }
        target.z = on ? 36 : 0;
        target.s = on ? 1.03 : 1;
        card.renderOrder = on ? 20 : 10;
        if (card.userData.hover !== on) {
          card.userData.hover = on;
          card.userData.redraw(draw(on));
        }
      });
    });
    const rows = Math.ceil(allGames.length / cols);
    return y + rows * cardH + (rows - 1) * gap;
  }

  // Each game is a little Windows 95 window.
  function drawCard(g, w, h, game, hover) {
    const bw = w - 8, bh = h - 8, artH = 168;
    g.fillStyle = hover ? C.yellow : 'rgba(0,0,0,.65)';
    g.fillRect(8, 8, bw, bh);
    bevel(g, 0, 0, bw, bh);

    // title bar
    const bar = g.createLinearGradient(6, 0, bw - 6, 0);
    bar.addColorStop(0, C.navy);
    bar.addColorStop(1, '#1084D0');
    g.fillStyle = bar;
    g.fillRect(6, 6, bw - 12, 26);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    fitFont(g, game.title + '.exe', bw - 156, 14, SANS, 10, 'bold');
    g.fillText(game.title + '.exe', 12, 20);
    const staffCtl = game.removable && backend.isStaff();   // edit + close buttons for staff
    ['_', staffCtl ? '✎' : '□', '×'].forEach((glyph, i) => {
      const bx = bw - 10 - (3 - i) * 22 + (i === 2 ? 2 : 0), by = 9;
      bevel(g, bx, by, 20, 20, { t: 1 });
      g.fillStyle = (i === 2 && staffCtl) ? '#C00000' : (i === 1 && staffCtl) ? '#000080' : C.ink;
      g.font = `bold 13px ${SANS}`;
      g.textAlign = 'center';
      g.fillText(glyph, bx + 10, by + (glyph === '_' ? 7 : 11));
    });
    // comment pill (everyone): shows this game's comment count, opens its thread
    if (backend.configured) {
      const pillW = 46, pillX = bw - 10 - 3 * 22 - 6 - pillW, pillY = 9;
      bevel(g, pillX, pillY, pillW, 20, { t: 1 });
      g.fillStyle = C.ink;
      g.font = `bold 12px ${SANS}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('💬 ' + (game.comments || 0), pillX + pillW / 2, pillY + 11);
      g.textBaseline = 'alphabetic';
    }

    // artwork in a sunken frame, drawn chunky like an old GIF
    const ax = 12, ay = 40, aw = bw - 24;
    bevel(g, ax, ay, aw, artH, { pressed: true, fill: '#000' });
    const pic = game.image ? cardImage(game.image) : null;
    if (pic) {
      // uploaded picture, cropped to fill the frame
      const fw = aw - 8, fh = artH - 8;
      const scale = Math.max(fw / pic.naturalWidth, fh / pic.naturalHeight);
      const sw = fw / scale, sh = fh / scale;
      g.drawImage(pic, (pic.naturalWidth - sw) / 2, (pic.naturalHeight - sh) / 2, sw, sh, ax + 4, ay + 4, fw, fh);
    } else {
    const px = 3;
    const small = document.createElement('canvas');
    small.width = Math.round((aw - 8) / px);
    small.height = Math.round((artH - 8) / px);
    const sg = small.getContext('2d');
    sg.scale(1 / px, 1 / px);
    (ART[game.art] || artFallback)(sg, aw - 8, artH - 8, game);
    g.imageSmoothingEnabled = false;
    g.drawImage(small, ax + 4, ay + 4, aw - 8, artH - 8);
    g.imageSmoothingEnabled = true;
    }

    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = C.ink;
    fitFont(g, game.title, bw - 32, 27, TIMES, 16, 'bold');
    g.fillText(game.title, 16, ay + artH + 36);

    g.font = `17px ${TIMES}`;
    const lines = wrapLines(g, game.description || '', bw - 32, 3);
    drawLines(g, lines, 16, ay + artH + 62, 21);

    // play count, right-aligned on the tags row
    const plays = game.plays || 0;
    g.textAlign = 'right';
    g.font = `bold 14px ${SANS}`;
    g.fillStyle = '#1f6b2a';
    const playLabel = '▶ ' + plays.toLocaleString() + (plays === 1 ? ' play' : ' plays');
    g.fillText(playLabel, bw - 16, ay + artH + 132);
    const playW = g.measureText(playLabel).width;

    // tags, styled as old-school links
    let tx = 16;
    const ty = ay + artH + 134;
    g.textAlign = 'left';
    g.font = `15px ${TIMES}`;
    for (const tag of (game.tags || []).slice(0, 3)) {
      const tw = g.measureText(tag).width;
      if (tx + tw > bw - 24 - playW) break;
      g.fillStyle = C.link;
      g.fillText(tag, tx, ty);
      g.fillRect(tx, ty + 2, tw, 1);
      tx += tw + 14;
    }

    // play button
    const bx = 16, by = bh - 60, bwid = bw - 32, bhgt = 42;
    bevel(g, bx, by, bwid, bhgt, { pressed: hover });
    const off = hover ? 1 : 0;
    g.fillStyle = C.ink;
    g.font = `bold 18px ${SANS}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const label = 'PLAY';
    const lw = g.measureText(label).width;
    g.fillText(label, bx + bwid / 2 - 10 + off, by + bhgt / 2 + 1 + off);
    g.beginPath();
    const tx2 = bx + bwid / 2 + lw / 2 - 2 + off, ty2 = by + bhgt / 2 + off;
    g.moveTo(tx2, ty2 - 8);
    g.lineTo(tx2 + 13, ty2);
    g.lineTo(tx2, ty2 + 8);
    g.closePath();
    g.fill();
  }

  // Places a row of buttons, wrapping to new rows when they don't fit.
  function buttonRow(specs, y, cw, wide) {
    const gap = 12;
    const fits = wide && specs.reduce((s, b) => s + b.w + gap, -gap) <= cw;
    if (fits) {
      const totalW = specs.reduce((s, b) => s + b.w + gap, -gap);
      let bx = -totalW / 2;
      for (const b of specs) {
        const mesh = button(b.label, b.w, 40, { size: 14, down: b.down });
        place(mesh, bx + b.w / 2, y, 40);
        page.add(mesh);
        interactive(mesh, 'page', b.act, (on) => mesh.userData.setHover(on));
        bx += b.w + gap;
      }
      return y + 40;
    }
    // stacked, one per row
    const w = Math.min(320, cw);
    for (const b of specs) {
      const mesh = button(b.label, w, 42, { size: 15, down: b.down });
      place(mesh, 0, y, 42);
      page.add(mesh);
      interactive(mesh, 'page', b.act, (on) => mesh.userData.setHover(on));
      y += 42 + 10;
    }
    return y - 10;
  }

  function buildLeaderboard(y, cw, wide) {
    // The full rankings live on their own page now (openLeaderboard). Here we
    // just tease it and keep the quick actions (daily reward, join).
    const head = panel(cw, 84, (g) => {
      g.textBaseline = 'alphabetic';
      g.font = `bold 34px ${COMIC}`;
      g.fillStyle = C.magenta; g.fillText('Leaderboards', 3, 39);
      g.fillStyle = C.yellow;  g.fillText('Leaderboards', 0, 36);
      g.font = `italic 18px ${TIMES}`;
      g.fillStyle = '#ffffff';
      g.fillText('XP for playing, diamonds from daily rewards, Epic Points from the clicker — see where you rank!', 0, 68);
    });
    place(head, 0, y, 84); page.add(head);
    y += 84 + 16;

    // the one button that opens the standalone page
    y = buttonRow([{ label: '🏆 Open the Leaderboards', w: wide ? 320 : 280, act: () => openLeaderboard() }], y, cw, wide);
    y += 4;

    // your stats + quick actions
    if (backend.configured && backend.me) {
      const me = backend.me;
      const stats = [
        (me.xp || 0).toLocaleString() + ' XP',
        (me.diamonds || 0).toLocaleString() + ' diamonds',
        (me.streak || 0) + ' day streak',
      ].join('   •   ');
      const stripH = wide ? 46 : 58;
      const strip = panel(Math.min(cw, 720), stripH, (g, w, ph) => {
        bevel(g, 0, 0, w, ph, { fill: C.navy });
        g.textBaseline = 'middle';
        if (wide) {
          // username on the left, stats on the right (shrunk to fit the gap)
          g.textAlign = 'left';
          g.font = `bold 16px ${SANS}`; g.fillStyle = C.yellow;
          g.fillText(me.username, 14, ph / 2);
          const used = g.measureText(me.username).width;
          g.textAlign = 'right'; g.fillStyle = '#fff';
          fitFont(g, stats, w - 36 - used, 15, SANS, 11);
          g.fillText(stats, w - 14, ph / 2);
        } else {
          // two lines: username above, stats below (shrunk to fit the width)
          g.textAlign = 'left';
          g.font = `bold 15px ${SANS}`; g.fillStyle = C.yellow;
          g.fillText(me.username, 12, 18);
          g.fillStyle = '#fff';
          fitFont(g, stats, w - 24, 14, SANS, 10);
          g.fillText(stats, 12, 40);
        }
      });
      place(strip, 0, y, stripH); page.add(strip);
      y += stripH + 12;

      const avail = backend.dailyAvailable();
      const specs = [{
        label: avail ? 'Claim daily reward!' : 'Daily reward claimed',
        w: 210, down: !avail,
        act: avail ? claimDailyFlow : () => toast('Already claimed today — come back tomorrow!'),
      }];
      if (backend.isStaff()) specs.push({ label: '+ Add a game', w: 150, act: () => dialogs.openAddGame() });
      specs.push({ label: 'Members', w: 120, act: () => dialogs.openMembers() });
      y = buttonRow(specs, y, cw, wide);
    } else if (backend.configured) {
      y = buttonRow([{ label: 'Pick a username to join the board!', w: 290, act: () => openAccountOrAuth() }], y, cw, wide);
    }
    return y;
  }

  function buildFooter(y, cw) {
    const h = 150;
    const foot = panel(cw, h, (g, w) => {
      g.textAlign = 'center';
      g.textBaseline = 'middle';

      // visit counter (counts this browser's visits)
      const digits = String(visits).padStart(6, '0');
      g.font = `17px ${TIMES}`;
      const pre = 'You have visited this page ', post = ' times';
      const preW = g.measureText(pre).width, postW = g.measureText(post).width;
      const boxW = digits.length * 17 + 8;
      let x = (w - (preW + boxW + postW)) / 2;
      g.textAlign = 'left';
      g.fillStyle = '#ffffff';
      g.fillText(pre, x, 24);
      x += preW;
      g.fillStyle = '#000000';
      g.fillRect(x, 10, boxW, 28);
      g.strokeStyle = '#808080';
      g.lineWidth = 2;
      g.strokeRect(x, 10, boxW, 28);
      g.font = `bold 20px ${MONO}`;
      g.fillStyle = C.lime;
      [...digits].forEach((d, i) => g.fillText(d, x + 6 + i * 17, 25));
      x += boxW;
      g.font = `17px ${TIMES}`;
      g.fillStyle = '#ffffff';
      g.fillText(post, x, 24);

      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.font = `italic 15px ${TIMES}`;
      g.fillStyle = C.cyan;
      let ly = drawLines(g, wrapLines(g, 'Best viewed with Netscape Navigator 4.0 at 800x600 (or anything, really)', w - 8, 2), w / 2, 68, 19);
      g.font = `15px ${TIMES}`;
      g.fillStyle = '#c0c0c0';
      drawLines(g, wrapLines(g, 'Epic Entertainment HUB - a branch of Epic Entertainment LLC - Webmaster: Sefreneth', w - 8, 3), w / 2, ly + 8, 19);
    });
    place(foot, 0, y, h);
    page.add(foot);
    return y + h;
  }

  // A mysterious door at the very bottom. No label, no hint — click it and you
  // leave for the hidden node.
  function buildDoor(y, cw) {
    if (!doorTex) return y;
    const dh = clamp(cw * 0.42, 220, 320);
    const dw = dh * (doorImage.width / doorImage.height);
    const padTop = 48, padBottom = 60;
    const cy = -(y + padTop + dh / 2);
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(dw, dh),
      new THREE.MeshBasicMaterial({ map: doorTex, transparent: true, depthTest: false, opacity: 0.82 }),
    );
    door.renderOrder = 60;
    door.position.set(0, cy, 0);
    page.add(door);
    updaters.push((t) => { door.position.y = cy + Math.sin(t * 0.8) * 3; });   // faint sway
    interactive(door, 'page', () => { location.href = 'clicker.html'; },
      (on) => { door.material.opacity = on ? 1 : 0.82; door.scale.setScalar(on ? 1.04 : 1); });
    return y + padTop + dh + padBottom;
  }

  function buildBackground() {
    // Confetti of square "pixels" behind the page; depth gives free parallax.
    const count = Math.round(clamp((W * (total + H)) / 9000, 120, 520));
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const palette = ['#ffffff', '#ffffff', C.yellow, C.cyan].map((c) => new THREE.Color(c));
    const rand = mulberry(7);
    for (let i = 0; i < count; i++) {
      const z = -150 - rand() * 1500;
      const spread = 1 + -z / camera.position.z;
      pos[i * 3] = (rand() - 0.5) * W * spread * 1.2;
      pos[i * 3 + 1] = H * 0.6 - rand() * (total + H * 1.2) * 1.0;
      pos[i * 3 + 2] = z;
      const c = palette[Math.floor(rand() * palette.length)];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 7, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.85,
    }));
    points.renderOrder = 0;
    page.add(points);

    // A few slow wireframe shapes.
    const shapes = [
      new THREE.IcosahedronGeometry(120, 0),
      new THREE.BoxGeometry(150, 150, 150),
      new THREE.TorusGeometry(100, 34, 8, 14),
      new THREE.OctahedronGeometry(110, 0),
    ];
    const n = Math.max(4, Math.round((total + H) / 420));
    for (let i = 0; i < n; i++) {
      const edges = new THREE.EdgesGeometry(shapes[i % shapes.length]);
      const color = [C.lime, C.cyan, C.magenta][i % 3];
      const mesh = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.4,
      }));
      const z = -500 - rand() * 700;
      const side = i % 2 ? 1 : -1;
      mesh.position.set(side * (W * 0.35 + rand() * W * 0.35), H * 0.3 - (i / n) * (total + H * 0.6), z);
      mesh.rotation.set(rand() * 6, rand() * 6, 0);
      const speed = 0.08 + rand() * 0.12;
      if (!REDUCED) updaters.push((t, dt) => { mesh.rotation.x += dt * speed; mesh.rotation.y += dt * speed * 0.7; });
      page.add(mesh);
    }
    shapes.forEach((s) => s.dispose());
  }

  function mulberry(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- layout ---------- */

  function build() {
    disposeGroup(page);
    disposeGroup(hud);
    interactives = [];
    updaters = [];
    hovered = null;

    // Measure the canvas's own box, not the window. innerWidth/innerHeight can
    // disagree with the real drawing area in some browsers (Opera GX's sidebar
    // and GX Corner, dynamic toolbars, page zoom), which left the scene squished
    // into the top. The canvas fills the viewport, so its client box is the truth.
    const rect = canvas.getBoundingClientRect();
    W = Math.round(rect.width) || canvas.clientWidth || innerWidth;
    H = Math.round(rect.height) || canvas.clientHeight || innerHeight;
    cLeft = rect.left; cTop = rect.top;   // pointer events are viewport-relative; subtract this
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));  // reapply: zoom can change it
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    const camZ = H / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    camera.position.set(0, 0, camZ);
    camera.near = camZ * 0.1;
    camera.far = camZ + 3000;
    camera.updateProjectionMatrix();

    const cw = Math.min(W - 36, 1120);
    const wide = W >= 860;
    // When the left sidebar is showing, the canvas starts to the right of it
    // (rect.left > 0). Hug the content against the sidebar instead of leaving a
    // gap beside it — any slack goes on the right, not the left.
    const SIDE_GAP = 40; // small breathing room between sidebar and content
    const slack = (W - cw) / 2;
    const offsetX = rect.left > 1 ? -Math.round(Math.max(slack - SIDE_GAP, 0)) : 0;
    page.position.x = offsetX;

    buildNav(cw, wide);
    hud.position.set(offsetX, H / 2 - NAV_H / 2, 0);

    let y = NAV_H;
    y = buildHero(y, cw, wide);
    y = buildMarquee(y, cw) + 36;
    anchors.games = y - NAV_H - 18;
    y = buildGames(y, cw);
    y = buildRule(y + 48, cw) + 44;
    anchors.board = y - NAV_H - 24;
    y = buildLeaderboard(y, cw, wide);
    y = buildRule(y + 44, cw) + 20;
    y = buildFooter(y, cw);
    y = buildDoor(y, cw);
    total = y + 16;
    maxScroll = Math.max(0, total - H);
    scrollTarget = clamp(scrollTarget, 0, maxScroll);
    scroll = clamp(scroll, 0, maxScroll);
    buildBackground();
  }

  function scrollTo(y) {
    scrollTarget = clamp(y, 0, maxScroll);
    if (REDUCED) scroll = scrollTarget;
  }

  /* ---------- input ---------- */

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pick() {
    if (!pointer.inside) return null;
    const zone = pointer.y <= NAV_H ? 'hud' : 'page';
    ndc.set((pointer.x / W) * 2 - 1, -(pointer.y / H) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    let best = null;
    for (const item of interactives) {
      if (item.zone !== zone) continue;
      const hits = raycaster.intersectObject(item.mesh, false);
      if (hits.length && (!best || hits[0].distance < best.hit.distance)) best = { item, hit: hits[0] };
    }
    return best;
  }

  function updateHover() {
    const found = pick();
    const item = found ? found.item : null;
    if (hovered && hovered !== item && hovered.onHover) hovered.onHover(false);
    if (item && item.onHover) item.onHover(true, found.hit);
    hovered = item;
    canvas.style.cursor = item ? 'pointer' : 'default';
  }

  function setPointer(e) {
    const px = e.clientX - cLeft, py = e.clientY - cTop;
    pointer.x = px;
    pointer.y = py;
    pointer.nx = (px / W) * 2 - 1;
    pointer.ny = -((py / H) * 2 - 1);
    pointer.inside = true;
  }

  // Nothing to see here. Four shapes in the background that happen to move when
  // you pull on them, and don't take kindly to being pushed together.
  const secret = (() => {
    const Z = -150;
    const group = new THREE.Group();
    scene.add(group);
    const geoms = [
      new THREE.IcosahedronGeometry(70, 0),
      new THREE.BoxGeometry(96, 96, 96),
      new THREE.TorusGeometry(58, 18, 8, 14),
      new THREE.OctahedronGeometry(72, 0),
    ];
    const colors = [C.lime, C.cyan, C.magenta, C.yellow];
    const quad = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
    let shapes = [];
    const bursts = [];
    geoms.forEach((geo, i) => {
      const edges = new THREE.EdgesGeometry(geo);
      const mesh = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: colors[i], transparent: true, opacity: 0.4 }));
      geo.computeBoundingSphere();
      mesh.position.z = Z;
      mesh.userData.spin = { x: 0.08 + rand0() * 0.1, y: 0.06 + rand0() * 0.08 };
      group.add(mesh);
      shapes.push({ mesh, r: geo.boundingSphere.radius });
      geo.dispose();
    });

    function rand0() { return Math.random(); }
    function viewHalf() {
      const cz = camera.position.z || 1;
      const scale = (cz - Z) / cz;
      return { hw: (W / 2) * scale, hh: (H / 2) * scale };
    }
    function layout() {
      const { hw, hh } = viewHalf();
      shapes.forEach((s, i) => s.mesh.position.set(quad[i][0] * hw * 0.52, quad[i][1] * hh * 0.5, Z));
    }

    const ray = new THREE.Raycaster();
    const nd = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -Z);
    const hitPt = new THREE.Vector3();
    function point(e) {
      nd.set(((e.clientX - cLeft) / W) * 2 - 1, -((e.clientY - cTop) / H) * 2 + 1);
      ray.setFromCamera(nd, camera);
      return ray.ray.intersectPlane(plane, hitPt) ? hitPt : null;
    }
    let held = null;
    const offset = new THREE.Vector3();

    function burst(pos, color) {
      const N = 16, arr = new Float32Array(N * 3), vel = [];
      for (let i = 0; i < N; i++) { const a = Math.random() * 6.283, sp = 60 + Math.random() * 170; vel.push([Math.cos(a) * sp, Math.sin(a) * sp, (Math.random() - 0.5) * 90]); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 6, transparent: true, opacity: 0.9 }));
      pts.position.copy(pos);
      group.add(pts);
      let life = 0;
      bursts.push((dt) => {
        life += dt;
        for (let i = 0; i < N; i++) { arr[i * 3] += vel[i][0] * dt; arr[i * 3 + 1] += vel[i][1] * dt; arr[i * 3 + 2] += vel[i][2] * dt; }
        g.attributes.position.needsUpdate = true;
        pts.material.opacity = Math.max(0, 0.9 - life * 1.6);
        if (life > 0.6) { group.remove(pts); g.dispose(); pts.material.dispose(); return true; }
        return false;
      });
    }
    function smash(a, b) {
      const mid = a.mesh.position.clone().lerp(b.mesh.position, 0.5);
      burst(mid, a.mesh.material.color);
      burst(mid, b.mesh.material.color);
      [a, b].forEach((s) => { group.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); });
      shapes = shapes.filter((s) => s !== a && s !== b);
      if (!shapes.length) revealSecret();
    }

    return {
      layout,
      grab(e) {
        if (!shapes.length) return false;
        const p = point(e);
        if (!p) return false;
        let best = null, bd = Infinity;
        for (const s of shapes) { const d = s.mesh.position.distanceTo(p); if (d < s.r * 1.15 && d < bd) { bd = d; best = s; } }
        if (!best) return false;
        held = best;
        offset.copy(best.mesh.position).sub(p);
        return true;
      },
      move(e) {
        if (!held) return;
        const p = point(e);
        if (!p) return;
        held.mesh.position.x = p.x + offset.x;
        held.mesh.position.y = p.y + offset.y;
        for (const s of shapes) {
          if (s === held) continue;
          if (held.mesh.position.distanceTo(s.mesh.position) < (held.r + s.r) * 0.72) { const h = held; held = null; return smash(h, s); }
        }
      },
      release() { held = null; },
      count() { return shapes.length; },
      positions() {
        const v = new THREE.Vector3();
        return shapes.map((s) => { v.copy(s.mesh.position).project(camera); return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H }; });
      },
      frame(t, dt) {
        const { hw, hh } = viewHalf();
        for (const s of shapes) {
          s.mesh.rotation.x += dt * s.mesh.userData.spin.x;
          s.mesh.rotation.y += dt * s.mesh.userData.spin.y;
          if (s !== held) {
            s.mesh.position.x = clamp(s.mesh.position.x, -hw + s.r, hw - s.r);
            s.mesh.position.y = clamp(s.mesh.position.y, -hh + s.r, hh - s.r);
          }
        }
        for (let i = bursts.length - 1; i >= 0; i--) if (bursts[i](dt)) bursts.splice(i, 1);
      },
    };
  })();

  let drag = null, secretGrab = false;
  canvas.addEventListener('pointerdown', (e) => {
    setPointer(e);
    if (secret.grab(e)) { secretGrab = true; canvas.setPointerCapture(e.pointerId); return; }
    drag = { id: e.pointerId, y: e.clientY, start: scrollTarget, moved: 0, touch: e.pointerType !== 'mouse' };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    setPointer(e);
    if (secretGrab) { secret.move(e); return; }
    if (drag && drag.id === e.pointerId) {
      const dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(dy));
      if (drag.touch && drag.moved > 8) {
        scrollTarget = clamp(drag.start - dy, 0, maxScroll);
        scroll = scrollTarget;
      }
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    setPointer(e);
    if (secretGrab) { secretGrab = false; secret.release(); drag = null; return; }
    const wasDrag = drag && drag.moved > 8;
    const touch = drag && drag.touch;
    drag = null;
    if (!wasDrag) {
      const found = pick();
      if (found) found.item.onClick(found.hit);
    }
    if (touch) {            // no hover state lingers on touch screens
      pointer.inside = false;
      pointer.nx = pointer.ny = 0;
    }
  });
  canvas.addEventListener('pointercancel', () => { drag = null; secretGrab = false; secret.release(); pointer.inside = false; });
  canvas.addEventListener('pointerleave', () => { pointer.inside = false; pointer.nx = pointer.ny = 0; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? H : 1;
    scrollTo(scrollTarget + e.deltaY * unit);
  }, { passive: false });
  addEventListener('keydown', (e) => {
    if (playing || document.querySelector('dialog[open]')) return;
    if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
    const step = { ArrowDown: 80, ArrowUp: -80, PageDown: H * 0.85, PageUp: -H * 0.85, ' ': H * 0.85 }[e.key];
    if (step !== undefined) { e.preventDefault(); scrollTo(scrollTarget + step); }
    else if (e.key === 'Home') scrollTo(0);
    else if (e.key === 'End') scrollTo(maxScroll);
  });

  // Rebuild on any size change. We watch the canvas directly (ResizeObserver) as
  // well as the window and the visual viewport, so a size that was wrong at first
  // paint — or that changes when a browser panel opens or the page is zoomed —
  // corrects itself instead of staying broken. All debounced into one rebuild.
  let resizeTimer = 0;
  let lastW = W, lastH = H;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const r = canvas.getBoundingClientRect();
      if (Math.round(r.width) !== lastW || Math.round(r.height) !== lastH) {
        build();
        lastW = W; lastH = H;
      }
    }, 120);
  };
  addEventListener('resize', onResize);
  addEventListener('orientationchange', onResize);
  if (window.visualViewport) visualViewport.addEventListener('resize', onResize);
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(canvas);

  /* ---------- render loop ---------- */

  tick = (now) => {
    if (playing || document.hidden) return;   // the game has the GPU to itself
    const t = now / 1000;
    const dt = lastTime ? Math.min(0.05, t - lastTime) : 0.016;
    lastTime = t;
    scroll += (scrollTarget - scroll) * (1 - Math.pow(0.0003, dt));
    if (Math.abs(scrollTarget - scroll) < 0.3) scroll = scrollTarget;
    page.position.y = H / 2 + scroll;
    updateHover();
    for (const u of updaters) u(t, dt);
    secret.frame(t, dt);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !playing) { lastTime = 0; requestAnimationFrame(tick); }
  });

  build();
  secret.layout();
  if (location.search.includes('secret-test')) {                            // opt-in test seam
    window.__secret = secret;
    window.__audio = () => ({ musicPaused: music.paused, secretPlaying: !secretSong.paused, secretActive });
    window.__openSecret = () => openGame(SECRET_GAME);
    window.__openGame = (g) => openGame(g);
  }
  requestAnimationFrame(tick);
  return { rebuild: build, scrollToSection: (name) => scrollTo(anchors[name] || 0) };
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/* ---------- news ticker ---------- */

const DEFAULT_NEWS = 'Welcome to the Epic Entertainment HUB!\nNew games added all the time\nClimb the leaderboards — XP, diamonds and Epic Points';
let currentNews = '';

function renderNews(text) {
  if (text != null) currentNews = text;
  const bar = $('newsbar'), track = $('news-track');
  if (!bar || !track) return;
  const msgs = (currentNews || DEFAULT_NEWS).split('\n').map((s) => s.trim()).filter(Boolean);
  if (!msgs.length) { bar.hidden = true; return; }
  const run = () => msgs.flatMap((m) => {
    const s = document.createElement('span'); s.textContent = m;
    const sep = document.createElement('b'); sep.textContent = '✦';
    return [s, sep];
  });
  track.replaceChildren(...run(), ...run());   // duplicated for a seamless -50% loop
  bar.hidden = false;
}

function syncNewsEdit() {
  const btn = $('news-edit');
  if (btn) btn.hidden = !backend.isStaff();
}

/* ---------- left sidebar (pages) ---------- */

function syncSidebarAccount() {
  const a = $('side-account');
  if (!a) return;
  const signedIn = Boolean(backend.me);
  a.title = signedIn ? 'My account' : 'Join';
  a.querySelector('.label').textContent = signedIn ? 'Account' : 'Join';
  // show the equipped face as the account icon when signed in
  const ico = a.querySelector('.ico');
  if (ico) {
    if (signedIn) {
      const img = document.createElement('img');
      img.className = 'side-av'; img.src = backend.pfpSrc(backend.me.pfp); img.alt = '';
      ico.replaceChildren(img);
    } else ico.textContent = '👤';
  }
}

function setupSidebar() {
  const bar = $('sidebar');
  if (!bar) return;
  const closeDrawer = () => document.body.classList.remove('sidebar-open');   // only matters on narrow screens
  bar.querySelectorAll('[data-go]').forEach((btn) => btn.addEventListener('click', () => {
    // "Scores" is its own page now; everything else is a spot on the main scroll.
    if (btn.dataset.go === 'board') openLeaderboard();
    else if (hub) hub.scrollToSection(btn.dataset.go);
    closeDrawer();
  }));
  const shopBtn = bar.querySelector('[data-act="shop"]');
  if (shopBtn) shopBtn.addEventListener('click', () => { openShop(); closeDrawer(); });
  const showsBtn = bar.querySelector('[data-act="shows"]');
  if (showsBtn) showsBtn.addEventListener('click', () => { openTheater(); closeDrawer(); });
  bar.querySelector('[data-act="request"]').addEventListener('click', () => { window.open('https://forms.gle/7CSei8ZGthE4m54b8', '_blank', 'noopener'); closeDrawer(); });
  bar.querySelector('[data-act="account"]').addEventListener('click', () => { openAccountOrAuth(); closeDrawer(); });
  const musicBtn = bar.querySelector('[data-act="music"]');
  const syncMusicBtn = () => { musicBtn.classList.toggle('on', musicOn); musicBtn.title = musicOn ? 'Music: On' : 'Music: Off'; };
  musicBtn.addEventListener('click', () => { toggleMusic(); syncMusicBtn(); });
  syncMusicBtn();
  syncSidebarAccount();
  const toggle = $('side-toggle');
  if (toggle) toggle.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
}

async function boot() {
  renderQuickList();
  renderNews(null);     // show the default straight away; the saved text loads below
  const newsBtn = $('news-edit');
  if (newsBtn) newsBtn.addEventListener('click', () => dialogs.openNews(currentNews || DEFAULT_NEWS, async (text) => {
    await backend.setNews(text);
    renderNews(text);
  }));
  setupSidebar();
  loader.show('Loading the HUB', 'assets/loading-invasion.jpg');
  const started = performance.now();
  try {
    const [logo, door] = await Promise.all([
      loadImage('assets/logo.png'),
      loadImage('assets/door.png').catch(() => null),
    ]);
    hub = startHub(logo, door);
  } catch (err) {
    console.error('3D interface failed to start', err);
    document.body.classList.add('no-webgl');
  }
  // Accounts load in the background so a sleeping server never blocks the page.
  dialogs.setHooks({ toast, gamesChanged: refreshGames, renamed: onRenamed, facesChanged, deleteFace: deleteFaceFlow, showsChanged, deleteShow: deleteShowFlow });
  backend.onAccountChange(() => { renderQuickList(); syncNewsEdit(); syncSidebarAccount(); if (hub) hub.rebuild(); if (lbOpen) renderBoardPage(); if (shopOpen) renderShop(); });
  backend.loadFaces().then(() => { if (hub) hub.rebuild(); syncSidebarAccount(); });   // resolve uploaded-face avatars
  backend.start().then(() => Promise.all([refreshGames(), refreshBoard(), backend.getNews().then(renderNews)])).then(() => {
    syncNewsEdit();
    const linked = gameFromHash();           // a share link to a HUB-added game
    if (linked && !playing) openGame(linked);
  });

  // Opt-in test seam (only when the page is opened with ?eehub-test): lets the
  // automated tests drive the 3D-canvas controls that have no DOM element.
  if (location.search.includes('eehub-test')) {
    window.__EEHUB = {
      setScope: (s) => { board.scope = s; if (hub) hub.rebuild(); },
      claimDaily: claimDailyFlow,
      refreshBoard,
      board: () => board,
      me: () => backend.me,
      openGame, closeGame,
      openLeaderboard, closeLeaderboard,
      setBoardScope: (s) => { board.scope = s; renderBoardPage(); },
      openShop, closeShop,
      shopItems: () => shopCatalog,
      shopAudio: () => ({ shopActive, shopPlaying: !shopSong.paused, musicPaused: music.paused }),
      openTheater, closeTheater, endIntro,
      shows: () => shows,
      theaterState: () => ({ theaterActive, musicPaused: music.paused }),
    };
  }

  await wait(Math.max(0, 1300 - (performance.now() - started)));
  const deepLink = gameFromHash();
  if (deepLink) {
    openGame(deepLink);
  } else {
    await loader.finish();
  }
}

boot();
