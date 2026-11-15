// Epicbox — a 3D game maker, Epic Entertainment style.
//
// Pick an asset from the palette (building blocks + a Toolbox of ready-made
// models: cars, a bus, NPCs, houses, lampposts and more) and click to place it
// on the studded baseplate. Orbit/pan/zoom to look around. Hit Playtest to drop
// in as a classic blocky character and run, jump and explore — it's an open
// sandbox, there's no end.

import * as THREE from '../vendor/three.module.min.js';

const GRID = 28;
const HALF = GRID / 2;
const MAXY = 16;
const $ = (id) => document.getElementById(id);
const ckey = (x, y, z) => x + ',' + y + ',' + z;

/* ------------------------------------------------------------------ */
/* Texture helpers (chunky retro, with Roblox-style studs)             */
/* ------------------------------------------------------------------ */

function tile(size, draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  draw(g, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function speckle(g, s, base, a, b, n) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) { g.fillStyle = Math.random() < 0.5 ? a : b; const p = s / 16; g.fillRect(((Math.random() * 16) | 0) * p, ((Math.random() * 16) | 0) * p, p, p); }
}
// Draw a grid of studs over the current tile (works on any base colour).
function studs(g, s, n) {
  const cell = s / n, r = cell * 0.28;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const cx = i * cell + cell / 2, cy = j * cell + cell / 2;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fill();
    g.lineWidth = Math.max(1, s / 48); g.strokeStyle = 'rgba(0,0,0,0.22)'; g.stroke();
    g.beginPath(); g.arc(cx - r * 0.3, cy - r * 0.3, r * 0.45, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fill();
  }
}

const SIDE = {
  grass: (g, s) => { speckle(g, s, '#5aa83e', '#66bd46', '#4e9636', 60); },
  dirt: (g, s) => speckle(g, s, '#8a5a2b', '#7a4d22', '#9a6a38', 70),
  stone: (g, s) => speckle(g, s, '#90929a', '#7f818a', '#a4a6ae', 70),
  brick: (g, s) => { g.fillStyle = '#b5523a'; g.fillRect(0, 0, s, s); g.strokeStyle = '#8a3b2a'; g.lineWidth = s / 24; const h = s / 4; for (let y = 0; y < s; y += h) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); const off = (y / h) % 2 ? h : 0; for (let x = off; x <= s; x += h * 2) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + h); g.stroke(); } } },
  wood: (g, s) => { g.fillStyle = '#b07c45'; g.fillRect(0, 0, s, s); g.strokeStyle = '#8a5c30'; g.lineWidth = 1; for (let x = s / 8; x < s; x += s / 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); } },
  sand: (g, s) => speckle(g, s, '#e3cc84', '#d8c074', '#eddc9e', 55),
  ice: (g, s) => { g.fillStyle = '#a9e1f5'; g.fillRect(0, 0, s, s); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = s / 20; g.beginPath(); g.moveTo(0, s * 0.6); g.lineTo(s * 0.6, 0); g.moveTo(s * 0.3, s); g.lineTo(s, s * 0.3); g.stroke(); },
  metal: (g, s) => { speckle(g, s, '#9aa4b0', '#8a95a2', '#b4bcc6', 25); g.strokeStyle = '#6f7883'; g.lineWidth = s / 16; g.strokeRect(0, 0, s, s); },
};

// Build a block mesh: textured sides, same texture + studs on top.
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
function blockFactory(name) {
  const side = tile(64, SIDE[name]);
  const top = tile(64, (g, s) => { SIDE[name](g, s); studs(g, s, 2); });
  const mats = [side, side, top, side, side, side].map((t) => new THREE.MeshLambertMaterial({ map: t }));
  return () => { const m = new THREE.Mesh(boxGeo, mats); m.castShadow = true; m.receiveShadow = true; return m; };
}

/* ------------------------------------------------------------------ */
/* Classic noob character                                              */
/* ------------------------------------------------------------------ */

