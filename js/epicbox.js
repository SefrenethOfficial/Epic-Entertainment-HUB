// Epicbox — a 3D game maker, Epic Entertainment style.
//
// Place parts on a big studded baseplate, then SELECT a part and drag the
// coloured handle-orbs to stretch it into any shape (minimum 1x1x1 stud).
// Hit Playtest to drop in as a classic blocky character and run around — it's
// an open sandbox, there's no end.

import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

const GRID = 64;          // baseplate is GRID x GRID studs
const HALF = GRID / 2;
const MAXY = 40;          // how high parts can go
const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ */
/* Baseplate texture (classic studded plate)                           */
/* ------------------------------------------------------------------ */

function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

const baseTex = (() => {
  const s = 128, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.fillStyle = '#8d9094'; g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(0, 0, s, 3); g.fillRect(0, 0, 3, s);
  const m = s * 0.18, w = s - 2 * m;
  roundRect(g, m + 2, m + 2, w, w, s * 0.1); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fill();      // shadow
  roundRect(g, m, m, w, w, s * 0.1); g.fillStyle = '#979a9e'; g.fill();                        // stud top
  roundRect(g, m, m, w, w * 0.9, s * 0.1); g.fillStyle = 'rgba(255,255,255,0.22)'; g.fill();   // highlight
  roundRect(g, m + w * 0.18, m + w * 0.18, w * 0.64, w * 0.64, s * 0.08); g.fillStyle = '#8f9296'; g.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(GRID, GRID);
  tex.anisotropy = 4; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();

/* ------------------------------------------------------------------ */
/* Classic noob (R6 proportions, smaller head)                         */
/* ------------------------------------------------------------------ */

const NOOB = { skin: 0xf6d800, torso: 0x0a5aa6, legs: 0x1a9c3a };
const faceTex = (() => {
  const s = 128, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.fillStyle = '#f6d800'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#1a1a1a';
  g.beginPath(); g.ellipse(s * 0.36, s * 0.44, s * 0.06, s * 0.09, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(s * 0.64, s * 0.44, s * 0.06, s * 0.09, 0, 0, Math.PI * 2); g.fill();
  g.lineWidth = s * 0.045; g.strokeStyle = '#1a1a1a'; g.lineCap = 'round';
  g.beginPath(); g.arc(s * 0.5, s * 0.54, s * 0.2, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();

const U = 0.34;   // world units per stud; character ends up ~1.8 tall
function buildNoob(shirt) {
  const group = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const skin = mat(NOOB.skin), torsoMat = mat(shirt === undefined ? NOOB.torso : shirt), legMat = mat(NOOB.legs);
  const legH = 2 * U, torsoH = 2 * U, torsoW = 2 * U, torsoD = 1 * U, limbT = 1 * U;
  const hipY = legH, shoulderY = legH + torsoH;
  const headW = 1.1 * U, headH = 0.95 * U, headD = 1.0 * U;   // smaller than before

  const torso = new THREE.Mesh(new THREE.BoxGeometry(torsoW, torsoH, torsoD), torsoMat);
  torso.position.y = hipY + torsoH / 2; torso.castShadow = true; group.add(torso);

  const headMats = [skin, skin, skin, skin, new THREE.MeshLambertMaterial({ map: faceTex }), skin];
  const head = new THREE.Mesh(new THREE.BoxGeometry(headW, headH, headD), headMats);
  head.position.y = shoulderY + headH / 2; head.castShadow = true; group.add(head);

  function limb(px, py, m) {
    const pivot = new THREE.Group(); pivot.position.set(px, py, 0);
    const box = new THREE.Mesh(new THREE.BoxGeometry(limbT, 2 * U, limbT), m); box.position.y = -U; box.castShadow = true;
    pivot.add(box); group.add(pivot); return pivot;
  }
  const larm = limb(-(torsoW / 2 + limbT / 2), shoulderY, skin);
  const rarm = limb(torsoW / 2 + limbT / 2, shoulderY, skin);
  const lleg = limb(-limbT / 2, hipY, legMat);
  const rleg = limb(limbT / 2, hipY, legMat);
  return { group, limbs: { larm, rarm, lleg, rleg } };
}

/* ------------------------------------------------------------------ */
/* Object models (fixed 1x1 items)                                     */
/* ------------------------------------------------------------------ */

const lam = (c, e) => new THREE.MeshLambertMaterial({ color: c, emissive: e || 0x000000 });
function cyl(r1, r2, h, seg, c, e) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), lam(c, e)); m.castShadow = true; return m; }
function makeCoin() { const g = new THREE.Group(); const c = cyl(0.3, 0.3, 0.09, 18, 0xffd24a, 0x4a3600); c.rotation.z = Math.PI / 2; c.position.y = 0.55; g.add(c); return g; }
function makeSpike() { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.55, 4), lam(0xd0d3d8)); s.castShadow = true; s.position.set(((i % 2) - 0.5) * 0.42, 0.27, (((i / 2) | 0) - 0.5) * 0.42); g.add(s); } return g; }
function makeBounce() { const g = new THREE.Group(); const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.45, 0.95), lam(0x30323c)); base.castShadow = true; base.position.y = 0.22; const top = cyl(0.42, 0.42, 0.18, 18, 0xff2d7a, 0x45001c); top.position.y = 0.5; g.add(base, top); return g; }
function makeStart() { const g = new THREE.Group(); const p = cyl(0.46, 0.46, 0.12, 22, 0x2ecc71, 0x0a3d1d); p.position.y = 0.06; g.add(p); return g; }

