// Epicbox — a simple 3D game maker, Epic Entertainment style.
//
// Build in a 3D space by picking an asset and clicking to place it on a grid
// (no code, no Lua), then hit Playtest to walk, run and jump through what you
// made. Collect coins, dodge hazards, reach the goal.
//
// This file is the editor + playtest engine. Publishing, the game browser and
// the avatar shop are layered on in later milestones.

import * as THREE from '../vendor/three.module.min.js';

const GRID = 22;                 // build area is GRID x GRID cells
const HALF = GRID / 2;
const MAXY = 12;                 // how high you can stack
const $ = (id) => document.getElementById(id);
const key = (x, y, z) => x + ',' + y + ',' + z;

/* ------------------------------------------------------------------ */
/* Textures (chunky, retro)                                            */
/* ------------------------------------------------------------------ */

function tile(draw) {
  const s = 32;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  draw(g, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function noise(g, s, base, spots, a, b) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < spots; i++) {
    g.fillStyle = Math.random() < 0.5 ? a : b;
    g.fillRect((Math.random() * s) | 0, (Math.random() * s) | 0, 2, 2);
  }
}
const TEX = {
  grass: tile((g, s) => { noise(g, s, '#4a9b3a', 40, '#57b043', '#3d8a30'); g.fillStyle = '#6cc24a'; g.fillRect(0, 0, s, 6); }),
  dirt: tile((g, s) => noise(g, s, '#8a5a2b', 50, '#7a4d22', '#9a6a38')),
  stone: tile((g, s) => noise(g, s, '#8f8f97', 50, '#7d7d85', '#a2a2aa')),
  brick: tile((g, s) => { g.fillStyle = '#b5523a'; g.fillRect(0, 0, s, s); g.strokeStyle = '#7a3526'; g.lineWidth = 2; for (let y = 0; y < s; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); const off = (y / 8) % 2 ? 8 : 0; for (let x = off; x < s; x += 16) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke(); } } }),
  wood: tile((g, s) => { g.fillStyle = '#a9743f'; g.fillRect(0, 0, s, s); g.strokeStyle = '#8a5c30'; g.lineWidth = 1; for (let x = 3; x < s; x += 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); } }),
  sand: tile((g, s) => noise(g, s, '#e6d08a', 40, '#dcc477', '#efe0a3')),
  ice: tile((g, s) => { g.fillStyle = '#aee3f5'; g.fillRect(0, 0, s, s); g.strokeStyle = '#d6f2fb'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 20); g.lineTo(20, 0); g.moveTo(10, s); g.lineTo(s, 10); g.stroke(); }),
  metal: tile((g, s) => { noise(g, s, '#9aa4b0', 20, '#8a95a2', '#b4bcc6'); g.strokeStyle = '#6f7883'; g.strokeRect(1, 1, s - 2, s - 2); g.fillStyle = '#6f7883'; [[5, 5], [27, 5], [5, 27], [27, 27]].forEach(([x, y]) => g.fillRect(x, y, 3, 3)); }),
};

/* ------------------------------------------------------------------ */
/* Asset palette                                                       */
/* ------------------------------------------------------------------ */

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
function blockMat(tex) { return new THREE.MeshLambertMaterial({ map: tex }); }