const NOOB = { skin: 0xf6d800, torso: 0x0a5aa6, legs: 0x1a9c3a };
const faceTex = tile(128, (g, s) => {
  g.fillStyle = '#f6d800'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#1a1a1a';
  g.beginPath(); g.ellipse(s * 0.34, s * 0.42, s * 0.07, s * 0.1, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(s * 0.66, s * 0.42, s * 0.07, s * 0.1, 0, 0, Math.PI * 2); g.fill();
  g.lineWidth = s * 0.05; g.strokeStyle = '#1a1a1a'; g.lineCap = 'round';
  g.beginPath(); g.arc(s * 0.5, s * 0.52, s * 0.22, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
});

// Returns { group, limbs } so the player avatar can be animated.
function buildNoob(shirt) {
  const group = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const skin = mat(NOOB.skin), torsoMat = mat(shirt === undefined ? NOOB.torso : shirt), legMat = mat(NOOB.legs);
  const add = (mesh, cast = true) => { mesh.castShadow = cast; group.add(mesh); return mesh; };

  // head with a face on the front (+z)
  const headMats = [skin, skin, skin, skin, new THREE.MeshLambertMaterial({ map: faceTex }), skin];
  const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.56, 0.56), headMats));
  head.position.y = 1.62;
  // torso
  add(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.62, 0.36), torsoMat)).position.y = 1.0;

  // limbs pivot at shoulder/hip so they can swing
  function limb(px, py, w, h, d, m) {
    const pivot = new THREE.Group(); pivot.position.set(px, py, 0);
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); box.position.y = -h / 2; box.castShadow = true;
    pivot.add(box); group.add(pivot); return pivot;
  }
  const larm = limb(-0.49, 1.3, 0.26, 0.62, 0.3, skin);
  const rarm = limb(0.49, 1.3, 0.26, 0.62, 0.3, skin);
  const lleg = limb(-0.18, 0.68, 0.3, 0.68, 0.32, legMat);
  const rleg = limb(0.18, 0.68, 0.3, 0.68, 0.32, legMat);
  return { group, limbs: { larm, rarm, lleg, rleg } };
}

/* ------------------------------------------------------------------ */
/* Object/prop models                                                  */
/* ------------------------------------------------------------------ */

const lam = (c, o) => new THREE.MeshLambertMaterial({ color: c, emissive: o || 0x000000 });
function box(w, h, d, c, o) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c, o)); m.castShadow = true; m.receiveShadow = true; return m; }
function cyl(r1, r2, h, seg, c) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), lam(c)); m.castShadow = true; return m; }

function makeCoin() { const g = new THREE.Group(); const c = cyl(0.3, 0.3, 0.09, 18, 0xffd24a); c.material.emissive = new THREE.Color(0x4a3600); c.rotation.z = Math.PI / 2; c.position.y = 0.55; g.add(c); return g; }
function makeSpike() { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.55, 4), lam(0xd0d3d8)); s.castShadow = true; s.position.set(((i % 2) - 0.5) * 0.42, 0.27, (((i / 2) | 0) - 0.5) * 0.42); g.add(s); } return g; }
function makeBounce() { const g = new THREE.Group(); const base = box(0.95, 0.45, 0.95, 0x30323c); base.position.y = 0.22; const top = cyl(0.42, 0.42, 0.18, 18, 0xff2d7a); top.material.emissive = new THREE.Color(0x45001c); top.position.y = 0.5; g.add(base, top); return g; }
function makeTree() { const g = new THREE.Group(); const t = cyl(0.14, 0.18, 0.9, 7, 0x8a5a2b); t.position.y = 0.45; const a = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), lam(0x3fae4a)); a.material.flatShading = true; a.castShadow = true; a.position.y = 1.25; g.add(t, a); return g; }
function makeStart() { const g = new THREE.Group(); const p = cyl(0.44, 0.44, 0.12, 20, 0x2ecc71); p.material.emissive = new THREE.Color(0x0a3d1d); p.position.y = 0.06; g.add(p); return g; }

