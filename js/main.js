// Epic Entertainment HUB — the site interface, drawn in three.js.
//
// The page is laid out in "pixel units": the camera sits far enough back that
// one world unit at z = 0 equals one CSS pixel, so panels can be positioned
// like elements on a website while still tilting, floating and spinning in 3D.
// Text and artwork are painted onto 2D canvases and used as textures.

import * as THREE from '../vendor/three.module.min.js';
import { GAMES, RANKS } from './games.js';

const C = {
  bg: '#16070f',
  yellow: '#FDDC5C',
  maroon: '#861B42',
  pink: '#F8BBD9',
  cream: '#FFF7DC',
  ink: '#000000',
};
const DISPLAY = '"Archivo Black", "Arial Black", Impact, system-ui, sans-serif';
const BODY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FOV = 40;
const NAV_H = 64;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Loading screen                                                      */
/* ------------------------------------------------------------------ */

const LOADING_IMAGES = ['assets/loading-stonks.jpg', 'assets/loading-invasion.jpg'];
const TIPS = [
  'Stonks only go up.',
  'What the heck is happening?',
  'Polishing the awesome…',
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

// The house style: flat fill, thick black outline, hard offset shadow.
function slab(g, x, y, w, h, { fill, r = 14, line = 4, shadow = 7, shadowColor = C.ink, stroke = C.ink }) {
  if (shadow) {
    rr(g, x + shadow, y + shadow, w, h, r);
    g.fillStyle = shadowColor;
    g.fill();
  }
  rr(g, x + line / 2, y + line / 2, w - line, h - line, r - line / 2);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = line;
  g.strokeStyle = stroke;
  g.stroke();
}

function spacing(g, px) {
  if ('letterSpacing' in g) g.letterSpacing = px + 'px';
}

// Largest font size (<= max) at which `text` fits in `width`.
function fitFont(g, text, width, max, family, min = 12) {
  let size = max;
  for (; size > min; size -= 1) {
    g.font = `${size}px ${family}`;
    if (g.measureText(text).width <= width) break;
  }
  g.font = `${size}px ${family}`;
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
  g.font = `${h * 0.7}px ${DISPLAY}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = C.ink;
  g.fillStyle = C.cream;
  const letter = (game.title || '?').charAt(0).toUpperCase();
  g.strokeText(letter, w / 2, h / 2);
  g.fillText(letter, w / 2, h / 2);
}

const ART = { taco: artTaco, blocks: artBlocks, dice: artDice };

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

  function button(label, w, h, { fill = C.yellow, color = C.ink, hoverFill = C.pink, size = 18 } = {}) {
    const draw = (hover) => (g) => {
      const off = hover ? 3 : 0;
      slab(g, off, off, w - 6, h - 6, { fill: hover ? hoverFill : fill, r: 12, line: 3, shadow: 6 - off });
      fitFont(g, label, w - 34, size, DISPLAY);
      g.fillStyle = color;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, off + (w - 6) / 2, off + (h - 6) / 2 + 1);
    };
    const mesh = panel(w, h, draw(false));
    mesh.userData.setHover = (on) => mesh.userData.redraw(draw(on));
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
    const bar = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 3, NAV_H),
      new THREE.MeshBasicMaterial({ color: C.bg, transparent: true, opacity: 0.92, depthTest: false }),
    );
    bar.renderOrder = 100;
    const rule = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 3, 3),
      new THREE.MeshBasicMaterial({ color: C.yellow, depthTest: false }),
    );
    rule.renderOrder = 101;
    rule.position.y = -NAV_H / 2;
    hud.add(bar, rule);

    const left = -cw / 2;
    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, depthTest: false }),
    );
    logo.renderOrder = 102;
    logo.position.set(left + 20, 0, 0);
    hud.add(logo);

    const brandText = W >= 620 ? 'EPIC ENTERTAINMENT HUB' : 'EE HUB';
    const bw = W >= 620 ? 300 : 96;
    const brand = panel(bw, 40, (g, w, h) => {
      g.font = `19px ${DISPLAY}`;
      g.textBaseline = 'middle';
      const split = brandText.lastIndexOf(' ');
      const head = brandText.slice(0, split + 1);
      g.fillStyle = '#fff';
      g.fillText(head, 0, h / 2 + 1);
      g.fillStyle = C.yellow;
      g.fillText('HUB', g.measureText(head).width, h / 2 + 1);
    }, 102);
    brand.position.set(left + 52 + bw / 2, 0, 0);
    hud.add(brand);
    // The logo + name act as the "home" link.
    const home = new THREE.Mesh(
      new THREE.PlaneGeometry(52 + bw, 48),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    home.position.set(left + (52 + bw) / 2, 0, 0);
    hud.add(home);
    interactive(home, 'hud', () => scrollTo(anchors.top));

    let x = cw / 2;
    const addLink = (mesh, w, onClick) => {
      mesh.renderOrder = 102;
      mesh.position.set(x - w / 2, -1, 0);
      x -= w + (wide ? 14 : 8);
      hud.add(mesh);
      interactive(mesh, 'hud', onClick, (on) => mesh.userData.setHover(on));
    };
    const textLink = (label, w, onClick) => {
      const draw = (hover) => (g, pw, ph) => {
        g.font = `15px ${DISPLAY}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = hover ? C.yellow : '#fff';
        g.fillText(label, pw / 2, ph / 2 + 1);
        if (hover) g.fillRect(pw / 2 - 16, ph - 8, 32, 3);
      };
      const mesh = panel(w, 40, draw(false));
      mesh.userData.setHover = (on) => mesh.userData.redraw(draw(on));
      addLink(mesh, w, onClick);
    };
    addLink(button('SIGN IN', 104, 44, { size: 14 }), 104,
      () => toast('Sign-ins are coming soon'));
    if (W >= 480) textLink('COMMUNITY', 118, () => scrollTo(anchors.community));
    textLink('GAMES', 72, () => scrollTo(anchors.games));
  }

  function buildHero(y, cw, wide) {
    const heroH = wide ? clamp(H * 0.74, 470, 640) : 0;
    const R = wide ? clamp(cw * 0.15, 110, 165) : 92;

    // The logo, as a chunky spinning coin.
    const coin = new THREE.Group();
    const faceMat = new THREE.MeshBasicMaterial({ map: logoTex });
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, R * 0.16, 72), [edgeMat, faceMat, faceMat]);
    disc.rotation.x = Math.PI / 2;
    disc.rotation.y = Math.PI / 2;
    coin.add(disc);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(R, 72),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }),
    );

    let tw, th, textCx, textTop, coinX, coinY, align;
    if (wide) {
      tw = cw - (2 * R + 90);
      th = 300;
      align = 'left';
      const blockH = th + 70;
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
    shadow.position.set(coinX + 14, coinY - 14, -60);
    page.add(shadow, coin);

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
      toast('Awesome.');
    });

    const text = panel(tw, th, (g, w) => {
      const ax = align === 'left' ? 0 : w / 2;
      g.textAlign = align;
      g.textBaseline = 'alphabetic';

      const label = 'A BRANCH OF EPIC ENTERTAINMENT LLC';
      spacing(g, wide ? 3 : 1.5);
      for (let px = 13; px >= 9; px--) {
        g.font = `700 ${px}px ${BODY}`;
        if (g.measureText(label).width <= w - 4) break;
      }
      g.fillStyle = C.pink;
      g.fillText(label, ax, 18);
      spacing(g, 0);

      const size = fitFont(g, 'EPIC ENTERTAINMENT', w - 6, 68, DISPLAY, 22);
      let by = 34 + size;
      g.lineJoin = 'round';
      g.lineWidth = Math.max(6, size * 0.16);
      g.strokeStyle = C.ink;
      g.strokeText('EPIC ENTERTAINMENT', ax, by);
      g.fillStyle = '#fff';
      g.fillText('EPIC ENTERTAINMENT', ax, by);

      // Second row: "LLC" struck out, then the HUB badge.
      const row = clamp(size * 1.05, 46, 70);
      g.font = `${row * 0.62}px ${DISPLAY}`;
      const llcW = g.measureText('LLC').width;
      g.font = `${row * 0.8}px ${DISPLAY}`;
      const hubW = g.measureText('HUB').width + row * 0.6;
      const rowW = llcW + 18 + hubW + 7;
      let x = align === 'left' ? 0 : (w - rowW) / 2;
      const top = by + 22;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.font = `${row * 0.62}px ${DISPLAY}`;
      g.fillStyle = 'rgba(255,255,255,.45)';
      g.fillText('LLC', x, top + row / 2 + 2);
      g.fillStyle = C.pink;
      g.fillRect(x - 4, top + row / 2 - 2, llcW + 8, 5);
      x += llcW + 18;
      slab(g, x, top, hubW, row, { fill: C.yellow, r: 12, line: 4, shadow: 6 });
      g.font = `${row * 0.8}px ${DISPLAY}`;
      g.fillStyle = C.ink;
      g.textAlign = 'center';
      g.fillText('HUB', x + hubW / 2, top + row / 2 + 3);

      g.textAlign = align;
      g.textBaseline = 'alphabetic';
      g.font = `18px ${BODY}`;
      g.fillStyle = '#f1dfe7';
      const lines = wrapLines(g, 'Every Sefreneth game in one place. Pick one, play it right here, and stick around — profiles, ranks and community-made games are on the way.', Math.min(w, 560), 4);
      drawLines(g, lines, ax, top + row + 44, 26);
    });
    place(text, textCx, textTop, th);
    page.add(text);

    const cta = button('PLAY THE GAMES', 236, 60, { size: 19 });
    const ctaTop = textTop + th + 10;
    place(cta, wide ? textCx - tw / 2 + 118 : 0, ctaTop, 60);
    page.add(cta);
    interactive(cta, 'page', () => scrollTo(anchors.games), (on) => cta.userData.setHover(on));

    return wide ? y + heroH : ctaTop + 60 + 48;
  }

  function buildGames(y, cw) {
    const head = panel(cw, 84, (g) => {
      g.textBaseline = 'alphabetic';
      g.font = `34px ${DISPLAY}`;
      g.fillStyle = '#fff';
      g.fillText('PLAYABLE GAMES', 0, 36);
      const tw = g.measureText('PLAYABLE GAMES').width;
      slab(g, tw + 14, 6, 48, 36, { fill: C.yellow, r: 10, line: 3, shadow: 4 });
      g.font = `20px ${DISPLAY}`;
      g.fillStyle = C.ink;
      g.textAlign = 'center';
      g.fillText(String(GAMES.length), tw + 14 + 22, 31);
      g.textAlign = 'left';
      g.font = `16px ${BODY}`;
      g.fillStyle = C.pink;
      g.fillText('Embedded right here — pick one and go.', 0, 68);
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

  function drawCard(g, w, h, game, hover) {
    const bw = w - 10, bh = h - 10, artH = 178;
    slab(g, 0, 0, bw, bh, { fill: C.cream, r: 18, line: 5, shadow: 9, shadowColor: hover ? C.yellow : C.ink });

    // artwork, clipped to the card's rounded top
    g.save();
    g.beginPath();
    g.moveTo(5, artH + 5);
    g.lineTo(5, 18);
    g.arcTo(5, 5, 18, 5, 13);
    g.lineTo(bw - 18, 5);
    g.arcTo(bw - 5, 5, bw - 5, 18, 13);
    g.lineTo(bw - 5, artH + 5);
    g.closePath();
    g.clip();
    g.translate(5, 5);
    (ART[game.art] || artFallback)(g, bw - 10, artH, game);
    g.restore();
    g.fillStyle = C.ink;
    g.fillRect(3, artH + 3, bw - 6, 5);

    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = C.ink;
    fitFont(g, game.title, bw - 40, 27, DISPLAY, 16);
    g.fillText(game.title, 20, artH + 46);

    g.font = `15px ${BODY}`;
    g.fillStyle = '#3d2630';
    const lines = wrapLines(g, game.description || '', bw - 40, 3);
    drawLines(g, lines, 20, artH + 72, 21);

    // tags
    let tx = 20;
    const ty = artH + 136;
    g.font = `700 12px ${BODY}`;
    g.textBaseline = 'middle';
    for (const tag of (game.tags || []).slice(0, 3)) {
      const tw = g.measureText(tag).width + 20;
      if (tx + tw > bw - 20) break;
      rr(g, tx, ty, tw, 24, 12);
      g.fillStyle = '#fff';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = C.ink;
      g.stroke();
      g.fillStyle = C.ink;
      g.fillText(tag, tx + 10, ty + 13);
      tx += tw + 7;
    }

    // play button
    const bx = 20, by = bh - 70, bwid = bw - 40, bhgt = 50;
    slab(g, bx, by, bwid, bhgt, { fill: hover ? C.maroon : C.yellow, r: 12, line: 3, shadow: hover ? 0 : 5 });
    g.fillStyle = hover ? '#fff' : C.ink;
    g.font = `20px ${DISPLAY}`;
    g.textAlign = 'center';
    const label = 'PLAY';
    const lw = g.measureText(label).width;
    g.fillText(label, bx + bwid / 2 - 12, by + bhgt / 2 + 2);
    g.beginPath();
    const px = bx + bwid / 2 + lw / 2 - 2, py = by + bhgt / 2;
    g.moveTo(px, py - 9);
    g.lineTo(px + 15, py);
    g.lineTo(px, py + 9);
    g.closePath();
    g.fill();
  }

  function buildCommunity(y, cw, wide) {
    const pad = wide ? 34 : 22;
    const badgeH = 92;
    const h = wide ? 316 : 232 + RANKS.length * (badgeH + 12);
    const box = panel(cw, h, (g, w, ph) => {
      const bw = w - 10, bh = ph - 10;
      slab(g, 0, 0, bw, bh, { fill: C.maroon, r: 20, line: 5, shadow: 9 });
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
      const size = fitFont(g, 'COMMUNITY', bw - pad * 2, 32, DISPLAY);
      g.fillStyle = '#fff';
      g.fillText('COMMUNITY', pad, pad + size);
      const tw = g.measureText('COMMUNITY').width;
      g.font = `13px ${DISPLAY}`;
      const chip = 'COMING SOON';
      const cwid = g.measureText(chip).width + 22;
      let chipX = pad + tw + 14, chipY = pad + size - 26;
      if (chipX + cwid > bw - pad) { chipX = pad; chipY = pad + size + 10; }
      slab(g, chipX, chipY, cwid, 28, { fill: C.pink, r: 9, line: 3, shadow: 3 });
      g.fillStyle = C.ink;
      g.textBaseline = 'middle';
      g.fillText(chip, chipX + 11, chipY + 15);

      g.textBaseline = 'alphabetic';
      g.font = `17px ${BODY}`;
      g.fillStyle = '#fbe9f0';
      const textTop = (chipX === pad ? chipY + 62 : pad + size + 36);
      const lines = wrapLines(g, 'Sign-ins are on the way. Once they land you get a profile and a rank, and Owners and Admins can add HTML games straight into the HUB.', Math.min(bw - pad * 2, 720), 5);
      const endY = drawLines(g, lines, pad, textTop, 25);

      const n = RANKS.length;
      const gap = 16;
      RANKS.forEach((rank, i) => {
        let bx, by, bwid;
        if (wide) {
          bwid = (bw - pad * 2 - gap * (n - 1)) / n;
          bx = pad + i * (bwid + gap);
          by = bh - pad - badgeH;
        } else {
          bwid = bw - pad * 2;
          bx = pad;
          by = endY + 2 + i * (badgeH + 12);
        }
        slab(g, bx, by, bwid - 5, badgeH - 5, { fill: rank.color, r: 14, line: 4, shadow: 5 });
        g.fillStyle = C.ink;
        g.font = `19px ${DISPLAY}`;
        g.fillText(rank.title.toUpperCase(), bx + 16, by + 34);
        g.font = `14px ${BODY}`;
        g.fillStyle = '#2c1a21';
        drawLines(g, wrapLines(g, rank.blurb, bwid - 38, 2), bx + 16, by + 56, 18);
      });
    });
    place(box, 0, y, h);
    page.add(box);
    return y + h;
  }

  function buildFooter(y, cw) {
    const foot = panel(cw, 60, (g, w) => {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `14px ${BODY}`;
      g.fillStyle = 'rgba(248,187,217,.75)';
      const lines = wrapLines(g, 'Epic Entertainment HUB · a branch of Epic Entertainment LLC · made by Sefreneth', w - 8, 3);
      drawLines(g, lines, w / 2, 30 - (lines.length - 1) * 10, 20);
    });
    place(foot, 0, y, 60);
    page.add(foot);
    return y + 60;
  }

  function buildBackground() {
    // Confetti of square "pixels" behind the page; depth gives free parallax.
    const count = Math.round(clamp((W * (total + H)) / 9000, 120, 520));
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const palette = [C.yellow, C.pink, C.maroon, '#ffffff'].map((c) => new THREE.Color(c));
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
      size: 9, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.55,
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
      const color = [C.maroon, C.yellow, C.pink][i % 3];
      const mesh = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color, transparent: true, opacity: color === C.maroon ? 0.6 : 0.3,
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
    anchors.games = y - NAV_H - 18;
    y = buildGames(y, cw);
    y += 72;
    anchors.community = y - NAV_H - 24;
    y = buildCommunity(y, cw, wide);
    y += 24;
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
      document.fonts ? document.fonts.load(`20px "Archivo Black"`).catch(() => {}) : null,
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