/* ---- functional parts (pizza simulator): spawner + conveyor ---- */

// 0 = North (+z), 1 = East (+x), 2 = South (-z), 3 = West (-x)
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const ITEM_COLORS = { dough: 0xe9d7a8, pizza: 0xc9962f, drink: 0x2d6fd6, box: 0x9a6b3a };

function makeSpawner(settings) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), lam(0x5b6470)); body.castShadow = true; body.receiveShadow = true; body.position.y = 0.45; g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.7), lam(ITEM_COLORS[settings.item] || 0xffcf3f, 0x332200)); top.position.y = 0.96; g.add(top);
  const chute = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), lam(0x30333a)); chute.position.y = 0.1; g.add(chute);
  return g;
}
function chevronTex(dir) {
  const s = 64, cv = document.createElement('canvas'); cv.width = cv.height = s; const g = cv.getContext('2d');
  g.fillStyle = '#2f333b'; g.fillRect(0, 0, s, s);
  g.save(); g.translate(s / 2, s / 2); g.rotate(dir * Math.PI / 2); g.translate(-s / 2, -s / 2);
  g.strokeStyle = '#f4c400'; g.lineWidth = 7; g.lineCap = 'round';
  for (const off of [-16, 8]) { g.beginPath(); g.moveTo(18, 14 + off + 16); g.lineTo(44, 32 + off + 16); g.lineTo(18, 50 + off + 16); g.stroke(); }
  g.restore();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
}
function makeConveyor(settings) {
  const g = new THREE.Group();
  const top = new THREE.MeshLambertMaterial({ map: chevronTex(settings.dir) });
  const dark = lam(0x24272d);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.3, 0.98), [dark, dark, top, dark, dark, dark]);
  belt.castShadow = true; belt.receiveShadow = true; belt.position.y = 0.15; g.add(belt);
  return g;
}

function makeItem(type) {
  const g = new THREE.Group();
  if (type === 'pizza') { const base = cyl(0.3, 0.3, 0.08, 16, 0xd9a441); base.position.y = 0.08; const sauce = cyl(0.26, 0.26, 0.04, 16, 0xc0392b); sauce.position.y = 0.13; g.add(base, sauce); for (let i = 0; i < 4; i++) { const t = cyl(0.03, 0.03, 0.03, 6, 0xd94f2b); t.position.set(Math.cos(i) * 0.14, 0.15, Math.sin(i) * 0.14); g.add(t); } }
  else if (type === 'drink') { const cup = cyl(0.12, 0.09, 0.3, 12, 0x2d6fd6); cup.position.y = 0.15; const lid = cyl(0.13, 0.13, 0.04, 12, 0xecf0f1); lid.position.y = 0.3; g.add(cup, lid); }
  else if (type === 'box') { const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.34), lam(0x9a6b3a)); b.castShadow = true; b.position.y = 0.13; g.add(b); }
  else { const d = cyl(0.26, 0.26, 0.1, 14, 0xe9d7a8); d.position.y = 0.08; g.add(d); }   // dough
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

const FUNC = {
  spawner: { label: 'Spawner', kind: 'spawner', defaults: { item: 'dough', interval: 2, max: 8 }, make: makeSpawner },
  conveyor: { label: 'Conveyor', kind: 'conveyor', defaults: { dir: 1, speed: 3 }, make: makeConveyor },
};

/* ------------------------------------------------------------------ */
/* Colour palette + object kinds                                       */
/* ------------------------------------------------------------------ */