function makeCar(color) {
  const g = new THREE.Group();
  const body = box(1.7, 0.4, 0.9, color || 0xd23b3b); body.position.y = 0.5;
  const cabin = box(0.95, 0.4, 0.82, color || 0xd23b3b); cabin.position.set(-0.1, 0.9, 0);
  const glass = box(0.9, 0.3, 0.7, 0x2a3540); glass.position.set(-0.1, 0.92, 0);
  const wheel = () => { const w = cyl(0.22, 0.22, 0.16, 14, 0x15161a); w.rotation.x = Math.PI / 2; return w; };
  const w1 = wheel(), w2 = wheel(), w3 = wheel(), w4 = wheel();
  w1.position.set(-0.55, 0.22, 0.46); w2.position.set(0.55, 0.22, 0.46); w3.position.set(-0.55, 0.22, -0.46); w4.position.set(0.55, 0.22, -0.46);
  const lights = box(0.06, 0.12, 0.6, 0xfff3b0, 0x554a00); lights.position.set(0.86, 0.5, 0);
  g.add(body, cabin, glass, w1, w2, w3, w4, lights);
  return g;
}
function makeBus() {
  const g = new THREE.Group();
  const body = box(2.7, 0.95, 0.95, 0xf4c400); body.position.y = 0.75;
  for (let i = -1; i <= 1; i++) { const win = box(0.55, 0.32, 0.02, 0x2a3540); win.position.set(i * 0.7, 0.9, 0.48); const win2 = win.clone(); win2.position.z = -0.48; g.add(win, win2); }
  const wind = box(0.05, 0.45, 0.8, 0x2a3540); wind.position.set(1.36, 0.8, 0); g.add(wind);
  const wheel = () => { const w = cyl(0.26, 0.26, 0.18, 14, 0x15161a); w.rotation.x = Math.PI / 2; return w; };
  [[-0.85, 0.5], [0.95, 0.5], [-0.85, -0.5], [0.95, -0.5]].forEach(([x, z]) => { const w = wheel(); w.position.set(x, 0.26, z); g.add(w); });
  g.add(body);
  return g;
}
function makeHouse() {
  const g = new THREE.Group();
  const walls = box(1.9, 1.2, 1.9, 0xeee3c6); walls.position.y = 0.6;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.55, 0.9, 4), lam(0x9c3b2e)); roof.castShadow = true; roof.rotation.y = Math.PI / 4; roof.position.y = 1.65;
  const door = box(0.5, 0.8, 0.06, 0x6b4a2a); door.position.set(0, 0.4, 0.96);
  const win = box(0.45, 0.45, 0.06, 0x8fd0ff, 0x18384a); win.position.set(-0.62, 0.75, 0.96);
  const win2 = win.clone(); win2.position.x = 0.62;
  g.add(walls, roof, door, win, win2);
  return g;
}
function makeLamp() { const g = new THREE.Group(); const pole = cyl(0.07, 0.09, 1.9, 8, 0x3a3f46); pole.position.y = 0.95; const arm = box(0.5, 0.08, 0.08, 0x3a3f46); arm.position.set(0.2, 1.85, 0); const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), lam(0xfff1a8, 0x8a7a20)); bulb.position.set(0.42, 1.78, 0); g.add(pole, arm, bulb); return g; }
function makeBench() { const g = new THREE.Group(); const seat = box(1.0, 0.09, 0.4, 0xa9743f); seat.position.y = 0.42; const back = box(1.0, 0.4, 0.08, 0xa9743f); back.position.set(0, 0.62, -0.16); [[-0.42, 0.18], [0.42, 0.18], [-0.42, -0.14], [0.42, -0.14]].forEach(([x, z]) => { const l = box(0.08, 0.42, 0.08, 0x6b4a2a); l.position.set(x, 0.21, z); g.add(l); }); g.add(seat, back); return g; }
function makeCone() { const g = new THREE.Group(); const base = box(0.4, 0.06, 0.4, 0x2a2a2a); base.position.y = 0.03; const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 14), lam(0xff7d1a)); c.castShadow = true; c.position.y = 0.33; const stripe = cyl(0.14, 0.17, 0.1, 14, 0xffffff); stripe.position.y = 0.33; g.add(base, c, stripe); return g; }
function makeRock() { const g = new THREE.Group(); const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), lam(0x8c8f96)); r.material.flatShading = true; r.castShadow = true; r.receiveShadow = true; r.position.y = 0.38; r.rotation.set(0.5, 0.8, 0.2); g.add(r); return g; }
function makeFence() { const g = new THREE.Group(); const rail = box(1.0, 0.1, 0.06, 0xb98a52); rail.position.set(0, 0.62, 0); const rail2 = rail.clone(); rail2.position.y = 0.32; [-0.42, 0, 0.42].forEach((x) => { const p = box(0.08, 0.8, 0.08, 0xa9743f); p.position.set(x, 0.4, 0); g.add(p); }); g.add(rail, rail2); return g; }
function makeNpc() { const shirts = [0xd23b3b, 0x7a3bd2, 0x2fae8e, 0xe8882e, 0xdddddd]; const n = buildNoob(shirts[(Math.random() * shirts.length) | 0]); return n.group; }