// kind: 'block' solid; 'bounce' solid + launches; 'coin'/'hazard'/'goal' triggers;
// 'deco' non-solid; 'start' spawn marker.
const ASSETS = {
  grass: { label: 'Grass', group: 'Blocks', kind: 'block', make: () => new THREE.Mesh(boxGeo, blockMat(TEX.grass)) },
  dirt: { label: 'Dirt', group: 'Blocks', kind: 'block', make: () => new THREE.Mesh(boxGeo, blockMat(TEX.dirt)) },
  stone: { label: 'Stone', group: 'Blocks', kind: 'block', make: () => new THREE.Mesh(boxGeo, blockMat(TEX.stone)) },
  brick: { label: 'Brick', group: 'Blocks', kind: 'block', make: () => new THREE.Mesh(boxGeo, blockMat(TEX.brick)) },
  wood: { label: 'Wood', group: 'Blocks', kind: 'block', make: () => new THREE.Mesh(boxGeo, blockMat(TEX.wood)) },
  sand: { label: 'Sand', group: 'Blocks', kind: 'block', make: () => new THREE.Mesh(boxGeo, blockMat(TEX.sand)) },
  ice: { label: 'Ice', group: 'Blocks', kind: 'block', make: () => new THREE.Mesh(boxGeo, blockMat(TEX.ice)) },
  metal: { label: 'Metal', group: 'Blocks', kind: 'block', make: () => new THREE.Mesh(boxGeo, blockMat(TEX.metal)) },

  coin: { label: 'Coin', group: 'Objects', kind: 'coin', spin: true, make: makeCoin },
  spike: { label: 'Spikes', group: 'Objects', kind: 'hazard', make: makeSpike },
  bounce: { label: 'Bouncer', group: 'Objects', kind: 'bounce', make: makeBounce },
  tree: { label: 'Tree', group: 'Objects', kind: 'deco', make: makeTree },
  start: { label: 'Start', group: 'Markers', kind: 'start', unique: true, make: () => makePad(0x2ecc71) },
  goal: { label: 'Goal', group: 'Markers', kind: 'goal', unique: true, make: makeGoal },
};

function makeCoin() {
  const g = new THREE.Group();
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 16), new THREE.MeshLambertMaterial({ color: 0xffd34d, emissive: 0x4a3600 }));
  coin.rotation.z = Math.PI / 2;
  coin.position.y = 0.5;
  g.add(coin);
  return g;
}
function makeSpike() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xcfd2d6 });
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 4), mat);
    s.position.set(((i % 2) - 0.5) * 0.4, 0.25, (((i / 2) | 0) - 0.5) * 0.4);
    g.add(s);
  }
  return g;
}
function makeBounce() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), new THREE.MeshLambertMaterial({ color: 0x3a3a44 })));
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 16), new THREE.MeshLambertMaterial({ color: 0xff2d7a, emissive: 0x3a0016 }));
  top.position.y = 0.3;
  g.add(top);
  g.children[0].position.y = -0.05;
  return g;
}
function makeTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.7, 7), new THREE.MeshLambertMaterial({ color: 0x8a5a2b }));
  trunk.position.y = 0.35;
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshLambertMaterial({ color: 0x3fae4a, flatShading: true }));
  leaves.position.y = 1;
  g.add(trunk, leaves);
  return g;
}
function makePad(color) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.12, 20), new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.18) }));
  pad.position.y = 0.06;
  g.add(pad);
  return g;
}
function makeGoal() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
  pole.position.y = 0.8;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshLambertMaterial({ color: 0xffd400, side: THREE.DoubleSide }));
  flag.position.set(0.33, 1.3, 0);
  g.add(pole, flag, makePad(0xffd400).children[0]);
  return g;
}

const SOLID = new Set(['block', 'bounce']);

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd0ff);
scene.fog = new THREE.Fog(0x8fd0ff, 30, 70);

const hemi = new THREE.HemisphereLight(0xffffff, 0x6b7a5a, 0.95);
const sun = new THREE.DirectionalLight(0xfff2d6, 0.75);
sun.position.set(12, 22, 8);
scene.add(hemi, sun);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

// ground
const groundMat = new THREE.MeshLambertMaterial({ color: 0x6ab04c });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(GRID, GRID), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, 0, 0);
scene.add(ground);
const gridHelper = new THREE.GridHelper(GRID, GRID, 0x2f6b24, 0x3f7d31);
gridHelper.position.y = 0.01;
scene.add(gridHelper);
// invisible plane for raycasting the ground at y=0
const rayGround = new THREE.Mesh(new THREE.PlaneGeometry(GRID, GRID), new THREE.MeshBasicMaterial({ visible: false }));
rayGround.rotation.x = -Math.PI / 2;
scene.add(rayGround);

const worldGroup = new THREE.Group();   // placed cells live here
scene.add(worldGroup);

/* ------------------------------------------------------------------ */
/* Level data                                                          */
/* ------------------------------------------------------------------ */