const COLORS = [
  ['red', 0xc0392b], ['orange', 0xe67e22], ['yellow', 0xf4c400], ['green', 0x27ae60],
  ['teal', 0x16a085], ['blue', 0x2d6fd6], ['navy', 0x1b3a66], ['purple', 0x8e44ad],
  ['pink', 0xe84393], ['brown', 0x8a5a2b], ['white', 0xecf0f1], ['grey', 0x95a0a8],
  ['black', 0x222529], ['sand', 0xe3cc84],
];
const OBJECTS = {
  spawn: { label: 'Spawn', kind: 'start', make: makeStart },
  coin: { label: 'Coin', kind: 'coin', spin: true, make: makeCoin },
  bounce: { label: 'Bouncer', kind: 'bounce', make: makeBounce },
  spike: { label: 'Spikes', kind: 'hazard', make: makeSpike },
};

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = (() => { const s = 16, cv = document.createElement('canvas'); cv.width = cv.height = s; const g = cv.getContext('2d'); const grd = g.createLinearGradient(0, 0, 0, s); grd.addColorStop(0, '#3f86d6'); grd.addColorStop(0.6, '#8ec7f2'); grd.addColorStop(1, '#d4ebfb'); g.fillStyle = grd; g.fillRect(0, 0, s, s); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();

scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb28a, 0.7));
scene.add(new THREE.AmbientLight(0xffffff, 0.22));
const sun = new THREE.DirectionalLight(0xfff4e0, 1.0);
sun.position.set(24, 40, 18); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 140;
const sc = sun.shadow.camera; sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.updateProjectionMatrix();
scene.add(sun, sun.target);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(GRID, GRID), new THREE.MeshLambertMaterial({ map: baseTex }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const rayGround = new THREE.Mesh(new THREE.PlaneGeometry(GRID, GRID), new THREE.MeshBasicMaterial({ visible: false }));
rayGround.rotation.x = -Math.PI / 2; scene.add(rayGround);

const worldGroup = new THREE.Group();
scene.add(worldGroup);

/* ------------------------------------------------------------------ */
/* Parts (resizable boxes) + objects                                   */
/* ------------------------------------------------------------------ */

// A part: integer stud box. For blocks, size is editable; for objects it's 1x1x1.
// { id, kind, color, x,y,z (min corner), sx,sy,sz, mesh, spin }
let nextId = 1;
const parts = new Map();
let spawn = null;

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
function partMesh(p) {
  if (p.kind === 'block') {
    const m = new THREE.Mesh(p.shape === 'cylinder' ? cylGeo : boxGeo, new THREE.MeshLambertMaterial({ color: p.color }));
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  if (FUNC[p.type]) return FUNC[p.type].make(p.settings);
  return OBJECTS[p.type].make();
}
function positionMesh(p) {
  if (p.kind === 'block') { p.mesh.scale.set(p.sx, p.sy, p.sz); p.mesh.position.set(p.x + p.sx / 2, p.y + p.sy / 2, p.z + p.sz / 2); }
  else p.mesh.position.set(p.x + 0.5, p.y, p.z + 0.5);
}

const inBounds = (x, z) => x >= -HALF && x < HALF && z >= -HALF && z < HALF;

function cellFree(x, y, z, ignore) {
  for (const p of parts.values()) {
    if (p === ignore) continue;
    if (x >= p.x && x < p.x + p.sx && y >= p.y && y < p.y + p.sy && z >= p.z && z < p.z + p.sz) return false;
  }
  return true;
}

function addBlock(color, x, y, z, shape) {
  if (!inBounds(x, z) || y < 0 || !cellFree(x, y, z)) return null;
  const p = { id: nextId++, kind: 'block', type: 'block', color, shape: shape || 'box', x, y, z, sx: 1, sy: 1, sz: 1 };
  p.mesh = partMesh(p); positionMesh(p); worldGroup.add(p.mesh); parts.set(p.id, p);
  return p;
}
function addObject(type, x, y, z) {
  const def = OBJECTS[type] || FUNC[type]; if (!def || !inBounds(x, z) || y < 0 || !cellFree(x, y, z)) return null;
  if (def.kind === 'start') for (const [id, p] of parts) if (p.kind === 'start') removePart(id);
  const p = { id: nextId++, kind: def.kind, type, x, y, z, sx: 1, sy: 1, sz: 1, spin: def.spin };
  if (FUNC[type]) p.settings = { ...FUNC[type].defaults };
  p.mesh = partMesh(p); positionMesh(p); worldGroup.add(p.mesh); parts.set(p.id, p);
  if (def.kind === 'start') spawn = { x, y, z };
  return p;
}
// Rebuild a functional part's mesh after its settings change (e.g. conveyor direction).
function refreshPartMesh(p) { worldGroup.remove(p.mesh); p.mesh = partMesh(p); positionMesh(p); worldGroup.add(p.mesh); }
function removePart(id) {
  const p = parts.get(id); if (!p) return;
  if (selected === p) deselect();
  worldGroup.remove(p.mesh); parts.delete(id);
  if (p.kind === 'start') spawn = null;
}
function clearAll() { for (const id of [...parts.keys()]) removePart(id); }
// Conveyors are solid (items + the player rest on them); spawners are not, so
// dropped items fall through onto whatever belt or floor is below.
function solidParts() { const r = []; for (const p of parts.values()) if (p.kind === 'block' || p.kind === 'bounce' || p.kind === 'conveyor') r.push(p); return r; }

function starterScene() {
  clearAll();
  const g = addBlock(COLORS[3][1], -6, 0, -6); if (g) { g.sx = 12; g.sz = 12; positionMesh(g); }   // a green platform
  addObject('spawn', 0, 1, 0);
  deselect();
}

/* ------------------------------------------------------------------ */
/* Selection + resize handles (the stretchy orbs)                      */
/* ------------------------------------------------------------------ */

let selected = null;
let outline = null;
const handles = [];   // { mesh, axis:'x'|'y'|'z', side:+1|-1 }
const HANDLE_COLOR = { x: 0xff4d4d, y: 0x4dff6a, z: 0x4d8bff };

function clearHandles() { handles.forEach((h) => scene.remove(h.mesh)); handles.length = 0; if (outline) { scene.remove(outline); outline.geometry.dispose(); outline = null; } }
function deselect() { selected = null; clearHandles(); updateGear(); }

function select(p) {
  clearHandles();
  if (!p || (p.kind !== 'block' && !FUNC[p.type])) { selected = null; updateGear(); return; }
  selected = p;
  outline = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), new THREE.LineBasicMaterial({ color: 0xffe24d }));
  scene.add(outline);
  if (p.kind === 'block') {   // blocks get the stretch handles
    const faces = [['x', 1], ['x', -1], ['y', 1], ['y', -1], ['z', 1], ['z', -1]];
    for (const [axis, side] of faces) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), new THREE.MeshBasicMaterial({ color: HANDLE_COLOR[axis] }));
      mesh.renderOrder = 999; mesh.material.depthTest = false;
      scene.add(mesh); handles.push({ mesh, axis, side });
    }
  }
  updateHandles(); updateGear();
}
function updateHandles() {
  if (!selected) return;
  const p = selected;
  outline.scale.set(p.sx, p.sy, p.sz);
  outline.position.set(p.x + p.sx / 2, p.y + p.sy / 2, p.z + p.sz / 2);
  const cx = p.x + p.sx / 2, cy = p.y + p.sy / 2, cz = p.z + p.sz / 2;
  for (const h of handles) {
    const pos = new THREE.Vector3(cx, cy, cz);
    if (h.axis === 'x') pos.x = h.side > 0 ? p.x + p.sx : p.x;
    if (h.axis === 'y') pos.y = h.side > 0 ? p.y + p.sy : p.y;
    if (h.axis === 'z') pos.z = h.side > 0 ? p.z + p.sz : p.z;
    h.mesh.position.copy(pos);
  }
}