/* ------------------------------------------------------------------ */
/* Asset registry                                                      */
/* ------------------------------------------------------------------ */

// kind: block/bounce = solid; coin/hazard = trigger; start = marker; prop = solid scenery.
// foot: horizontal footprint [w, d] in cells (default 1x1).
const ASSETS = {
  grass: { label: 'Grass', group: 'Blocks', kind: 'block', make: blockFactory('grass') },
  dirt: { label: 'Dirt', group: 'Blocks', kind: 'block', make: blockFactory('dirt') },
  stone: { label: 'Stone', group: 'Blocks', kind: 'block', make: blockFactory('stone') },
  brick: { label: 'Brick', group: 'Blocks', kind: 'block', make: blockFactory('brick') },
  wood: { label: 'Wood', group: 'Blocks', kind: 'block', make: blockFactory('wood') },
  sand: { label: 'Sand', group: 'Blocks', kind: 'block', make: blockFactory('sand') },
  ice: { label: 'Ice', group: 'Blocks', kind: 'block', make: blockFactory('ice') },
  metal: { label: 'Metal', group: 'Blocks', kind: 'block', make: blockFactory('metal') },

  coin: { label: 'Coin', group: 'Objects', kind: 'coin', spin: true, make: makeCoin },
  spike: { label: 'Spikes', group: 'Objects', kind: 'hazard', make: makeSpike },
  bounce: { label: 'Bouncer', group: 'Objects', kind: 'bounce', make: makeBounce },
  start: { label: 'Spawn', group: 'Objects', kind: 'start', unique: true, make: makeStart },

  car: { label: 'Car', group: 'Toolbox', kind: 'prop', foot: [2, 1], make: () => makeCar(0xd23b3b) },
  taxi: { label: 'Taxi', group: 'Toolbox', kind: 'prop', foot: [2, 1], make: () => makeCar(0xf4b400) },
  bus: { label: 'Bus', group: 'Toolbox', kind: 'prop', foot: [3, 1], make: makeBus },
  npc: { label: 'NPC', group: 'Toolbox', kind: 'prop', foot: [1, 1], make: makeNpc },
  house: { label: 'House', group: 'Toolbox', kind: 'prop', foot: [2, 2], make: makeHouse },
  tree: { label: 'Tree', group: 'Toolbox', kind: 'prop', make: makeTree },
  lamp: { label: 'Lamppost', group: 'Toolbox', kind: 'prop', make: makeLamp },
  bench: { label: 'Bench', group: 'Toolbox', kind: 'prop', make: makeBench },
  cone: { label: 'Cone', group: 'Toolbox', kind: 'prop', make: makeCone },
  rock: { label: 'Rock', group: 'Toolbox', kind: 'prop', make: makeRock },
  fence: { label: 'Fence', group: 'Toolbox', kind: 'prop', make: makeFence },
};
const SOLID = new Set(['block', 'bounce', 'prop']);

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
// gradient sky
scene.background = tile(8, (g, s) => { const grd = g.createLinearGradient(0, 0, 0, s); grd.addColorStop(0, '#4a93e0'); grd.addColorStop(0.55, '#8fc9f5'); grd.addColorStop(1, '#d8eefc'); g.fillStyle = grd; g.fillRect(0, 0, s, s); });
scene.fog = new THREE.Fog(0xcfe6fb, 36, 90);