const cells = new Map();   // key -> { type, kind, x, y, z, mesh }
let spawn = null;          // {x,y,z}
let goalCell = null;

function inBounds(x, z) { return x >= -HALF && x < HALF && z >= -HALF && z < HALF; }

function placeCell(type, x, y, z) {
  const def = ASSETS[type];
  if (!def || !inBounds(x, z) || y < 0 || y >= MAXY) return;
  if (def.unique) {
    // only one start / one goal
    for (const [k, c] of cells) if (c.type === type) removeKey(k);
    if (type === 'start') spawn = { x, y, z };
    if (type === 'goal') goalCell = { x, y, z };
  }
  const k = key(x, y, z);
  if (cells.has(k)) removeKey(k);
  const mesh = def.make();
  mesh.position.set(x + 0.5, y, z + 0.5);
  worldGroup.add(mesh);
  cells.set(k, { type, kind: def.kind, x, y, z, mesh, spin: def.spin });
}

function removeKey(k) {
  const c = cells.get(k);
  if (!c) return;
  worldGroup.remove(c.mesh);
  if (c.type === 'start') spawn = null;
  if (c.type === 'goal') goalCell = null;
  cells.delete(k);
}

function clearAll() {
  for (const k of [...cells.keys()]) removeKey(k);
  spawn = null; goalCell = null;
}

// A small starter floor so the editor isn't an empty void.
function starterFloor() {
  for (let x = -4; x < 4; x++) for (let z = -4; z < 4; z++) placeCell('grass', x, 0, z);
  placeCell('start', -3, 1, -3);
  placeCell('goal', 3, 1, 3);
  placeCell('coin', 0, 1, 0);
}

/* ------------------------------------------------------------------ */
/* Editor camera (orbit)                                               */
/* ------------------------------------------------------------------ */

const orbit = { target: new THREE.Vector3(0, 1, 0), dist: 24, az: Math.PI * 0.25, pol: Math.PI * 0.32 };
function applyOrbit() {
  const sp = Math.sin(orbit.pol), cp = Math.cos(orbit.pol);
  camera.position.set(
    orbit.target.x + orbit.dist * sp * Math.sin(orbit.az),
    orbit.target.y + orbit.dist * cp,
    orbit.target.z + orbit.dist * sp * Math.cos(orbit.az),
  );
  camera.lookAt(orbit.target);
}

/* ------------------------------------------------------------------ */
/* Tools + ghost preview                                               */
/* ------------------------------------------------------------------ */

let tool = 'grass';        // selected asset id, or 'erase'
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

const ghost = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
ghost.visible = false;
scene.add(ghost);

// Work out which cell the pointer is targeting, and whether we'd place or erase.
function pickCell(clientX, clientY) {
  ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const meshes = [rayGround, ...[...cells.values()].map((c) => c.mesh)];
  const hits = raycaster.intersectObjects(meshes, true);
  if (!hits.length) return null;
  const hit = hits[0];
  // find the owning cell (hit.object may be a child of a group)
  let owner = null;
  for (const c of cells.values()) { if (c.mesh === hit.object || c.mesh.children.includes(hit.object) || isDescendant(hit.object, c.mesh)) { owner = c; break; } }
  if (hit.object === rayGround) {
    const x = Math.floor(hit.point.x), z = Math.floor(hit.point.z);
    return { place: { x, y: 0, z }, erase: null };
  }
  if (owner) {
    const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round() : new THREE.Vector3(0, 1, 0);
    return { place: { x: owner.x + n.x, y: owner.y + n.y, z: owner.z + n.z }, erase: owner };
  }
  return null;
}
function isDescendant(obj, root) { let p = obj; while (p) { if (p === root) return true; p = p.parent; } return false; }