// Apply a resize so the given face lands on an integer stud, clamped to >=1 size.
function resizeFace(p, axis, side, newFaceStud) {
  const sizeK = axis === 'x' ? 'sx' : axis === 'y' ? 'sy' : 'sz';
  const posK = axis;
  const minCorner = p[posK], maxCorner = p[posK] + p[sizeK];
  if (side > 0) {           // moving the max face
    let nm = Math.round(newFaceStud);
    nm = Math.max(minCorner + 1, nm);
    if (axis === 'y') nm = Math.min(nm, minCorner + MAXY);
    if (axis === 'x' || axis === 'z') nm = Math.min(nm, HALF);
    p[sizeK] = nm - minCorner;
  } else {                  // moving the min face
    let nm = Math.round(newFaceStud);
    nm = Math.min(maxCorner - 1, nm);
    if (axis === 'y') nm = Math.max(nm, 0);
    if (axis === 'x' || axis === 'z') nm = Math.max(nm, -HALF);
    p[posK] = nm; p[sizeK] = maxCorner - nm;
  }
  positionMesh(p); updateHandles();
}

/* ------------------------------------------------------------------ */
/* Editor camera (orbit)                                               */
/* ------------------------------------------------------------------ */

const orbit = { target: new THREE.Vector3(0, 1, 0), dist: 30, az: Math.PI * 0.18, pol: Math.PI * 0.36 };
function applyOrbit() {
  const sp = Math.sin(orbit.pol), cp = Math.cos(orbit.pol);
  camera.position.set(orbit.target.x + orbit.dist * sp * Math.sin(orbit.az), orbit.target.y + orbit.dist * cp, orbit.target.z + orbit.dist * sp * Math.cos(orbit.az));
  camera.lookAt(orbit.target);
}

/* ------------------------------------------------------------------ */
/* Raycasting helpers                                                  */
/* ------------------------------------------------------------------ */

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function setRay(cx, cy) { ndc.set((cx / canvas.clientWidth) * 2 - 1, -(cy / canvas.clientHeight) * 2 + 1); raycaster.setFromCamera(ndc, camera); }

function pickHandle(cx, cy) { if (!handles.length) return null; setRay(cx, cy); const hit = raycaster.intersectObjects(handles.map((h) => h.mesh), false)[0]; if (!hit) return null; return handles.find((h) => h.mesh === hit.object); }

function pickPart(cx, cy) { setRay(cx, cy); const hit = raycaster.intersectObjects([...parts.values()].map((p) => p.mesh), true)[0]; if (!hit) return null; for (const p of parts.values()) { let o = hit.object; while (o) { if (o === p.mesh) return p; o = o.parent; } } return null; }

// Target cell on the baseplate or on top of a part face, for placing a new part.
function pickPlace(cx, cy) {
  setRay(cx, cy);
  const objs = [rayGround, ...[...parts.values()].map((p) => p.mesh)];
  const hit = raycaster.intersectObjects(objs, true)[0];
  if (!hit) return null;
  if (hit.object === rayGround) return { x: Math.floor(hit.point.x), y: 0, z: Math.floor(hit.point.z) };
  const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round() : new THREE.Vector3(0, 1, 0);
  const x = Math.floor(hit.point.x + n.x * 0.5), y = Math.floor(hit.point.y + n.y * 0.5), z = Math.floor(hit.point.z + n.z * 0.5);
  return { x, y, z };
}

