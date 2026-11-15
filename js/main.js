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
  },
  hideNow() {
    clearInterval(loaderTimer);
    $('loader').classList.add('hidden');
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

function syncMusic() {
  if (musicOn && !playing && !document.hidden) music.play().catch(() => {});
  else music.pause();
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
/* Game player (the games themselves are separate pages in an iframe)  */
/* ------------------------------------------------------------------ */

const frame = $('player-frame');
let playing = null;
let openToken = 0;
let blobUrl = null;

// Built-in games plus any added from inside the HUB.
let allGames = [...GAMES];

// Leaderboard data, loaded lazily. null = not fetched yet.
const board = { scope: 'week', week: null, all: null };

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

// Reload both leaderboards and redraw.
async function refreshBoard() {
  if (!backend.configured) return;
  try {
    const [week, all] = await Promise.all([backend.leaderboard('week'), backend.leaderboard('all')]);
    board.week = week; board.all = all;
  } catch (err) {
    console.error('Could not load the leaderboard', err);
    board.week = board.week || []; board.all = board.all || [];
  }
  if (hub) hub.rebuild();
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
  history.replaceState(null, '', '#play=' + game.id);
  document.title = game.title + ' — Epic Entertainment HUB';

  const loaded = new Promise((resolve) => {
    frame.addEventListener('load', resolve, { once: true });
  });
  if (game.fileUrl) {
    // An uploaded HTML file. It runs in a sandbox so it cannot touch the HUB
    // or anyone's account, whatever the file contains.
    frame.setAttribute('sandbox', 'allow-scripts allow-pointer-lock allow-forms allow-modals');
    try {
      const res = await fetch(game.fileUrl);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      if (token !== openToken) return;
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
    add(backend.me ? 'My account' : 'Sign in or sign up', openAccountOrAuth),
  );
}

function openAccountOrAuth(mode = 'in') {
  if (backend.me) dialogs.openAccount();
  else if (backend.configured) dialogs.openAuth(mode);
  else toast('Sign-ups are coming soon!');
}

// Reload the list of HUB-added games, apply play counts, sort most-played first.
async function refreshGames() {
  let added = [], counts = {};
  try { [added, counts] = await Promise.all([backend.listGames(), backend.listPlayCounts()]); } catch (err) { console.error('Could not load games', err); }
  allGames = [...GAMES, ...added];
  for (const g of allGames) g.plays = counts[g.id] || 0;
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

function startHub(logoImage) {
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

  let W = 0, H = 0, total = 0, maxScroll = 0;
  let scroll = 0, scrollTarget = 0;
  const anchors = { top: 0, games: 0, board: 0 };
  let interactives = [];
  let updaters = [];
  let hovered = null;
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

    let x = cw / 2;
    const addLink = (label, w, onClick, opts) => {
      const mesh = button(label, w, 32, opts);
      mesh.renderOrder = 102;
      mesh.position.set(x - w / 2, 0, 0);
      x -= w + 6;
      hud.add(mesh);
      interactive(mesh, 'hud', onClick, (on) => mesh.userData.setHover(on));
    };
    if (backend.me) {
      const name = backend.me.username;
      addLink(name.length > 11 ? name.slice(0, 10) + '…' : name, full ? 104 : 78, () => dialogs.openAccount());
    } else {
      addLink('Sign In', 78, () => openAccountOrAuth('in'));
    }
    addLink('Request', 96, () => window.open('https://forms.gle/7CSei8ZGthE4m54b8', '_blank', 'noopener'));
    if (W >= 480) addLink('Scores', 78, () => scrollTo(anchors.board));
    addLink('Games', 70, () => scrollTo(anchors.games));
    // Music switch: stays pressed in while the song is on.
    if (full) addLink(musicOn ? '♪ Music: On' : '♪ Music: Off', 112, toggleMusic, { down: musicOn });
    else addLink('♪', 34, toggleMusic, { down: musicOn, size: 17 });
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
        // Title-bar buttons for staff: ✎ edits, × removes a HUB-added game.
        if (game.removable && backend.isStaff() && hit && hit.uv) {
          const px = hit.uv.x * cardW, py = (1 - hit.uv.y) * cardH;
          if (py < 34) {
            if (px > cardW - 42) return removeGameFlow(game);
            if (px > cardW - 66) return dialogs.openEditGame(game);
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
    fitFont(g, game.title + '.exe', bw - 100, 14, SANS, 10, 'bold');
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
    const rows = board[board.scope];               // null until loaded
    const topN = wide ? 10 : 8;
    const shown = rows ? rows.slice(0, topN) : [];
    const myName = backend.me ? backend.me.username : null;

    // heading
    const head = panel(cw, 84, (g) => {
      g.textBaseline = 'alphabetic';
      g.font = `bold 34px ${COMIC}`;
      g.fillStyle = C.magenta; g.fillText('Leaderboard', 3, 39);
      g.fillStyle = C.yellow;  g.fillText('Leaderboard', 0, 36);
      g.font = `italic 18px ${TIMES}`;
      g.fillStyle = '#ffffff';
      g.fillText('Sign in and play to climb — XP for playing, diamonds for the shop!', 0, 68);
    });
    place(head, 0, y, 84); page.add(head);
    y += 84 + 14;

    // Weekly / All-time toggle
    const tw = 150, th = 40, tgap = 12;
    const weekBtn = button('This Week', tw, th, { down: board.scope === 'week', size: 15 });
    const allBtn = button('All-Time', tw, th, { down: board.scope === 'all', size: 15 });
    place(weekBtn, -(tw + tgap) / 2, y, th);
    place(allBtn, (tw + tgap) / 2, y, th);
    page.add(weekBtn, allBtn);
    interactive(weekBtn, 'page', () => { board.scope = 'week'; hub.rebuild(); }, (on) => weekBtn.userData.setHover(on));
    interactive(allBtn, 'page', () => { board.scope = 'all'; hub.rebuild(); }, (on) => allBtn.userData.setHover(on));
    y += th + 14;

    // the ranked list, as a Windows 95 window
    const rowH = 34;
    const listRows = shown.length || 2;
    const winH = 40 + listRows * rowH + 14;
    const lw = Math.min(cw, 720);
    const boardPanel = panel(lw, winH, (g, w, ph) => {
      bevel(g, 0, 0, w, ph);
      const bar = g.createLinearGradient(6, 0, w - 6, 0);
      bar.addColorStop(0, C.navy); bar.addColorStop(1, '#1084D0');
      g.fillStyle = bar; g.fillRect(6, 6, w - 12, 26);
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillStyle = '#fff'; g.font = `bold 14px ${SANS}`;
      g.fillText((board.scope === 'week' ? 'Weekly' : 'All-Time') + ' Top ' + topN + '.exe', 12, 20);

      const lx = 10, ly0 = 40, lwid = w - 20, lht = ph - ly0 - 10;
      bevel(g, lx, ly0, lwid, lht, { pressed: true, fill: '#fff' });
      g.textBaseline = 'middle';
      if (!rows || !shown.length) {
        g.fillStyle = '#555'; g.font = `italic 16px ${TIMES}`; g.textAlign = 'center';
        g.fillText(!rows ? 'Loading…' : 'No one yet — play a game to be first!', w / 2, ly0 + lht / 2);
        return;
      }
      const medal = ['#D4AF37', '#9AA4AF', '#CD7F32'];   // gold / silver / bronze
      shown.forEach((p, i) => {
        const ry = ly0 + 4 + i * rowH;
        const mine = p.username === myName;
        if (mine) { g.fillStyle = '#FFF6B0'; g.fillRect(lx + 3, ry, lwid - 6, rowH - 2); }
        g.textAlign = 'right';
        g.font = `bold 17px ${MONO}`;
        g.fillStyle = i < 3 ? medal[i] : '#666';
        g.fillText('#' + (i + 1), lx + 46, ry + rowH / 2);
        g.textAlign = 'left';
        g.font = `bold 17px ${TIMES}`;
        g.fillStyle = p.rank === 'owner' ? '#B8860B' : p.rank === 'admin' ? '#0000CC' : '#000';
        const name = p.username + (mine ? ' (you)' : '');
        g.fillText(name, lx + 58, ry + rowH / 2);
        const nameEnd = lx + 58 + g.measureText(name).width;
        const badge = p.rank === 'owner' ? '♔' : p.rank === 'admin' ? '★' : '';
        if (badge) { g.font = `15px ${TIMES}`; g.fillText(badge, nameEnd + 10, ry + rowH / 2 - 1); }
        g.textAlign = 'right';
        g.font = `bold 16px ${SANS}`;
        g.fillStyle = '#006400';
        g.fillText((p.score || 0).toLocaleString() + ' XP', lx + lwid - 12, ry + rowH / 2);
      });
    });
    place(boardPanel, 0, y, winH); page.add(boardPanel);
    y += winH + 14;

    // your stats + actions
    if (backend.configured && backend.me) {
      const me = backend.me;
      const myRows = rows || [];
      const pos = myRows.findIndex((p) => p.username === me.username);
      const scoreNow = board.scope === 'week' ? me.weeklyXp : me.xp;
      const stats = [
        pos >= 0 ? 'Rank #' + (pos + 1) : 'Unranked',
        scoreNow.toLocaleString() + ' XP',
        me.diamonds.toLocaleString() + ' diamonds',
        me.streak + ' day streak',
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
      if (!me.hasEmail) specs.push({ label: 'Add email to join the board', w: 240, down: true, act: () => dialogs.openAddEmail() });
      if (backend.isStaff()) specs.push({ label: '+ Add a game', w: 150, act: () => dialogs.openAddGame() });
      specs.push({ label: 'Members', w: 120, act: () => dialogs.openMembers() });
      y = buttonRow(specs, y, cw, wide);
    } else if (backend.configured) {
      y = buttonRow([{ label: 'Sign up to join the board!', w: 260, act: () => openAccountOrAuth('up') }], y, cw, wide);
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

    buildNav(cw, wide);
    hud.position.set(0, H / 2 - NAV_H / 2, 0);

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
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.nx = (e.clientX / W) * 2 - 1;
    pointer.ny = -((e.clientY / H) * 2 - 1);
    pointer.inside = true;
  }

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    setPointer(e);
    drag = { id: e.pointerId, y: e.clientY, start: scrollTarget, moved: 0, touch: e.pointerType !== 'mouse' };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    setPointer(e);
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
  canvas.addEventListener('pointercancel', () => { drag = null; pointer.inside = false; });
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
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !playing) { lastTime = 0; requestAnimationFrame(tick); }
  });

  build();
  requestAnimationFrame(tick);
  return { rebuild: build };
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

async function boot() {
  renderQuickList();
  loader.show('Loading the HUB', 'assets/loading-invasion.jpg');
  const started = performance.now();
  try {
    const [logo] = await Promise.all([
      loadImage('assets/logo.png'),
    ]);
    hub = startHub(logo);
  } catch (err) {
    console.error('3D interface failed to start', err);
    document.body.classList.add('no-webgl');
  }
  // Accounts load in the background so a sleeping server never blocks the page.
  dialogs.setHooks({ toast, gamesChanged: refreshGames });
  backend.onAccountChange(() => { renderQuickList(); if (hub) hub.rebuild(); });
  backend.start().then(() => Promise.all([refreshGames(), refreshBoard()])).then(() => {
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