function updateGhost(clientX, clientY) {
  if (mode !== 'edit') { ghost.visible = false; return; }
  const t = pickCell(clientX, clientY);
  if (!t) { ghost.visible = false; return; }
  if (tool === 'erase') {
    if (t.erase) { ghost.visible = true; ghost.position.set(t.erase.x + 0.5, t.erase.y + 0.5, t.erase.z + 0.5); ghost.material.color.set(0xff5555); ghost.scale.setScalar(1.04); }
    else ghost.visible = false;
  } else if (t.place && inBounds(t.place.x, t.place.z) && t.place.y >= 0 && t.place.y < MAXY) {
    ghost.visible = true;
    ghost.position.set(t.place.x + 0.5, t.place.y + 0.5, t.place.z + 0.5);
    ghost.material.color.set(0xffffff);
    ghost.scale.setScalar(1);
  } else ghost.visible = false;
}

function applyTool(clientX, clientY) {
  const t = pickCell(clientX, clientY);
  if (!t) return;
  if (tool === 'erase') { if (t.erase) removeKey(key(t.erase.x, t.erase.y, t.erase.z)); }
  else if (t.place) placeCell(tool, t.place.x, t.place.y, t.place.z);
}

/* ------------------------------------------------------------------ */
/* Editor input                                                        */
/* ------------------------------------------------------------------ */

let mode = 'edit';
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (mode === 'play') return playPointerDown(e);
  canvas.setPointerCapture(e.pointerId);
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, button: e.button, az: orbit.az, pol: orbit.pol, tx: orbit.target.x, tz: orbit.target.z };
});
canvas.addEventListener('pointermove', (e) => {
  if (mode === 'play') return;
  if (!drag) { updateGhost(e.clientX, e.clientY); return; }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
  if (drag.moved > 5) ghost.visible = false;
  if (drag.button === 2 || e.shiftKey) {
    // pan across the ground plane
    const s = orbit.dist * 0.0016;
    orbit.target.x = drag.tx - dx * Math.cos(orbit.az) * s - dy * Math.sin(orbit.az) * s;
    orbit.target.z = drag.tz + dx * Math.sin(orbit.az) * s - dy * Math.cos(orbit.az) * s;
  } else {
    orbit.az = drag.az - dx * 0.008;
    orbit.pol = Math.min(Math.PI * 0.49, Math.max(0.15, drag.pol - dy * 0.006));
  }
  applyOrbit();
});
canvas.addEventListener('pointerup', (e) => {
  if (mode === 'play') return;
  if (drag && drag.moved <= 5 && drag.button === 0) applyTool(e.clientX, e.clientY);
  drag = null;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (mode === 'play') return;
  orbit.dist = Math.min(50, Math.max(6, orbit.dist + Math.sign(e.deltaY) * 2));
  applyOrbit();
}, { passive: false });

/* ------------------------------------------------------------------ */
/* Palette UI                                                          */
/* ------------------------------------------------------------------ */

function iconFor(id) {
  // tiny preview: render asset colour as a swatch
  const colors = { grass: '#57b043', dirt: '#8a5a2b', stone: '#8f8f97', brick: '#b5523a', wood: '#a9743f', sand: '#e6d08a', ice: '#aee3f5', metal: '#9aa4b0', coin: '#ffd34d', spike: '#cfd2d6', bounce: '#ff2d7a', tree: '#3fae4a', start: '#2ecc71', goal: '#ffd400' };
  return colors[id] || '#ccc';
}
function buildPalette() {
  const groups = {};
  for (const [id, def] of Object.entries(ASSETS)) (groups[def.group] = groups[def.group] || []).push([id, def]);
  const wrap = $('palette');
  wrap.innerHTML = '';
  for (const [group, items] of Object.entries(groups)) {
    const h = document.createElement('div'); h.className = 'pal-group'; h.textContent = group; wrap.appendChild(h);
    const row = document.createElement('div'); row.className = 'pal-row';
    for (const [id, def] of items) {
      const b = document.createElement('button');
      b.className = 'pal-item'; b.dataset.id = id; b.title = def.label;
      b.innerHTML = `<span class="sw" style="background:${iconFor(id)}"></span><span>${def.label}</span>`;
      b.addEventListener('click', () => selectTool(id));
      row.appendChild(b);
    }
    wrap.appendChild(row);
  }
  // eraser
  const row = document.createElement('div'); row.className = 'pal-row';
  const er = document.createElement('button');
  er.className = 'pal-item'; er.dataset.id = 'erase'; er.title = 'Eraser';
  er.innerHTML = `<span class="sw" style="background:repeating-linear-gradient(45deg,#fff,#fff 3px,#f99 3px,#f99 6px)"></span><span>Eraser</span>`;
  er.addEventListener('click', () => selectTool('erase'));
  row.appendChild(er);
  $('palette').appendChild(row);
  selectTool('grass');
}
function selectTool(id) {
  tool = id;
  document.querySelectorAll('.pal-item').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
}