// Distance (in world units) along `dir` from `point` to where the pointer ray is closest.
function axisParam(point, dir) {
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  const w0 = new THREE.Vector3().subVectors(o, point);
  const b = d.dot(dir), denom = 1 - b * b;
  if (Math.abs(denom) < 1e-4) return 0;
  return (dir.dot(w0) - b * d.dot(w0)) / denom;
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

let tool = { mode: 'block', color: COLORS[5][1], key: 'c-blue' };   // default: place blue boxes
let shape = 'box';
let curColor = COLORS[5][1], curColorKey = 'c-blue';
function selectTool(t) { tool = t; document.querySelectorAll('.pal-item:not(.pal-shape)').forEach((b) => b.classList.toggle('on', b.dataset.key === t.key)); }
function highlightShape() { document.querySelectorAll('.pal-shape').forEach((b) => b.classList.toggle('on', b.dataset.shape === shape)); }
function setShape(s) { shape = s; highlightShape(); selectTool({ mode: 'block', color: curColor, key: curColorKey }); }
function pickColor(col, key) { curColor = col; curColorKey = key; selectTool({ mode: 'block', color: col, key }); }

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

let mode = 'edit';
let drag = null;      // camera / click
let resizing = null;  // active handle drag

canvas.addEventListener('pointerdown', (e) => {
  if (mode === 'play') { pdrag = { x: e.clientX, yaw: player.yaw }; canvas.setPointerCapture(e.pointerId); return; }
  canvas.setPointerCapture(e.pointerId);
  // 1) a resize handle?
  const h = pickHandle(e.clientX, e.clientY);
  if (h && selected) {
    setRay(e.clientX, e.clientY);
    const dir = new THREE.Vector3(h.axis === 'x' ? 1 : 0, h.axis === 'y' ? 1 : 0, h.axis === 'z' ? 1 : 0);
    const startFace = h.side > 0 ? selected[h.axis] + selected[h.axis === 'x' ? 'sx' : h.axis === 'y' ? 'sy' : 'sz'] : selected[h.axis];
    resizing = { h, dir, base: axisParam(h.mesh.position.clone(), dir), startFace, origin: h.mesh.position.clone() };
    return;
  }
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, button: e.button, az: orbit.az, pol: orbit.pol, tx: orbit.target.x, tz: orbit.target.z };
});

canvas.addEventListener('pointermove', (e) => {
  if (mode === 'play') { if (pdrag) player.yaw = pdrag.yaw + (e.clientX - pdrag.x) * 0.006; return; }   // fixed: drag right looks right
  if (resizing) {
    setRay(e.clientX, e.clientY);
    const t = axisParam(resizing.origin, resizing.dir) - resizing.base;
    resizeFace(selected, resizing.h.axis, resizing.h.side, resizing.startFace + t);
    return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
  if (drag.button === 2 || e.shiftKey) {
    const s = orbit.dist * 0.0016;
    orbit.target.x = drag.tx - dx * Math.cos(orbit.az) * s - dy * Math.sin(orbit.az) * s;
    orbit.target.z = drag.tz + dx * Math.sin(orbit.az) * s - dy * Math.cos(orbit.az) * s;
  } else { orbit.az = drag.az - dx * 0.008; orbit.pol = Math.min(Math.PI * 0.49, Math.max(0.12, drag.pol - dy * 0.006)); }
  applyOrbit();
});

canvas.addEventListener('pointerup', (e) => {
  if (mode === 'play') { pdrag = null; return; }
  if (resizing) { resizing = null; return; }
  if (drag && drag.moved <= 5 && drag.button === 0) clickEdit(e.clientX, e.clientY);
  drag = null;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { if (mode === 'play') return; e.preventDefault(); orbit.dist = Math.min(70, Math.max(6, orbit.dist + Math.sign(e.deltaY) * 2.5)); applyOrbit(); }, { passive: false });

function selectable(p) { return p && (p.kind === 'block' || FUNC[p.type]); }
function clickEdit(cx, cy) {
  if (tool.mode === 'erase') { const p = pickPart(cx, cy); if (p) removePart(p.id); return; }
  if (tool.mode === 'select') { const p = pickPart(cx, cy); if (selectable(p)) select(p); else deselect(); return; }
  // clicking an existing selectable part selects it instead of placing
  const hitPart = pickPart(cx, cy);
  if (hitPart && selectable(hitPart) && tool.mode !== 'object') { select(hitPart); return; }
  const t = pickPlace(cx, cy);
  if (!t) return;
  const p = tool.mode === 'block' ? addBlock(tool.color, t.x, t.y, t.z, shape) : addObject(tool.type, t.x, t.y, t.z);
  if (selectable(p)) select(p);   // auto-select so you can stretch / configure immediately
}

/* ---- settings panel for functional parts (the gear) ---- */

function updateGear() { const btn = $('gear'); if (btn) btn.hidden = !(selected && FUNC[selected.type]); }
const ITEM_LABELS = { dough: 'Dough', pizza: 'Pizza', drink: 'Drink', box: 'Box' };
const DIR_LABELS = ['North (+Z)', 'East (+X)', 'South (−Z)', 'West (−X)'];

function openSettings(p) {
  const def = FUNC[p.type]; if (!def) return;
  document.getElementById('eb-dialog')?.remove();
  const dlg = document.createElement('div'); dlg.id = 'eb-dialog'; dlg.className = 'eb-dialog';
  const rows = [];
  const field = (label, input) => { const l = document.createElement('label'); const s = document.createElement('span'); s.textContent = label; l.append(s, input); rows.push(l); return input; };
  const numberInput = (val, min, max, step) => { const i = document.createElement('input'); i.type = 'number'; i.value = val; i.min = min; i.max = max; i.step = step || 1; return i; };
  const selectInput = (opts, val) => { const s = document.createElement('select'); opts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; s.appendChild(o); }); s.value = val; return s; };

  if (p.type === 'spawner') {
    const item = field('Spawns', selectInput(Object.entries(ITEM_LABELS), p.settings.item));
    const interval = field('Every (seconds)', numberInput(p.settings.interval, 0.2, 30, 0.1));
    const max = field('Max at once', numberInput(p.settings.max, 1, 50, 1));
    item.addEventListener('change', () => { p.settings.item = item.value; refreshPartMesh(p); });
    interval.addEventListener('change', () => { p.settings.interval = Math.max(0.2, +interval.value || 2); });
    max.addEventListener('change', () => { p.settings.max = Math.max(1, Math.round(+max.value || 8)); });
  } else if (p.type === 'conveyor') {
    const dir = field('Direction', selectInput(DIR_LABELS.map((t, i) => [i, t]), p.settings.dir));
    const speed = field('Speed', numberInput(p.settings.speed, 0.5, 12, 0.5));
    dir.addEventListener('change', () => { p.settings.dir = +dir.value; refreshPartMesh(p); });
    speed.addEventListener('change', () => { p.settings.speed = Math.max(0.5, +speed.value || 3); });
  }
  const title = document.createElement('div'); title.className = 'eb-dlg-bar'; title.innerHTML = `<span>${def.label} settings</span>`;
  const x = document.createElement('button'); x.textContent = '×'; x.className = 'eb-dlg-x'; x.onclick = () => dlg.remove(); title.appendChild(x);
  const body = document.createElement('div'); body.className = 'eb-dlg-body'; rows.forEach((r) => body.appendChild(r));
  const done = document.createElement('button'); done.className = 'eb-dlg-done'; done.textContent = 'Done'; done.onclick = () => dlg.remove(); body.appendChild(done);
  dlg.append(title, body); document.body.appendChild(dlg);
}

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