const hemi = new THREE.HemisphereLight(0xffffff, 0x9fb28a, 0.65);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xfff4e0, 1.0);
sun.position.set(18, 30, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
const sc = sun.shadow.camera; sc.left = -HALF - 4; sc.right = HALF + 4; sc.top = HALF + 4; sc.bottom = -HALF - 4; sc.updateProjectionMatrix();
scene.add(sun);
scene.add(sun.target);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

// studded grey baseplate
const baseTex = tile(64, (g, s) => { g.fillStyle = '#9ba0a6'; g.fillRect(0, 0, s, s); g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2; g.strokeRect(0, 0, s, s); studs(g, s, 1); });
baseTex.wrapS = baseTex.wrapT = THREE.RepeatWrapping; baseTex.repeat.set(GRID, GRID);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(GRID, GRID), new THREE.MeshLambertMaterial({ map: baseTex }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);
const rayGround = new THREE.Mesh(new THREE.PlaneGeometry(GRID, GRID), new THREE.MeshBasicMaterial({ visible: false }));
rayGround.rotation.x = -Math.PI / 2; scene.add(rayGround);

const worldGroup = new THREE.Group();
scene.add(worldGroup);

/* ------------------------------------------------------------------ */
/* Level data (objects can span several cells)                         */
/* ------------------------------------------------------------------ */

let nextId = 1;
const objects = new Map();   // id -> { id, type, kind, cells:[key], anchor, mesh, spin }
const owner = new Map();     // cellKey -> id
let spawn = null;

const inBounds = (x, z) => x >= -HALF && x < HALF && z >= -HALF && z < HALF;

function footprintCells(def, x, y, z) {
  const [w, d] = def.foot || [1, 1];
  const list = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) list.push({ x: x + i, y, z: z + j });
  return list;
}

function placeObject(type, x, y, z) {
  const def = ASSETS[type];
  if (!def) return;
  const foot = footprintCells(def, x, y, z);
  for (const c of foot) { if (!inBounds(c.x, c.z) || c.y < 0 || c.y >= MAXY) return; if (owner.has(ckey(c.x, c.y, c.z))) return; }
  if (def.unique) for (const [id, o] of objects) if (o.type === type) removeObject(id);

  const [w, d] = def.foot || [1, 1];
  const mesh = def.make();
  const cx = x + (w - 1) / 2 + 0.5, cz = z + (d - 1) / 2 + 0.5;
  mesh.position.set(cx, def.kind === 'block' ? y + 0.5 : y, cz);
  worldGroup.add(mesh);

  const id = nextId++;
  const cells = foot.map((c) => ckey(c.x, c.y, c.z));
  objects.set(id, { id, type, kind: def.kind, cells, anchor: { x, y, z }, mesh, spin: def.spin });
  cells.forEach((k) => owner.set(k, id));
  if (def.kind === 'start') spawn = { x, y, z };
}

function removeObject(id) {
  const o = objects.get(id);
  if (!o) return;
  worldGroup.remove(o.mesh);
  o.cells.forEach((k) => owner.delete(k));
  objects.delete(id);
  if (o.kind === 'start') spawn = null;
}
function removeAt(x, y, z) { const id = owner.get(ckey(x, y, z)); if (id) removeObject(id); }
function clearAll() { for (const id of [...objects.keys()]) removeObject(id); }

// A populated starter scene so it looks alive from the first second.
function starterScene() {
  clearAll();
  for (let x = -8; x < 8; x++) for (let z = -8; z < 8; z++) placeObject(x >= -2 && x < 2 ? 'stone' : 'grass', x, 0, z); // grass with a stone road
  placeObject('start', -6, 1, -6);
  placeObject('house', 4, 1, 3);
  placeObject('tree', -6, 1, 4); placeObject('tree', 6, 1, -5); placeObject('tree', -4, 1, -6);
  placeObject('car', -1, 1, -7); placeObject('bus', -2, 1, 5);
  placeObject('npc', 3, 1, -3); placeObject('npc', -5, 1, 1);
  placeObject('lamp', 2, 1, -6); placeObject('lamp', -2, 1, 4);
  placeObject('bench', 5, 1, -2); placeObject('cone', 0, 1, -2); placeObject('cone', 1, 1, 1);
  placeObject('rock', -7, 1, -2); placeObject('fence', -7, 1, 6); placeObject('fence', -6, 1, 6);
  placeObject('coin', -4, 1, -4); placeObject('coin', 0, 1, 4); placeObject('coin', 4, 1, -6);
  placeObject('bounce', 6, 1, 6);
}

/* ------------------------------------------------------------------ */
/* Editor camera (orbit)                                               */
/* ------------------------------------------------------------------ */

const orbit = { target: new THREE.Vector3(0, 1, 0), dist: 26, az: Math.PI * 0.2, pol: Math.PI * 0.34 };
function applyOrbit() {
  const sp = Math.sin(orbit.pol), cp = Math.cos(orbit.pol);
  camera.position.set(orbit.target.x + orbit.dist * sp * Math.sin(orbit.az), orbit.target.y + orbit.dist * cp, orbit.target.z + orbit.dist * sp * Math.cos(orbit.az));
  camera.lookAt(orbit.target);
}