/* ------------------------------------------------------------------ */
/* Playtest                                                            */
/* ------------------------------------------------------------------ */

const player = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  hw: 0.3, height: 1.6, grounded: false, yaw: 0, coins: 0, total: 0, won: false,
};
const avatar = new THREE.Group();
(function buildAvatar() {
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.35), new THREE.MeshLambertMaterial({ color: 0x3a7bd5 }));
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xffd9a8 }));
  head.position.y = 1.65;
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.28), legMat); l1.position.set(-0.14, 0.3, 0);
  const l2 = l1.clone(); l2.position.x = 0.14;
  avatar.add(body, head, l1, l2);
  avatar.visible = false;
  scene.add(avatar);
})();

const keys = {};
addEventListener('keydown', (e) => { keys[e.code] = true; if (mode === 'play' && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });

let pdrag = null;
function playPointerDown(e) { pdrag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: player.yaw }; canvas.setPointerCapture(e.pointerId); }
addEventListener('pointermove', (e) => { if (mode === 'play' && pdrag) { player.yaw = pdrag.yaw - (e.clientX - pdrag.x) * 0.006; } });
addEventListener('pointerup', () => { pdrag = null; });

function solidAt(x, y, z) { const c = cells.get(key(x, y, z)); return c && SOLID.has(c.kind); }

// Resolve the player's AABB against solid cells after moving along one axis.
function collideAxis(axis) {
  const p = player.pos, hw = player.hw, h = player.height;
  const min = { x: p.x - hw, y: p.y, z: p.z - hw };
  const max = { x: p.x + hw, y: p.y + h, z: p.z + hw };
  const x0 = Math.floor(min.x), x1 = Math.floor(max.x);
  const y0 = Math.floor(min.y), y1 = Math.floor(max.y);
  const z0 = Math.floor(min.z), z1 = Math.floor(max.z);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    if (!solidAt(x, y, z)) continue;
    // overlap exists; push out along the moving axis
    if (axis === 'y') {
      if (player.vel.y <= 0) { p.y = y + 1; player.grounded = true; const c = cells.get(key(x, y, z)); if (c && c.type === 'bounce') player.vel.y = 13; else player.vel.y = 0; }
      else { p.y = y - h - 0.001; player.vel.y = 0; }
      return;
    }
    if (axis === 'x') { p.x = player.vel.x > 0 ? x - hw - 0.001 : x + 1 + hw + 0.001; player.vel.x = 0; return; }
    if (axis === 'z') { p.z = player.vel.z > 0 ? z - hw - 0.001 : z + 1 + hw + 0.001; player.vel.z = 0; return; }
  }
}

function respawn() {
  const s = spawn || { x: 0, y: 1, z: 0 };
  player.pos.set(s.x + 0.5, s.y, s.z + 0.5);
  player.vel.set(0, 0, 0);
}

function enterPlay() {
  if (mode === 'play') return;
  mode = 'play';
  player.coins = 0; player.won = false;
  player.total = [...cells.values()].filter((c) => c.kind === 'coin').length;
  for (const c of cells.values()) c.mesh.visible = true;   // restore collected coins
  ghost.visible = false;
  respawn();
  avatar.visible = true;
  document.body.classList.add('playing');
  $('hud-coins').textContent = `Coins: 0 / ${player.total}`;
  $('win').hidden = true;
}
function exitPlay() {
  mode = 'edit';
  avatar.visible = false;
  for (const c of cells.values()) c.mesh.visible = true;
  document.body.classList.remove('playing');
  $('win').hidden = true;
  applyOrbit();
}