function hex(n) { return '#' + n.toString(16).padStart(6, '0'); }
function buildPalette() {
  const wrap = $('palette'); wrap.innerHTML = '';
  wrap.appendChild(head('Tools'));
  const tools = document.createElement('div'); tools.className = 'pal-row';
  const selBtn = mkItem('select', 'Select', 'linear-gradient(135deg,#ff4d4d,#4dff6a,#4d8bff)', () => selectTool({ mode: 'select', key: 'select' }));
  const boxBtn = mkItem('box', 'Box', '#cfd3d8', () => setShape('box'));
  const circBtn = mkItem('circle', 'Circle', 'radial-gradient(circle at 50% 50%,#cfd3d8 58%,transparent 60%)', () => setShape('cylinder'));
  boxBtn.classList.add('pal-shape'); boxBtn.dataset.shape = 'box';
  circBtn.classList.add('pal-shape'); circBtn.dataset.shape = 'cylinder';
  tools.append(selBtn, boxBtn, circBtn); wrap.appendChild(tools);

  wrap.appendChild(head('Part colours'));
  const crow = document.createElement('div'); crow.className = 'pal-row';
  for (const [name, col] of COLORS) crow.appendChild(mkItem('c-' + name, name, hex(col), () => pickColor(col, 'c-' + name)));
  wrap.appendChild(crow);

  wrap.appendChild(head('Objects'));
  const orow = document.createElement('div'); orow.className = 'pal-row';
  const oswatch = { spawn: '#2ecc71', coin: '#ffd24a', bounce: '#ff2d7a', spike: '#d0d3d8' };
  for (const [id, def] of Object.entries(OBJECTS)) orow.appendChild(mkItem('o-' + id, def.label, oswatch[id], () => selectTool({ mode: 'object', type: id, key: 'o-' + id })));
  orow.appendChild(mkItem('erase', 'Eraser', 'repeating-linear-gradient(45deg,#fff,#fff 3px,#f99 3px,#f99 6px)', () => selectTool({ mode: 'erase', key: 'erase' })));
  wrap.appendChild(orow);

  wrap.appendChild(head('Pizza / Logic'));
  const frow = document.createElement('div'); frow.className = 'pal-row';
  const fswatch = { spawner: '#5b6470', conveyor: '#f4c400' };
  for (const [id, def] of Object.entries(FUNC)) frow.appendChild(mkItem('f-' + id, def.label, fswatch[id], () => selectTool({ mode: 'object', type: id, key: 'f-' + id })));
  wrap.appendChild(frow);
  const tipf = document.createElement('div'); tipf.className = 'pal-group'; tipf.style.fontWeight = 'normal'; tipf.style.color = '#444';
  tipf.textContent = 'Place one, click it, then press ⚙ Settings (top bar) to configure it. Set a Spawner over a Conveyor to move items.';
  wrap.appendChild(tipf);

  pickColor(COLORS[5][1], 'c-blue'); highlightShape();
}
function head(t) { const h = document.createElement('div'); h.className = 'pal-group'; h.textContent = t; return h; }
function mkItem(key, label, bg, onClick) {
  const b = document.createElement('button'); b.className = 'pal-item'; b.dataset.key = key; b.title = label;
  b.innerHTML = `<span class="sw" style="background:${bg}"></span><span>${label}</span>`;
  b.addEventListener('click', onClick); return b;
}

/* ------------------------------------------------------------------ */
/* Playtest (open sandbox)                                             */
/* ------------------------------------------------------------------ */

const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), hw: 0.32, height: 1.8, grounded: false, yaw: 0, coins: 0, walk: 0 };