/* ------------------------------------------------------------------ */
/* Tools + ghost                                                       */
/* ------------------------------------------------------------------ */

let tool = 'grass';
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const ghost = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }));
ghost.visible = false; scene.add(ghost);

function pickCell(cx, cy) {
  ndc.set((cx / canvas.clientWidth) * 2 - 1, -(cy / canvas.clientHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const meshes = [rayGround, ...[...objects.values()].map((o) => o.mesh)];
  const hits = raycaster.intersectObjects(meshes, true);
  if (!hits.length) return null;
  const hit = hits[0];
  if (hit.object === rayGround) { return { place: { x: Math.floor(hit.point.x), y: 0, z: Math.floor(hit.point.z) }, erase: null }; }
  let ownerObj = null;
  for (const o of objects.values()) { let p = hit.object; while (p) { if (p === o.mesh) { ownerObj = o; break; } p = p.parent; } if (ownerObj) break; }
  if (!ownerObj) return null;
  const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round() : new THREE.Vector3(0, 1, 0);
  // place against the face, using the anchor cell nearest the hit for multi-cell objects
  const base = ownerObj.anchor;
  return { place: { x: base.x + n.x, y: base.y + n.y, z: base.z + n.z }, erase: ownerObj };
}

function updateGhost(cx, cy) {
  if (mode !== 'edit') { ghost.visible = false; return; }
  const t = pickCell(cx, cy);
  if (!t) { ghost.visible = false; return; }
  if (tool === 'erase') {
    if (t.erase) { ghost.visible = true; const a = t.erase.anchor; const [w, d] = ASSETS[t.erase.type].foot || [1, 1]; ghost.position.set(a.x + (w - 1) / 2 + 0.5, a.y + 0.5, a.z + (d - 1) / 2 + 0.5); ghost.scale.set(w + 0.06, 1.06, d + 0.06); ghost.material.color.set(0xff5555); }
    else ghost.visible = false;
  } else if (t.place && inBounds(t.place.x, t.place.z)) {
    const [w, d] = ASSETS[tool].foot || [1, 1];
    ghost.visible = true; ghost.position.set(t.place.x + (w - 1) / 2 + 0.5, t.place.y + 0.5, t.place.z + (d - 1) / 2 + 0.5); ghost.scale.set(w, 1, d); ghost.material.color.set(0xffffff);
  } else ghost.visible = false;
}
function applyTool(cx, cy) {
  const t = pickCell(cx, cy);
  if (!t) return;
  if (tool === 'erase') { if (t.erase) removeObject(t.erase.id); }
  else if (t.place) placeObject(tool, t.place.x, t.place.y, t.place.z);
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

let mode = 'edit';
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (mode === 'play') { pdrag = { x: e.clientX, yaw: player.yaw }; canvas.setPointerCapture(e.pointerId); return; }
  canvas.setPointerCapture(e.pointerId);
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, button: e.button, az: orbit.az, pol: orbit.pol, tx: orbit.target.x, tz: orbit.target.z };
});
canvas.addEventListener('pointermove', (e) => {
  if (mode === 'play') { if (pdrag) player.yaw = pdrag.yaw - (e.clientX - pdrag.x) * 0.006; return; }
  if (!drag) { updateGhost(e.clientX, e.clientY); return; }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
  if (drag.moved > 5) ghost.visible = false;
  if (drag.button === 2 || e.shiftKey) {
    const s = orbit.dist * 0.0016;
    orbit.target.x = drag.tx - dx * Math.cos(orbit.az) * s - dy * Math.sin(orbit.az) * s;
    orbit.target.z = drag.tz + dx * Math.sin(orbit.az) * s - dy * Math.cos(orbit.az) * s;
  } else { orbit.az = drag.az - dx * 0.008; orbit.pol = Math.min(Math.PI * 0.49, Math.max(0.12, drag.pol - dy * 0.006)); }
  applyOrbit();
});
canvas.addEventListener('pointerup', (e) => {
  if (mode === 'play') { pdrag = null; return; }
  if (drag && drag.moved <= 5 && drag.button === 0) applyTool(e.clientX, e.clientY);
  drag = null;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { if (mode === 'play') return; e.preventDefault(); orbit.dist = Math.min(55, Math.max(6, orbit.dist + Math.sign(e.deltaY) * 2)); applyOrbit(); }, { passive: false });

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

const SWATCH = { grass: '#5aa83e', dirt: '#8a5a2b', stone: '#90929a', brick: '#b5523a', wood: '#b07c45', sand: '#e3cc84', ice: '#a9e1f5', metal: '#9aa4b0', coin: '#ffd24a', spike: '#d0d3d8', bounce: '#ff2d7a', start: '#2ecc71', car: '#d23b3b', taxi: '#f4b400', bus: '#f4c400', npc: '#f6d800', house: '#eee3c6', tree: '#3fae4a', lamp: '#fff1a8', bench: '#a9743f', cone: '#ff7d1a', rock: '#8c8f96', fence: '#b98a52' };
function buildPalette() {
  const groups = {};
  for (const [id, def] of Object.entries(ASSETS)) (groups[def.group] = groups[def.group] || []).push([id, def]);
  const wrap = $('palette'); wrap.innerHTML = '';
  for (const [group, items] of Object.entries(groups)) {
    const h = document.createElement('div'); h.className = 'pal-group'; h.textContent = group; wrap.appendChild(h);
    const row = document.createElement('div'); row.className = 'pal-row';
    for (const [id, def] of items) {
      const b = document.createElement('button'); b.className = 'pal-item'; b.dataset.id = id; b.title = def.label;
      b.innerHTML = `<span class="sw" style="background:${SWATCH[id] || '#ccc'}"></span><span>${def.label}</span>`;
      b.addEventListener('click', () => selectTool(id)); row.appendChild(b);
    }
    wrap.appendChild(row);
  }
  const row = document.createElement('div'); row.className = 'pal-row';
  const er = document.createElement('button'); er.className = 'pal-item'; er.dataset.id = 'erase'; er.title = 'Eraser';
  er.innerHTML = `<span class="sw" style="background:repeating-linear-gradient(45deg,#fff,#fff 3px,#f99 3px,#f99 6px)"></span><span>Eraser</span>`;
  er.addEventListener('click', () => selectTool('erase')); row.appendChild(er); wrap.appendChild(row);
  selectTool('grass');
}
function selectTool(id) { tool = id; document.querySelectorAll('.pal-item').forEach((b) => b.classList.toggle('on', b.dataset.id === id)); }

/* ------------------------------------------------------------------ */
/* Playtest (open sandbox — no ending)                                 */
/* ------------------------------------------------------------------ */

const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), hw: 0.32, height: 1.8, grounded: false, yaw: 0, coins: 0, walk: 0 };
const noob = buildNoob();
noob.group.visible = false;
noob.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
scene.add(noob.group);