function stepPlay(dt) {
  dt = Math.min(dt, 0.033);
  const run = keys['ShiftLeft'] || keys['ShiftRight'] ? 1.7 : 1;
  const speed = 5.2 * run;
  // desired horizontal velocity relative to camera yaw
  let ix = 0, iz = 0;
  if (keys['KeyW'] || keys['ArrowUp']) iz -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) iz += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) ix += 1;
  const len = Math.hypot(ix, iz) || 1;
  const sinY = Math.sin(player.yaw), cosY = Math.cos(player.yaw);
  const wx = (ix / len) * cosY - (iz / len) * sinY;
  const wz = (ix / len) * sinY + (iz / len) * cosY;
  const moving = ix || iz;
  player.vel.x = moving ? wx * speed : 0;
  player.vel.z = moving ? wz * speed : 0;
  player.vel.y -= 26 * dt;                           // gravity
  if ((keys['Space']) && player.grounded) { player.vel.y = 9.2; player.grounded = false; }

  player.grounded = false;
  player.pos.x += player.vel.x * dt; collideAxis('x');
  player.pos.z += player.vel.z * dt; collideAxis('z');
  player.pos.y += player.vel.y * dt; collideAxis('y');

  // fell off the world
  if (player.pos.y < -8) respawn();

  // triggers: coins, hazards, goal
  const px = Math.floor(player.pos.x), pz = Math.floor(player.pos.z);
  for (let y = Math.floor(player.pos.y); y <= Math.floor(player.pos.y + player.height); y++) {
    const c = cells.get(key(px, y, pz));
    if (!c) continue;
    if (c.kind === 'coin' && c.mesh.visible) { c.mesh.visible = false; player.coins++; $('hud-coins').textContent = `Coins: ${player.coins} / ${player.total}`; }
    if (c.kind === 'hazard') respawn();
    if (c.kind === 'goal' && !player.won) { player.won = true; $('win').hidden = false; $('win-coins').textContent = `${player.coins} / ${player.total} coins`; }
  }

  // place & face the avatar
  avatar.position.copy(player.pos);
  if (moving) avatar.rotation.y = Math.atan2(player.vel.x, player.vel.z);

  // follow camera
  const camDist = 6, camH = 3.2;
  camera.position.set(
    player.pos.x - Math.sin(player.yaw) * camDist,
    player.pos.y + camH,
    player.pos.z - Math.cos(player.yaw) * camDist,
  );
  camera.lookAt(player.pos.x, player.pos.y + 1, player.pos.z);
}

/* ------------------------------------------------------------------ */
/* Toolbar buttons                                                     */
/* ------------------------------------------------------------------ */

$('btn-play').addEventListener('click', enterPlay);
$('btn-edit').addEventListener('click', exitPlay);
$('btn-clear').addEventListener('click', () => { if (confirm('Clear the whole level?')) { clearAll(); starterFloor(); } });
$('win-edit').addEventListener('click', exitPlay);
$('win-again').addEventListener('click', () => { enterPlay(); });

/* ------------------------------------------------------------------ */
/* Loop + resize                                                       */
/* ------------------------------------------------------------------ */

let last = 0;
function frame(now) {
  const t = now / 1000;
  const dt = last ? t - last : 0.016;
  last = t;
  for (const c of cells.values()) if (c.spin && c.mesh.visible) c.mesh.rotation.y += dt * 2;
  if (mode === 'play') stepPlay(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

buildPalette();
starterFloor();
resize();
applyOrbit();
requestAnimationFrame(frame);

// Opt-in test seam.
if (location.search.includes('epicbox-test')) {
  window.__EPICBOX = {
    place: placeCell, remove: (x, y, z) => removeKey(key(x, y, z)), clearAll,
    enterPlay, exitPlay, step: stepPlay, keys, player,
    setYaw: (v) => { player.yaw = v; },
    state: () => ({ mode, cells: cells.size, spawn, goal: goalCell, pos: player.pos.toArray(), coins: player.coins, won: player.won, grounded: player.grounded }),
  };
}
