// Epic Entertainment HUB — the site interface, drawn in three.js.
//
// The page is laid out in "pixel units": the camera sits far enough back that
// one world unit at z = 0 equals one CSS pixel, so panels can be positioned
// like elements on a website while still tilting, floating and spinning in 3D.
// Text and artwork are painted onto 2D canvases and used as textures.

import * as THREE from '../vendor/three.module.min.js';
import { GAMES, RANKS } from './games.js';

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
/* Game player (the games themselves are separate pages in an iframe)  */
/* ------------------------------------------------------------------ */

const frame = $('player-frame');
let playing = null;
let openToken = 0;

async function openGame(game) {
  if (playing === game) return;
  const token = ++openToken;
  playing = game;
  loader.show('Loading ' + game.title, nextLoadingImage());
  $('player-title').textContent = game.title;
  $('player-open').href = game.url;
  frame.title = game.title;
  $('player').hidden = false;
  history.replaceState(null, '', '#play=' + game.id);
  document.title = game.title + ' — Epic Entertainment HUB';

  const loaded = new Promise((resolve) => {
    frame.addEventListener('load', resolve, { once: true });
  });
  frame.src = game.url;
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
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  frame.src = 'about:blank';
  $('player').hidden = true;
  loader.hideNow();
  history.replaceState(null, '', location.pathname + location.search);
  document.title = 'Epic Entertainment HUB';
  lastTime = 0;
  if (hub) requestAnimationFrame(tick);
}

function gameFromHash() {
  const m = /^#play=([\w-]+)$/.exec(location.hash);
  return m ? GAMES.find((g) => g.id === m[1]) : null;
}