const keys = {};
let pdrag = null;
addEventListener('keydown', (e) => { keys[e.code] = true; if (mode === 'play' && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });

function solidAt(x, y, z) { const id = owner.get(ckey(x, y, z)); if (!id) return false; const o = objects.get(id); return o && SOLID.has(o.kind); }

function collideAxis(axis) {
  const p = player.pos, hw = player.hw, h = player.height;
  const x0 = Math.floor(p.x - hw), x1 = Math.floor(p.x + hw);
  const y0 = Math.floor(p.y), y1 = Math.floor(p.y + h);
  const z0 = Math.floor(p.z - hw), z1 = Math.floor(p.z + hw);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    if (!solidAt(x, y, z)) continue;
    if (axis === 'y') { if (player.vel.y <= 0) { p.y = y + 1; player.grounded = true; const o = objects.get(owner.get(ckey(x, y, z))); player.vel.y = (o && o.type === 'bounce') ? 13 : 0; } else { p.y = y - h - 0.001; player.vel.y = 0; } return; }
    if (axis === 'x') { p.x = player.vel.x > 0 ? x - hw - 0.001 : x + 1 + hw + 0.001; player.vel.x = 0; return; }
    if (axis === 'z') { p.z = player.vel.z > 0 ? z - hw - 0.001 : z + 1 + hw + 0.001; player.vel.z = 0; return; }
  }
}
function respawn() { const s = spawn || { x: 0, y: 1, z: 0 }; player.pos.set(s.x + 0.5, s.y, s.z + 0.5); player.vel.set(0, 0, 0); }