// The avatar: the uploaded GLB character if it loads, otherwise a built noob.
// The GLB is a single static mesh (no skeleton), so it can't swing limbs — it
// gets a procedural walk bounce + lean instead.
const avatar = new THREE.Group(); avatar.visible = false; scene.add(avatar);
const noob = buildNoob(); avatar.add(noob.group);
let charMode = 'noob';           // 'glb' once the model loads
let glbHolder = null;
new GLTFLoader().load('assets/character.glb', (gltf) => {
  const model = gltf.scene;
  let bb = new THREE.Box3().setFromObject(model); const sz = new THREE.Vector3(); bb.getSize(sz);
  model.scale.setScalar(1.8 / (sz.y || 1));
  bb = new THREE.Box3().setFromObject(model);
  model.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  model.rotation.y = -Math.PI / 2;   // this model's front points +x; turn it to face +z (our forward)
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = new THREE.MeshLambertMaterial({ color: 0xc2c6ca }); } });
  glbHolder = new THREE.Group(); glbHolder.add(model); avatar.add(glbHolder);
  noob.group.visible = false; charMode = 'glb';
}, undefined, () => { /* keep the built noob */ });

const keys = {};
let pdrag = null;
addEventListener('keydown', (e) => { keys[e.code] = true; if (mode === 'play' && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });

function collide(axis) {
  const p = player.pos, hw = player.hw, h = player.height;
  const minX = p.x - hw, maxX = p.x + hw, minY = p.y, maxY = p.y + h, minZ = p.z - hw, maxZ = p.z + hw;
  let fix = null, bouncer = false;
  // the baseplate itself is solid ground at y=0 (stops you clipping through it)
  if (axis === 'y' && player.vel.y <= 0 && p.x > -HALF && p.x < HALF && p.z > -HALF && p.z < HALF) fix = 0;
  for (const part of solidParts()) {
    const x0 = part.x, x1 = part.x + part.sx, y0 = part.y, y1 = part.y + part.sy, z0 = part.z, z1 = part.z + part.sz;
    if (maxX <= x0 || minX >= x1 || maxY <= y0 || minY >= y1 || maxZ <= z0 || minZ >= z1) continue;
    if (axis === 'y') { if (player.vel.y <= 0) { if (fix === null || y1 > fix) { fix = y1; bouncer = part.kind === 'bounce'; } } else { if (fix === null || y0 < fix) fix = y0; } }
    else if (axis === 'x') { const c = player.vel.x > 0 ? x0 - hw - 0.001 : x1 + hw + 0.001; if (fix === null || (player.vel.x > 0 ? c < fix : c > fix)) fix = c; }
    else { const c = player.vel.z > 0 ? z0 - hw - 0.001 : z1 + hw + 0.001; if (fix === null || (player.vel.z > 0 ? c < fix : c > fix)) fix = c; }
  }
  if (fix === null) return;
  if (axis === 'y') { if (player.vel.y <= 0) { p.y = fix; player.grounded = true; player.vel.y = bouncer ? 13 : 0; } else { p.y = fix - h - 0.001; player.vel.y = 0; } }
  else if (axis === 'x') { p.x = fix; player.vel.x = 0; }
  else { p.z = fix; player.vel.z = 0; }
}
function respawn() { const s = spawn || { x: 0, y: 1, z: 0 }; player.pos.set(s.x + 0.5, s.y, s.z + 0.5); player.vel.set(0, 0, 0); }

// Runtime items produced by spawners (cleared when you stop playing).
const items = [];
function clearItems() { for (const it of items) worldGroup.remove(it.mesh); items.length = 0; }

function enterPlay() {
  if (mode === 'play') return;
  deselect(); mode = 'play'; player.coins = 0;
  document.getElementById('eb-dialog')?.remove();
  for (const p of parts.values()) { if (p.kind === 'coin') p.mesh.visible = true; if (p.kind === 'spawner') p._t = 0; }
  clearItems();
  respawn(); avatar.visible = true;
  document.body.classList.add('playing'); $('hud-coins').textContent = 'Coins: 0';
}
function exitPlay() { mode = 'edit'; avatar.visible = false; clearItems(); document.body.classList.remove('playing'); applyOrbit(); }

// Highest solid surface at (x,z): top of the tallest part covering it, or the baseplate.
function supportTop(x, z) {
  let top = (x > -HALF && x < HALF && z > -HALF && z < HALF) ? 0 : -Infinity;
  for (const p of solidParts()) if (x >= p.x && x < p.x + p.sx && z >= p.z && z < p.z + p.sz) top = Math.max(top, p.y + p.sy);
  return top;
}
function conveyorUnder(it) {
  for (const p of parts.values()) {
    if (p.kind !== 'conveyor') continue;
    if (it.pos.x >= p.x && it.pos.x < p.x + p.sx && it.pos.z >= p.z && it.pos.z < p.z + p.sz && Math.abs(it.pos.y - (p.y + p.sy)) < 0.2) return p;
  }
  return null;
}
function spawnItem(src) {
  const it = { src: src.id, type: src.settings.item, pos: new THREE.Vector3(src.x + src.sx / 2, src.y + src.sy + 0.3, src.z + src.sz / 2), vel: new THREE.Vector3(), mesh: makeItem(src.settings.item) };
  it.mesh.position.copy(it.pos); worldGroup.add(it.mesh); items.push(it);
}
function updateSim(dt) {
  for (const p of parts.values()) {
    if (p.kind !== 'spawner') continue;
    p._t = (p._t || 0) + dt;
    if (p._t >= p.settings.interval) {
      p._t = 0;
      if (items.filter((it) => it.src === p.id).length < p.settings.max) spawnItem(p);
    }
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const belt = conveyorUnder(it);
    if (belt) { const d = DIRS[belt.settings.dir]; it.vel.x = d[0] * belt.settings.speed; it.vel.z = d[1] * belt.settings.speed; }
    else { it.vel.x *= 0.82; it.vel.z *= 0.82; }
    it.vel.y -= 26 * dt;
    it.pos.x += it.vel.x * dt; it.pos.z += it.vel.z * dt; it.pos.y += it.vel.y * dt;
    const top = supportTop(it.pos.x, it.pos.z);
    if (it.pos.y <= top) { it.pos.y = top; it.vel.y = 0; }
    if (it.pos.y < -14 || Math.abs(it.pos.x) > HALF + 2 || Math.abs(it.pos.z) > HALF + 2) { worldGroup.remove(it.mesh); items.splice(i, 1); continue; }
    it.mesh.position.copy(it.pos); it.mesh.rotation.y += dt * 0.6;
  }
}

function stepPlay(dt) {
  dt = Math.min(dt, 0.033);
  updateSim(dt);   // spawners + conveyors + items
  const run = (keys['ShiftLeft'] || keys['ShiftRight']) ? 1.7 : 1;
  const speed = 5.4 * run;
  let ix = 0, iz = 0;
  if (keys['KeyW'] || keys['ArrowUp']) iz -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) iz += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) ix += 1;
  const moving = ix || iz; const len = Math.hypot(ix, iz) || 1;
  const sinY = Math.sin(player.yaw), cosY = Math.cos(player.yaw);
  player.vel.x = moving ? ((ix / len) * cosY - (iz / len) * sinY) * speed : 0;
  player.vel.z = moving ? (-(ix / len) * sinY - (iz / len) * cosY) * speed : 0;   // W = into the screen
  player.vel.y -= 26 * dt;
  if (keys['Space'] && player.grounded) { player.vel.y = 9.6; player.grounded = false; }

  player.grounded = false;
  player.pos.x += player.vel.x * dt; collide('x');
  player.pos.z += player.vel.z * dt; collide('z');
  player.pos.y += player.vel.y * dt; collide('y');
  if (player.pos.y < -12) respawn();

  // triggers (coins / hazards) — box overlap
  for (const p of parts.values()) {
    if (p.kind !== 'coin' && p.kind !== 'hazard') continue;
    if (player.pos.x > p.x && player.pos.x < p.x + 1 && player.pos.z > p.z && player.pos.z < p.z + 1 && player.pos.y < p.y + 1.2 && player.pos.y + player.height > p.y) {
      if (p.kind === 'coin' && p.mesh.visible) { p.mesh.visible = false; player.coins++; $('hud-coins').textContent = 'Coins: ' + player.coins; }
      if (p.kind === 'hazard') respawn();
    }
  }

  avatar.position.copy(player.pos);
  if (moving) avatar.rotation.y = Math.atan2(player.vel.x, player.vel.z);
  player.walk += dt * (moving ? (run > 1 ? 14 : 9) : 6);
  if (charMode === 'noob') {
    const sw = Math.sin(player.walk) * (moving ? 0.5 : 0.08);
    noob.limbs.lleg.rotation.x = sw; noob.limbs.rleg.rotation.x = -sw;
    noob.limbs.larm.rotation.x = -sw; noob.limbs.rarm.rotation.x = sw;
  } else if (glbHolder) {
    // no skeleton, so just a subtle upright bob while moving (no lean)
    glbHolder.position.y = moving ? Math.abs(Math.sin(player.walk)) * 0.045 : 0;
    glbHolder.rotation.x = 0;
  }

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
$('gear').addEventListener('click', () => { if (selected && FUNC[selected.type]) openSettings(selected); });

let last = 0;
function frame(now) {
  const t = now / 1000, dt = last ? t - last : 0.016; last = t;
  for (const p of parts.values()) if (p.spin && p.mesh.visible) p.mesh.rotation.y += dt * 2;
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
    addBlock, addObject, clearAll, starterScene, select, deselect,
    resizeFace: (axis, side, v) => { if (selected) resizeFace(selected, axis, side, v); },
    enterPlay, exitPlay, step: stepPlay, keys, player, setYaw: (v) => { player.yaw = v; },
    orbit, applyOrbit, parts, items, refreshPartMesh, avatar, glb: () => glbHolder, charMode: () => charMode,
    showAvatar: (yaw) => { avatar.visible = true; avatar.position.set(0, 0, 0); avatar.rotation.y = yaw || 0; },
    selId: () => selected && selected.id,
    partInfo: () => selected && { x: selected.x, y: selected.y, z: selected.z, sx: selected.sx, sy: selected.sy, sz: selected.sz },
    state: () => ({ mode, parts: parts.size, spawn, pos: player.pos.toArray(), coins: player.coins, grounded: player.grounded }),
  };
}