$('player-back').addEventListener('click', closeGame);
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
for (const game of GAMES) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = 'Play ' + game.title;
  b.addEventListener('click', () => openGame(game));
  li.appendChild(b);
  $('quick-list').appendChild(li);
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
  const anchors = { top: 0, games: 0, community: 0 };
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
  function button(label, w, h, { size = 14 } = {}) {
    const draw = (hover) => (g) => {
      bevel(g, 0, 0, w, h, { pressed: hover });
      fitFont(g, label, w - 16, size, SANS, 10, 'bold');
      g.fillStyle = C.ink;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const off = hover ? 1 : 0;
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
    const addLink = (label, w, onClick) => {
      const mesh = button(label, w, 32);
      mesh.renderOrder = 102;
      mesh.position.set(x - w / 2, 0, 0);
      x -= w + 6;
      hud.add(mesh);
      interactive(mesh, 'hud', onClick, (on) => mesh.userData.setHover(on));
    };
    addLink('Sign In', 78, () => toast('Sign-ins are coming soon!'));
    if (W >= 480) addLink('Community', 96, () => scrollTo(anchors.community));
    addLink('Games', 70, () => scrollTo(anchors.games));
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
      const lines = wrapLines(g, 'Every Sefreneth game in one place! Pick one and play it right here. Profiles, ranks and community-made games are coming soon.', Math.min(w, 560), 4);
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
    const message = `*** WELCOME TO EPIC ENTERTAINMENT HUB ***  ${GAMES.length} GAMES ONLINE  ***  SIGN-INS COMING SOON  ***  THANKS FOR STOPPING BY!  `;
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
      g.fillText(`(${GAMES.length})`, tw + 12, 36);
      g.font = `italic 18px ${TIMES}`;
      g.fillStyle = '#ffffff';
      g.fillText('Embedded right here - pick one and go!', 0, 68);
    });
    place(head, 0, y, 84);
    page.add(head);
    y += 84 + 22;

    const gap = 30;
    const cardW = Math.min(336, cw);
    const cardH = 424;
    const cols = clamp(Math.floor((cw + gap) / (cardW + gap)), 1, 3);
    const rowW = (n) => n * cardW + (n - 1) * gap;

    GAMES.forEach((game, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const inRow = Math.min(cols, GAMES.length - row * cols);
      const x0 = cols > 1 && cw >= rowW(cols) ? -cw / 2 : -rowW(inRow) / 2;
      const stretch = cols > 1 ? (cw - rowW(cols)) / (cols - 1) : 0;
      const cx = x0 + cardW / 2 + col * (cardW + gap + stretch);
      const top = y + row * (cardH + gap);

      const draw = (hover) => (g, w, h) => drawCard(g, w, h, game, hover);
      const card = panel(cardW, cardH, draw(false));
      place(card, cx, top, cardH);
      page.add(card);

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
      interactive(card, 'page', () => openGame(game), (on, hit) => {
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
    const rows = Math.ceil(GAMES.length / cols);
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
    ['_', '□', '×'].forEach((glyph, i) => {
      const bx = bw - 10 - (3 - i) * 22 + (i === 2 ? 2 : 0), by = 9;
      bevel(g, bx, by, 20, 20, { t: 1 });
      g.fillStyle = C.ink;
      g.font = `bold 13px ${SANS}`;
      g.textAlign = 'center';
      g.fillText(glyph, bx + 10, by + (glyph === '_' ? 7 : 11));
    });

    // artwork in a sunken frame, drawn chunky like an old GIF
    const ax = 12, ay = 40, aw = bw - 24;
    bevel(g, ax, ay, aw, artH, { pressed: true, fill: '#000' });
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

    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = C.ink;
    fitFont(g, game.title, bw - 32, 27, TIMES, 16, 'bold');
    g.fillText(game.title, 16, ay + artH + 36);

    g.font = `17px ${TIMES}`;
    const lines = wrapLines(g, game.description || '', bw - 32, 3);
    drawLines(g, lines, 16, ay + artH + 62, 21);

    // tags, styled as old-school links
    let tx = 16;
    const ty = ay + artH + 134;
    g.font = `15px ${TIMES}`;
    for (const tag of (game.tags || []).slice(0, 3)) {
      const tw = g.measureText(tag).width;
      if (tx + tw > bw - 16) break;
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

  function buildCommunity(y, cw, wide) {
    const pad = wide ? 30 : 18;
    const cellH = 84;
    const h = wide ? 296 : 260 + RANKS.length * (cellH + 8);
    const box = panel(cw, h, (g, w, ph) => {
      // ridge-bordered table
      bevel(g, 0, 0, w, ph, { t: 3 });
      g.fillStyle = C.navy;
      g.fillRect(8, 8, w - 16, ph - 16);

      // hazard tape
      const tapeH = 34;
      g.save();
      g.beginPath();
      g.rect(8, 8, w - 16, tapeH);
      g.clip();
      g.fillStyle = C.yellow;
      g.fillRect(8, 8, w - 16, tapeH);
      g.fillStyle = C.ink;
      for (let x = -tapeH; x < w; x += 36) {
        g.beginPath();
        g.moveTo(x, 8 + tapeH);
        g.lineTo(x + 18, 8 + tapeH);
        g.lineTo(x + 18 + tapeH, 8);
        g.lineTo(x + tapeH, 8);
        g.closePath();
        g.fill();
      }
      g.restore();
      g.font = `bold 15px ${SANS}`;
      const uc = 'UNDER CONSTRUCTION';
      const ucW = g.measureText(uc).width + 24;
      g.fillStyle = C.ink;
      g.fillRect(w / 2 - ucW / 2, 12, ucW, tapeH - 8);
      g.fillStyle = C.yellow;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(uc, w / 2, 8 + tapeH / 2 + 1);

      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      const top = 8 + tapeH;
      g.font = `bold 30px ${COMIC}`;
      g.fillStyle = C.yellow;
      g.fillText('Community', pad, top + 44);
      g.font = `18px ${TIMES}`;
      g.fillStyle = '#ffffff';
      const lines = wrapLines(g, 'Sign-ins are on the way! Once they land you get a profile and a rank, and Owners and Admins can add HTML games straight into the HUB.', Math.min(w - pad * 2, 720), 5);
      const endY = drawLines(g, lines, pad, top + 76, 24);

      const n = RANKS.length;
      const gap = 10;
      RANKS.forEach((rank, i) => {
        let bx, by, bwid;
        if (wide) {
          bwid = (w - pad * 2 - gap * (n - 1)) / n;
          bx = pad + i * (bwid + gap);
          by = ph - pad - cellH;
        } else {
          bwid = w - pad * 2;
          bx = pad;
          by = endY - 4 + i * (cellH + 8);
        }
        bevel(g, bx, by, bwid, cellH);
        g.fillStyle = rank.color;
        g.font = `bold 21px ${TIMES}`;
        g.fillText(rank.title, bx + 14, by + 32);
        g.font = `16px ${TIMES}`;
        g.fillStyle = C.ink;
        drawLines(g, wrapLines(g, rank.blurb, bwid - 28, 2), bx + 14, by + 54, 18);
      });
    });
    place(box, 0, y, h);
    page.add(box);
    return y + h;
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

    W = innerWidth;
    H = innerHeight;
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
    anchors.community = y - NAV_H - 24;
    y = buildCommunity(y, cw, wide);
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
    if (playing || e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
    const step = { ArrowDown: 80, ArrowUp: -80, PageDown: H * 0.85, PageUp: -H * 0.85, ' ': H * 0.85 }[e.key];
    if (step !== undefined) { e.preventDefault(); scrollTo(scrollTarget + step); }
    else if (e.key === 'Home') scrollTo(0);
    else if (e.key === 'End') scrollTo(maxScroll);
  });

  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 120);
  });

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
  await wait(Math.max(0, 1300 - (performance.now() - started)));
  const deepLink = gameFromHash();
  if (deepLink) {
    openGame(deepLink);
  } else {
    await loader.finish();
  }
}

boot();