function enterPlay() {
  if (mode === 'play') return;
  mode = 'play'; player.coins = 0;
  for (const o of objects.values()) if (o.kind === 'coin') o.mesh.visible = true;
  ghost.visible = false; respawn(); noob.group.visible = true;
  document.body.classList.add('playing');
  $('hud-coins').textContent = 'Coins: 0';
}
function exitPlay() { mode = 'edit'; noob.group.visible = false; document.body.classList.remove('playing'); applyOrbit(); }

function stepPlay(dt) {
  dt = Math.min(dt, 0.033);
  const run = (keys['ShiftLeft'] || keys['ShiftRight']) ? 1.7 : 1;
  const speed = 5.4 * run;
  let ix = 0, iz = 0;
  if (keys['KeyW'] || keys['ArrowUp']) iz -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) iz += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) ix += 1;
  const moving = ix || iz;
  const len = Math.hypot(ix, iz) || 1;
  const sinY = Math.sin(player.yaw), cosY = Math.cos(player.yaw);
  player.vel.x = moving ? ((ix / len) * cosY - (iz / len) * sinY) * speed : 0;
  player.vel.z = moving ? ((ix / len) * sinY + (iz / len) * cosY) * speed : 0;
  player.vel.y -= 26 * dt;
  if (keys['Space'] && player.grounded) { player.vel.y = 9.6; player.grounded = false; }

  player.grounded = false;
  player.pos.x += player.vel.x * dt; collideAxis('x');
  player.pos.z += player.vel.z * dt; collideAxis('z');
  player.pos.y += player.vel.y * dt; collideAxis('y');
  if (player.pos.y < -10) respawn();

  // triggers
  const px = Math.floor(player.pos.x), pz = Math.floor(player.pos.z);
  for (let y = Math.floor(player.pos.y); y <= Math.floor(player.pos.y + player.height); y++) {
    const o = objects.get(owner.get(ckey(px, y, pz)));
    if (!o) continue;
    if (o.kind === 'coin' && o.mesh.visible) { o.mesh.visible = false; player.coins++; $('hud-coins').textContent = 'Coins: ' + player.coins; }
    if (o.kind === 'hazard') respawn();
  }

  // avatar placement + walk animation
  noob.group.position.copy(player.pos);
  if (moving) noob.group.rotation.y = Math.atan2(player.vel.x, player.vel.z);
  const target = moving ? (run > 1 ? 16 : 10) : 0;
  player.walk += dt * (moving ? (run > 1 ? 14 : 9) : 6);
  const sw = Math.sin(player.walk) * (moving ? 0.5 : 0.08);
  noob.limbs.lleg.rotation.x = sw; noob.limbs.rleg.rotation.x = -sw;
  noob.limbs.larm.rotation.x = -sw; noob.limbs.rarm.rotation.x = sw;

  const camDist = 6.2, camH = 3.2;
  camera.position.set(player.pos.x - Math.sin(player.yaw) * camDist, player.pos.y + camH, player.pos.z - Math.cos(player.yaw) * camDist);
  camera.lookAt(player.pos.x, player.pos.y + 1.1, player.pos.z);
}

/* ------------------------------------------------------------------ */
/* Toolbar + loop                                                      */
/* ------------------------------------------------------------------ */

$('btn-play').addEventListener('click', enterPlay);
$('btn-edit').addEventListener('click', exitPlay);
$('btn-clear').addEventListener('click', () => { if (confirm('Clear the whole world?')) starterScene(); });

let last = 0;
function frame(now) {
  const t = now / 1000, dt = last ? t - last : 0.016; last = t;
  for (const o of objects.values()) if (o.spin && o.mesh.visible) o.mesh.rotation.y += dt * 2;
  if (mode === 'play') stepPlay(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
function resize() { const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);

buildPalette();
starterScene();
resize();
applyOrbit();
requestAnimationFrame(frame);

if (location.search.includes('epicbox-test')) {
  window.__EPICBOX = {
    place: placeObject, remove: removeAt, clearAll, starterScene,
    enterPlay, exitPlay, step: stepPlay, keys, player, setYaw: (v) => { player.yaw = v; },
    state: () => ({ mode, objects: objects.size, cells: owner.size, spawn, pos: player.pos.toArray(), coins: player.coins, grounded: player.grounded }),
  };
}
