import * as THREE from './vendor/three.module.js';

// ---------------------------------------------------------------------------
// COREBOUND — a one-man deep-earth mining game
// ---------------------------------------------------------------------------

const CORE_DEPTH = 6371;
const DEPTH_PER_BREAK = 200;
const START_CASH = 240;
const START_FUEL = 42;
const MAX_FUEL = 60;
const START_POS = new THREE.Vector3(0, 0, -16);

const STRATA = [
  { min: 0,    max: 1400, name: 'CRUST / SEDIMENT', short: 'CRUST',       rock: 0x73563a, wall: 0x4b3728, accent: 0xffb24a, fog: 0x211917, dust: 0xc89b67 },
  { min: 1400, max: 3000, name: 'GRANITE SHELF',    short: 'GRANITE',     rock: 0x5d5d5f, wall: 0x3b3b3e, accent: 0x7ae7ff, fog: 0x171a1e, dust: 0xaab4b8 },
  { min: 3000, max: 4700, name: 'BASALT VAULT',     short: 'BASALT',      rock: 0x353d43, wall: 0x20262b, accent: 0x63d7ff, fog: 0x0e1418, dust: 0x7897a1 },
  { min: 4700, max: 5800, name: 'MANTLE / MAGMA',   short: 'MANTLE',      rock: 0x612d20, wall: 0x391611, accent: 0xff6a2a, fog: 0x1b0b08, dust: 0xff8b4d },
  { min: 5800, max: 6371, name: 'OUTER CORE',       short: 'CORE',        rock: 0x5a2e18, wall: 0x2b120b, accent: 0xffd082, fog: 0x190805, dust: 0xffc15c },
];

const TIERS = [
  null,
  { name: 'Mk I',   cap: 1400, speed: 1.00, cost: 0 },
  { name: 'Mk II',  cap: 3000, speed: 1.16, cost: 140 },
  { name: 'Mk III', cap: 4700, speed: 1.34, cost: 300 },
  { name: 'Mk IV',  cap: CORE_DEPTH, speed: 1.52, cost: 480 },
];

const state = {
  started: false,
  phase: 'intro',          // intro | surface | underground | core
  modal: null,
  transitioning: false,
  cash: START_CASH,
  fuel: START_FUEL,
  maxFuel: MAX_FUEL,
  tier: 1,
  depth: 0,
  breaks: 0,
  rockProgress: 0,
  fuelEfficiency: 1,
  oreMultiplier: 1,
  drillSpeed: 0.66,
  stuck: false,
  drilling: false,
  aimAtFace: false,
  hover: null,
  time: 0,
  runTime: 0,
  coreTimer: 0,
  noiseWarnings: new Map(),
  damage: 0,
};

const $ = (id) => document.getElementById(id);
const dom = {
  canvas: $('world'), intro: $('intro'), start: $('start-btn'), pause: $('pause'), resume: $('resume-btn'),
  modal: $('modal'), modalPanel: $('modal-panel'), modalContent: $('modal-content'), modalClose: $('modal-close'),
  depthValue: $('depth-value'), depthFill: $('depth-fill'), depthMarker: $('depth-marker'), depthPercent: $('depth-percent'),
  layerName: $('layer-name'), cashValue: $('cash-value'), fuelValue: $('fuel-value'), tierValue: $('tier-value'),
  objective: $('objective-text'), prompt: $('prompt'), promptText: $('prompt-text'), crosshair: $('crosshair'),
  drillRing: $('drill-ring'), mineReadout: $('mine-readout'), mineLayer: $('mine-layer'),
  mineProgress: $('mine-progress-text'), rockFill: $('rock-fill'), mineHint: $('mine-hint'),
  toasts: $('toast-stack'), statusDot: $('status-dot'), statusText: $('status-text'), modeText: $('mode-text'),
  fade: $('fade'), flash: $('flash'),
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const format = (n) => Math.round(n).toLocaleString('en-US');

function currentStrata(depth = state.depth) {
  for (let i = STRATA.length - 1; i >= 0; i--) if (depth >= STRATA[i].min) return STRATA[i];
  return STRATA[0];
}
function currentStrataIndex(depth = state.depth) {
  for (let i = STRATA.length - 1; i >= 0; i--) if (depth >= STRATA[i].min) return i;
  return 0;
}
function tierCap(tier = state.tier) { return TIERS[tier].cap; }
function currency(cents) { return '$' + format(cents); }
function roman(n) { return ['0', 'I', 'II', 'III', 'IV'][n] || 'I'; }

// ---------------------------------------------------------------------------
// Renderer, scene, camera
// ---------------------------------------------------------------------------

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  document.body.innerHTML = '<div style="padding:40px;font:16px monospace;color:#ffb24a">COREBOUND needs WebGL. ' + err.message + '</div>';
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1516);
scene.fog = new THREE.Fog(0x211917, 42, 145);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 320);
camera.rotation.order = 'YXZ';
camera.position.set(0, 1.72, START_POS.z);
scene.add(camera);

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------

function canvasTexture(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

function speckle(ctx, w, h, count, colors, min = 1, max = 3, alpha = 0.6) {
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = alpha * rand(0.3, 1);
    ctx.fillStyle = pick(colors);
    const s = rand(min, max);
    ctx.fillRect(rand(0, w), rand(0, h), s, s);
  }
  ctx.globalAlpha = 1;
}

const groundTexture = canvasTexture(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#3a2d22'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    ctx.globalAlpha = rand(0.03, 0.13);
    ctx.fillStyle = pick(['#7b5c3b', '#211811', '#56412c', '#8b6a46']);
    ctx.beginPath();
    ctx.ellipse(rand(0, w), rand(0, h), rand(12, 90), rand(4, 35), rand(0, Math.PI), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  speckle(ctx, w, h, 1500, ['#9b7b55', '#1a130e', '#6c5136', '#c19a63'], 1, 3, 0.48);
  ctx.globalAlpha = 0.2;
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = i % 3 ? '#17110d' : '#8e7151';
    ctx.lineWidth = rand(0.6, 1.6);
    ctx.beginPath();
    let x = rand(0, w), y = rand(0, h);
    ctx.moveTo(x, y);
    for (let j = 0; j < 6; j++) { x += rand(-22, 22); y += rand(-18, 18); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}, 12);

const rockTexture = canvasTexture(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#5a4937'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 75; i++) {
    ctx.globalAlpha = rand(0.06, 0.2);
    ctx.fillStyle = pick(['#a08766', '#2b2017', '#705941', '#b99a72']);
    ctx.beginPath();
    ctx.arc(rand(0, w), rand(0, h), rand(5, 46), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < 36; i++) {
    ctx.strokeStyle = pick(['#241b13', '#ad8f64']);
    ctx.lineWidth = rand(0.5, 1.4);
    ctx.beginPath();
    let x = rand(0, w), y = rand(0, h);
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) { x += rand(-30, 30); y += rand(-15, 20); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  speckle(ctx, w, h, 1000, ['#2b2118', '#b29670', '#755c40', '#ddc196'], 1, 2, 0.5);
}, 2);

const tunnelTexture = canvasTexture(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#3d3329'; ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 26) {
    ctx.globalAlpha = rand(0.07, 0.14);
    ctx.fillStyle = y % 52 === 0 ? '#11100d' : '#6a5843';
    ctx.fillRect(0, y, w, rand(9, 23));
  }
  speckle(ctx, w, h, 1100, ['#87745a', '#151310', '#584533'], 1, 3, 0.55);
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 28; i++) {
    ctx.strokeStyle = '#0b0a08'; ctx.lineWidth = rand(0.7, 2.1);
    ctx.beginPath();
    let x = rand(0, w), y = rand(0, h); ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) { x += rand(-25, 25); y += rand(-20, 20); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}, 3);

const glowTexture = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.14, 'rgba(255,244,214,0.75)');
  g.addColorStop(0.4, 'rgba(255,170,70,0.22)');
  g.addColorStop(1, 'rgba(255,110,20,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();

function makeGlow(color = 0xffb24a, scale = 2, opacity = 0.8) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

function makeSign(title, sub, accent = '#75e8ff', w = 640, h = 176) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b1016'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let y = 8; y < h; y += 9) ctx.fillRect(0, y, w, 1);
  ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.globalAlpha = 0.8; ctx.strokeRect(7, 7, w - 14, h - 14);
  ctx.globalAlpha = 0.38; ctx.lineWidth = 1; ctx.strokeRect(15, 15, w - 30, h - 30);
  ctx.globalAlpha = 1;
  ctx.fillStyle = accent; ctx.fillRect(34, 39, 8, h - 78);
  ctx.shadowColor = accent; ctx.shadowBlur = 18;
  ctx.fillStyle = '#f0f7f8';
  ctx.font = '900 58px "Arial Narrow", "Helvetica Neue", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 58, h * 0.44);
  ctx.shadowBlur = 0;
  ctx.fillStyle = accent;
  ctx.font = '700 17px "Courier New", monospace';
  ctx.fillText(sub, 60, h * 0.74);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeScreenTexture(label, title, accent = '#75e8ff') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 320;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#081116'; ctx.fillRect(0, 0, 512, 320);
  ctx.strokeStyle = 'rgba(117,232,255,0.15)'; ctx.lineWidth = 1;
  for (let x = 0; x < 512; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 320); ctx.stroke(); }
  for (let y = 0; y < 320; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
  ctx.fillStyle = accent; ctx.globalAlpha = 0.9;
  ctx.font = '700 13px "Courier New", monospace'; ctx.fillText(label, 26, 38);
  ctx.globalAlpha = 1;
  ctx.font = '900 37px "Arial Narrow", sans-serif'; ctx.fillStyle = '#e8f8fa';
  ctx.fillText(title, 26, 91);
  ctx.fillStyle = accent; ctx.fillRect(26, 113, 168, 3);
  // faux graph
  ctx.strokeStyle = accent; ctx.globalAlpha = 0.6; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i < 20; i++) {
    const x = 26 + i * 23, y = 250 - Math.sin(i * 0.65) * 45 - rand(0, 18);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(117,232,255,0.35)'; ctx.font = '600 11px "Courier New", monospace';
  ctx.fillText('SYS NOMINAL   //   LINK 09', 26, 290);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

const mats = {
  ground: new THREE.MeshStandardMaterial({ map: groundTexture, color: 0xc7b09b, roughness: 1, metalness: 0 }),
  rock: new THREE.MeshStandardMaterial({ map: rockTexture, color: 0x8a6c4c, roughness: 1 }),
  darkRock: new THREE.MeshStandardMaterial({ map: rockTexture, color: 0x3e342b, roughness: 1 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x555a5b, roughness: 0.93 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8b9295, roughness: 0.44, metalness: 0.76 }),
  darkSteel: new THREE.MeshStandardMaterial({ color: 0x30373b, roughness: 0.5, metalness: 0.74 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x8e4e2d, roughness: 0.78, metalness: 0.25 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x5b4029, roughness: 0.9 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xe0a11b, roughness: 0.58, metalness: 0.25 }),
  white: new THREE.MeshStandardMaterial({ color: 0xcbd3d2, roughness: 0.6, metalness: 0.15 }),
  black: new THREE.MeshStandardMaterial({ color: 0x14181b, roughness: 0.7 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x8bdfef, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.24, side: THREE.DoubleSide }),
  cyanEmit: new THREE.MeshStandardMaterial({ color: 0x10343c, emissive: 0x66dff5, emissiveIntensity: 2.4, roughness: 0.35 }),
  amberEmit: new THREE.MeshStandardMaterial({ color: 0x3c210d, emissive: 0xff9e35, emissiveIntensity: 2.2, roughness: 0.4 }),
  redEmit: new THREE.MeshStandardMaterial({ color: 0x37110b, emissive: 0xff4c24, emissiveIntensity: 2, roughness: 0.4 }),
  greenEmit: new THREE.MeshStandardMaterial({ color: 0x0d2c18, emissive: 0x7df7a6, emissiveIntensity: 1.8, roughness: 0.4 }),
};

const surface = new THREE.Group();
const underground = new THREE.Group();
scene.add(surface, underground);
underground.visible = false;

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function mesh(geo, mat, x = 0, y = 0, z = 0, cast = false, receive = false) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
function box(w, h, d, mat, x, y, z, cast = false, receive = false) {
  return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, cast, receive);
}
function cylinder(rTop, rBot, h, seg, mat, x, y, z, cast = false, receive = false) {
  return mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat, x, y, z, cast, receive);
}
function beamBetween(a, b, radius, mat, seg = 6) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, seg), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  return m;
}
function addBeamBetween(group, a, b, radius, mat, seg = 6) {
  const m = beamBetween(new THREE.Vector3(...a), new THREE.Vector3(...b), radius, mat, seg);
  group.add(m); return m;
}
function addGlow(parent, color, scale, x, y, z, opacity = 0.85) {
  const s = makeGlow(color, scale, opacity);
  s.position.set(x, y, z);
  parent.add(s);
  return s;
}

// ---------------------------------------------------------------------------
// Surface compound and evolving underground bore
// ---------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xb9c8d0, 0x26180e, 1.15); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd5a0, 2.2); sun.position.set(-18,30,12); sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-35; sun.shadow.camera.right=35; sun.shadow.camera.top=35; sun.shadow.camera.bottom=-35; scene.add(sun);
const siteLamp=new THREE.PointLight(0xffa844,1.3,25); siteLamp.position.set(0,5,-18); scene.add(siteLamp);
function addBox(g,w,h,d,m,x,y,z,cast=true,receive=true){const o=box(w,h,d,m,x,y,z,cast,receive);g.add(o);return o;}
function addCyl(g,rt,rb,h,seg,m,x,y,z){const o=cylinder(rt,rb,h,seg,m,x,y,z,true,true);g.add(o);return o;}
function addLamp(g,color,x,y,z,intensity=1.3){const l=new THREE.PointLight(color,intensity,15);l.position.set(x,y,z);g.add(l);const o=mesh(new THREE.SphereGeometry(.12,10,8),new THREE.MeshBasicMaterial({color}),x,y,z);g.add(o);}
function addSign(g,title,sub,accent,x,y,z,w=6){const t=makeSign(title,sub,accent,640,176);const o=mesh(new THREE.PlaneGeometry(w,w*.275),new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide}),x,y,z);g.add(o);}
function buildSurface(){
 surface.add(mesh(new THREE.PlaneGeometry(180,180),mats.ground,0,-.14,0,false,true));
 const asphalt=new THREE.MeshStandardMaterial({color:0x282b2a,roughness:.96}), line=new THREE.MeshStandardMaterial({color:0xbba77f});
 addBox(surface,74,.08,24,asphalt,0,-.06,-12,false,true);
 for(let z=-23;z<1;z+=5)addBox(surface,.13,.02,2.4,line,0,.002,z,false,false);
 for(let i=0;i<42;i++){const r=rand(.4,1.2),o=mesh(new THREE.DodecahedronGeometry(r,0),i%3?mats.darkRock:mats.rock,rand(-38,38),-.02+r*.25,rand(-34,18),true,true);o.rotation.set(rand(0,3),rand(0,3),rand(0,3));surface.add(o);}
 const lab=new THREE.Group();lab.position.set(-12,0,-8);surface.add(lab);
 addBox(lab,11,4.4,8,mats.concrete,0,2.2,0);addBox(lab,11.5,.28,8.5,mats.darkSteel,0,4.48,0);
 addBox(lab,4.2,2.1,.16,mats.glass,-2.5,2.4,-4.08,false,false);addBox(lab,4.2,2.1,.16,mats.glass,2.5,2.4,-4.08,false,false);
 addBox(lab,1.6,2.8,.22,mats.darkSteel,0,1.45,-4.12);addBox(lab,1.3,1.4,.16,mats.cyanEmit,0,2.6,-4.25,false,false);
 addSign(lab,'SCIENCE LAB','DRILL SYSTEMS // RESEARCH','#75e8ff',0,4.95,-4.2,6.7);addLamp(lab,0x68dffa,-4.6,3.8,-3.3);addLamp(lab,0x68dffa,4.6,3.8,-3.3);
 addCyl(lab,.34,.42,1,8,mats.darkSteel,-3.7,5,1.4);addBox(lab,1.2,1.5,.55,mats.darkSteel,-6.1,.85,-1.7);addBox(lab,.95,.74,.06,mats.cyanEmit,-6.1,1.13,-2,false,false);
 const shop=new THREE.Group();shop.position.set(12,0,-8);surface.add(shop);
 addBox(shop,10,4.1,8,mats.rust,0,2.05,0);addBox(shop,10.6,.28,8.6,mats.darkSteel,0,4.2,0);
 addBox(shop,7.8,2.25,.14,mats.darkSteel,0,2.15,-4.08);addBox(shop,4.8,1.35,.12,mats.amberEmit,0,2.4,-4.2,false,false);
 addSign(shop,'DIESEL DEPOT','FUEL & LUBRICANTS // OPEN','#ffb24a',0,4.72,-4.2,6.5);
 for(let i=0;i<4;i++)addCyl(shop,.42,.42,1.25,12,i%2?mats.yellow:mats.darkSteel,-3.4+i*.9,.63,2.4);
 addBox(shop,1.1,1.7,.5,mats.darkSteel,6,.85,-1.5);addBox(shop,.9,.8,.06,mats.amberEmit,6,1.1,-1.78,false,false);
 const rig=new THREE.Group();rig.position.set(0,0,-24);surface.add(rig);
 addBox(rig,13,.45,12,mats.darkSteel,0,.05,0);addBox(rig,7.5,1.1,6.5,mats.yellow,0,.85,0);addBox(rig,5.5,.28,5.3,mats.black,0,1.5,0);
 for(const x of [-3.4,3.4])for(const z of [-2.7,2.7])addBox(rig,.34,5,.34,mats.steel,x,3.8,z);
 addBeamBetween(rig,[-3.4,6.3,-2.7],[3.4,6.3,2.7],.14,mats.steel,8);addBeamBetween(rig,[3.4,6.3,-2.7],[-3.4,6.3,2.7],.14,mats.steel,8);
 addBox(rig,1.35,.4,1.35,mats.darkSteel,0,6.7,0);addCyl(rig,.48,.48,2.3,12,mats.steel,0,5,0);addCyl(rig,.24,.24,2.8,10,mats.yellow,0,2,0);
 addBox(rig,4.4,.18,4.4,mats.black,0,.33,0);rig.add(cylinder(2.8,2.8,.2,32,mats.black,0,.12,0));
 const rim=new THREE.Mesh(new THREE.TorusGeometry(2.8,.2,8,36),mats.yellow);rim.rotation.x=Math.PI/2;rim.position.y=.25;rig.add(rim);
 addSign(rig,'COREBOUND // 09','SHAFT ACCESS · 6,371 m','#ffb24a',0,8.1,-3.15,7.1);addLamp(rig,0xffb24a,-5.7,3.2,-4.5,2);addLamp(rig,0xffb24a,5.7,3.2,-4.5,2);
 for(let x=-32;x<=32;x+=4){addBox(surface,.12,1.25,.12,mats.darkSteel,x,.62,4);addBox(surface,.12,1.25,.12,mats.darkSteel,x,.62,-34);}
 for(const z of [-34,4])addBox(surface,65,.12,.12,mats.darkSteel,0,.8,z);
 for(const x of [-22,22]){addBox(surface,.2,6,.2,mats.steel,x,3,-16);addBox(surface,.5,.5,.5,mats.amberEmit,x,6.1,-16);addLamp(surface,0xffb24a,x,5.9,-16,1.1);}
 for(let i=0;i<18;i++){const x=rand(-72,72),z=rand(-85,-40),h=rand(5,18);addBox(surface,rand(6,15),h,rand(5,12),i%2?mats.darkRock:mats.rock,x,h/2-.1,z);}
}
const tunnelBits=new THREE.Group();underground.add(tunnelBits);
const mineFaceMat=new THREE.MeshStandardMaterial({color:0x73563a,map:rockTexture,roughness:1});
let mineFace;
function buildUnderground(){
 underground.add(mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x161310,roughness:1}),0,-.2,0,false,true));
 const wallMat=new THREE.MeshStandardMaterial({color:0x4b3728,map:tunnelTexture,roughness:1});
 underground.add(box(14,8,120,wallMat,-7,3.8,-43,true,true));underground.add(box(14,8,120,wallMat,7,3.8,-43,true,true));
 underground.add(box(14,.8,120,mats.darkSteel,0,7.8,-43,false,true));underground.add(box(14,.8,120,mats.darkSteel,0,-.2,-43,false,true));
 mineFace=new THREE.Mesh(new THREE.BoxGeometry(13.8,7.4,.9),mineFaceMat);mineFace.position.set(0,3.5,-11);mineFace.receiveShadow=true;mineFace.castShadow=true;underground.add(mineFace);
 const frameMat=new THREE.MeshStandardMaterial({color:0x353a3b,roughness:.72,metalness:.5});
 for(let z=2;z>-106;z-=6){const arch=new THREE.Group();arch.position.z=z;for(const x of [-6.5,6.5])arch.add(box(.32,7.1,.32,frameMat,x,3.45,0));arch.add(box(13.3,.32,.32,frameMat,0,7,0));for(let i=0;i<6;i++)arch.add(box(.11,.12,.12,mats.yellow,-5.2+i*2.08,6.65,.22));tunnelBits.add(arch);}
 for(let z=0;z>-105;z-=12){addLamp(underground,0xffa23c,-5.7,6.1,z,1);addLamp(underground,0x6adcf2,5.7,6.1,z,.65);}
 for(let z=0;z>-105;z-=5)underground.add(box(.6,.5,4,mats.darkSteel,5,7,z-2));
 for(let i=0;i<18;i++){const o=mesh(new THREE.DodecahedronGeometry(rand(.08,.23),0),new THREE.MeshStandardMaterial({color:pick([0x9b6b39,0x85d7df,0xe29b54,0x79868b]),emissive:0x201306,roughness:.72,metalness:.18}),rand(-5.6,5.6),rand(.5,6.8),-11.52,true,true);tunnelBits.add(o);}
}
buildSurface();buildUnderground();

// ---------------------------------------------------------------------------
// Game state, UI and progression
// ---------------------------------------------------------------------------
const keys = new Set();
const raycaster = new THREE.Raycaster(); raycaster.far = 18;
let yaw=0, pitch=0, mouseDown=false, toastTimer=0, lastTime=performance.now();
const interactions = [
  {id:'lab',label:'ENTER SCIENCE LAB',pos:new THREE.Vector3(-12,0,-13),radius:4},
  {id:'shop',label:'OPEN DIESEL DEPOT',pos:new THREE.Vector3(12,0,-13),radius:4},
  {id:'rig',label:'DESCEND INTO THE SHAFT',pos:new THREE.Vector3(0,0,-20),radius:5},
];

function toast(text, type='', big=false) {
  const el=document.createElement('div'); el.className='toast '+type+(big?' big':''); el.textContent=text; dom.toasts.appendChild(el);
  while(dom.toasts.children.length>3) dom.toasts.firstElementChild.remove();
  window.setTimeout(()=>{el.classList.add('out');window.setTimeout(()=>el.remove(),360);},2600);
}
function setStatus(text, tone='') { dom.statusText.textContent=text; dom.statusDot.className='status-dot'+(tone?' '+tone:''); }
function setObjective(text) { dom.objective.textContent=text; }
function updateHUD() {
  const pct=state.depth/CORE_DEPTH*100, strata=currentStrata();
  dom.depthValue.textContent=format(state.depth); dom.depthFill.style.width=pct+'%'; dom.depthMarker.style.left=pct+'%';
  dom.depthPercent.textContent=pct.toFixed(1)+'% TO CORE'; dom.layerName.textContent=state.depth===0?'SURFACE / CRUST':strata.name;
  dom.layerName.style.color='#'+strata.accent.toString(16).padStart(6,'0');
  dom.cashValue.textContent=format(state.cash); dom.fuelValue.textContent=Math.floor(state.fuel); dom.tierValue.textContent=roman(state.tier);
  dom.mineLayer.textContent=strata.short; dom.mineProgress.textContent=Math.floor(state.rockProgress*100)+'%'; dom.rockFill.style.width=(state.rockProgress*100)+'%';
  dom.modeText.textContent=state.phase==='surface'?'SURFACE OPERATIONS':state.phase==='core'?'CORE CHAMBER':'UNDERGROUND // '+strata.short;
  document.body.classList.toggle('underground',state.phase==='underground'||state.phase==='core');
  dom.mineHint.textContent=state.stuck?'DRILL TIER LIMIT · RETURN TO LAB':'AIM AT THE FACE · HOLD LMB TO DRILL';
  dom.mineReadout.classList.toggle('locked',state.stuck);
}
function showModal(html, kind) {
  state.modal=kind; mouseDown=false; dom.crosshair.classList.remove('drilling'); dom.modalContent.innerHTML=html; dom.modal.classList.remove('hidden');
  if(document.pointerLockElement) document.exitPointerLock();
  dom.modalClose.focus();
}
function closeModal() { state.modal=null; dom.modal.classList.add('hidden'); if(state.started && !state.pause) dom.canvas.requestPointerLock?.(); }
function wallet() { return `<div class="menu-wallet"><span>AVAILABLE SCRIP</span><strong>${currency(state.cash)}</strong><small> SITE 09 ACCOUNT</small></div>`; }
function labMenu() {
  const upgrades=TIERS.slice(2).map((tier,i)=>{
    const n=i+2, owned=state.tier>=n, available=state.depth>=TIERS[n-1].cap, affordable=state.cash>=tier.cost, locked=!available;
    const action=owned?`<button class="buy-btn owned" disabled>INSTALLED <span>✓</span></button>`:
      `<button class="buy-btn" data-upgrade="${n}" ${locked||!affordable?'disabled':''}>${locked?'DEPTH LOCKED':!affordable?'INSUFFICIENT SCRIP':'INSTALL UPGRADE'} <span>${currency(tier.cost)}</span></button>`;
    return `<article class="upgrade-card ${i===0?'primary-card':''} ${locked?'locked':''}"><span class="card-num">0${n}</span><div class="card-icon">M${n}</div><h3>${tier.name} Bore Head</h3><p>${n===2?'Hardened carbide teeth open the granite shelf.':'Thermal-shielded rotary head for the basalt vault and mantle.'}</p><div class="card-stat"><span>DEPTH RATING</span><b>${format(tier.cap)} m</b></div><div class="card-stat"><span>DRILL OUTPUT</span><b>+${Math.round((tier.speed-1)*100)}%</b></div>${action}</article>`;
  }).join('');
  const fuelUpgrade=`<article class="upgrade-card"><span class="card-num">AUX</span><div class="card-icon amber">+</div><h3>Efficiency package</h3><p>Calibrated injector and heat exchanger. Reduce diesel use by 20% for the rest of the shift.</p><div class="card-stat"><span>FUEL ECONOMY</span><b>+20%</b></div><button class="buy-btn amber" data-upgrade="efficiency" ${state.fuelEfficiency>1?'disabled':''}>${state.fuelEfficiency>1?'INSTALLED':'INSTALL'} <span>$180</span></button></article>`;
  showModal(`<header class="menu-head"><div><div class="menu-kicker">RESEARCH & DEVELOPMENT // WEST PAD</div><h2 id="modal-title">SCIENCE LAB</h2><p>Authorize equipment upgrades for the next geological boundary.</p></div>${wallet()}</header><div class="menu-body"><div class="menu-section-title">DRILL PLATFORM <span>SELECT AN AVAILABLE PACKAGE</span></div><div class="upgrade-grid">${upgrades}${fuelUpgrade}</div><div class="menu-tip"><b>FIELD NOTE</b><span>Mining beyond your current rig rating will damage the bore head. Reach each depth rating, return here, and install the next Mk tier.</span></div></div>`, 'lab');
  dom.modalContent.querySelectorAll('[data-upgrade]').forEach(btn=>btn.addEventListener('click',()=>buyUpgrade(btn.dataset.upgrade)));
}
function shopMenu() {
  const packs=[{litres:20,cost:45,name:'Field can',desc:'A quick top-up for a short run.'},{litres:45,cost:90,name:'Drum refill',desc:'The dependable choice for a long descent.'},{litres:60,cost:115,name:'Full tank',desc:'Maximum capacity. Best value per litre.'}];
  const cards=packs.map((p,i)=>`<article class="shop-card ${i===1?'featured':''}"><div class="barrel-icon"></div><h3>${p.name}</h3><span class="litres">${p.litres} L DIESEL</span><p>${p.desc}</p><strong class="price">${currency(p.cost)}</strong><button class="buy-btn amber" data-fuel="${i}" ${state.fuel>=state.maxFuel?'disabled':''}>${state.fuel>=state.maxFuel?'TANK FULL':'PURCHASE'} <span>${currency(p.cost)}</span></button></article>`).join('');
  showModal(`<header class="menu-head shop-head"><div><div class="menu-kicker">FUEL & LUBRICANTS // EAST PAD</div><h2 id="modal-title">DIESEL DEPOT</h2><p>Keep the turbine fed. Unused fuel stays in the tank when you return to the surface.</p></div>${wallet()}</header><div class="menu-body"><div class="fuel-gauge"><span class="micro-label">CURRENT TANK</span><span class="big-number">${Math.floor(state.fuel)} <small>/ ${state.maxFuel} L</small></span><div class="fuel-note">${state.fuel<12?'LOW RESERVE — REFUEL BEFORE DESCENT':'Diesel blend D-09 · rated for deep-bore turbines'}</div><div class="gauge-track"><div class="gauge-fill" style="width:${state.fuel/state.maxFuel*100}%"></div></div></div><div class="shop-grid">${cards}</div><div class="shop-foot"><span>DEPOT RATE <b>$2.00 / L AVG.</b></span><span>PAYMENT <b>SITE 09 SCRIP</b></span><span>CAPACITY <b>${state.maxFuel} L</b></span></div></div>`, 'shop');
  dom.modalContent.querySelectorAll('[data-fuel]').forEach(btn=>btn.addEventListener('click',()=>buyFuel(Number(btn.dataset.fuel))));
}
function buyUpgrade(which) {
  if(which==='efficiency') { if(state.cash<180||state.fuelEfficiency>1)return; state.cash-=180;state.fuelEfficiency=1.25;toast('INJECTOR CALIBRATED · FUEL ECONOMY +20%','good'); }
  else { const n=Number(which), t=TIERS[n]; if(!t||state.tier>=n||state.cash<t.cost||state.depth<TIERS[n-1].cap)return; state.cash-=t.cost;state.tier=n;state.drillSpeed=0.66*t.speed;state.stuck=false;toast(`${t.name.toUpperCase()} BORE HEAD INSTALLED`,'good',true); }
  updateHUD(); labMenu();
}
function buyFuel(index) {
  const packs=[{litres:20,cost:45},{litres:45,cost:90},{litres:60,cost:115}], p=packs[index];
  if(!p||state.cash<p.cost||state.fuel>=state.maxFuel)return;
  const gained=Math.min(p.litres,state.maxFuel-state.fuel); state.cash-=p.cost; state.fuel+=gained;
  toast(`${Math.floor(gained)} L DIESEL LOADED`,'good'); updateHUD(); shopMenu();
}

function setPhase(next){
 state.phase=next;surface.visible=next==='surface';underground.visible=next==='underground'||next==='core';
 dom.mineReadout.classList.toggle('visible',next==='underground'||next==='core');
 if(next==='surface'){camera.position.set(state.surfacePos.x,1.72,state.surfacePos.z);yaw=0;pitch=0;setStatus('SYSTEMS NOMINAL','good');}
 else {camera.position.set(0,1.72,4);yaw=0;pitch=0;setStatus('BORE SYSTEMS ONLINE','warn');}
 camera.rotation.set(pitch,yaw,0,'YXZ');
 const s=currentStrata();scene.fog.color.setHex(next==='surface'?0x211917:s.fog);scene.fog.near=next==='surface'?42:12;scene.fog.far=next==='surface'?145:58;scene.background.setHex(next==='surface'?0x1a1516:s.fog);
 updateHUD();
}
function flashTransition(next, message){
 if(state.transitioning)return;state.transitioning=true;state.drilling=false;mouseDown=false;dom.fade.classList.add('on');
 window.setTimeout(()=>{setPhase(next);if(message)toast(message,'good',true);window.setTimeout(()=>{dom.fade.classList.remove('on');state.transitioning=false;},250);},420);
}
function openInteraction(id){if(id==='lab')labMenu();else if(id==='shop')shopMenu();else if(id==='rig'){
  if(state.phase!=='surface')return;
  if(state.fuel<=0){toast('NO DIESEL · REFUEL AT THE DEPOT','bad');return;}
  flashTransition('underground',`DESCENDING TO ${format(state.depth)} m`);
 }}
function useHoist(){
 if(state.phase==='surface')return;
 state.surfacePos={x:0,z:30};state.stuck=false;
 flashTransition('surface',`HOIST COMPLETE · ${format(state.depth)} m LOGGED`);
}
function chooseInteraction(){
 if(state.phase==='underground'||state.phase==='core'){toast('NO SURFACE ACCESS HERE · PRESS T TO HOIST','warn');return;}
 let best=null,dist=Infinity;
 for(const a of interactions){const d=Math.hypot(camera.position.x-a.pos.x,camera.position.z-a.pos.z);if(d<a.radius&&d<dist){best=a;dist=d;}}
 if(best)openInteraction(best.id);else toast('MOVE CLOSER TO A FACILITY OR THE DRILL RIG','warn');
}
function updatePrompt(){
 if(state.phase!=='surface'||state.modal||!state.started){dom.prompt.classList.remove('show');state.hover=null;return;}
 let best=null,dist=Infinity;
 for(const a of interactions){const d=Math.hypot(camera.position.x-a.pos.x,camera.position.z-a.pos.z);if(d<a.radius&&d<dist){best=a;dist=d;}}
 state.hover=best;
 if(best){dom.promptText.textContent=best.label;dom.prompt.classList.add('show');}else dom.prompt.classList.remove('show');
}
function updateAim(){
 state.aimAtFace=false;
 if(state.phase==='underground'&& !state.modal){raycaster.setFromCamera(new THREE.Vector2(0,0),camera);const hit=raycaster.intersectObject(mineFace,false)[0];state.aimAtFace=!!hit&&camera.position.distanceTo(hit.point)<18;}
 dom.crosshair.classList.toggle('drilling',state.drilling&&state.aimAtFace);
}
function switchStrata(){
 const s=currentStrata();mineFaceMat.color.setHex(s.rock);mineFaceMat.needsUpdate=true;
 const wall=underground.children.find(o=>o.material&&o.material.map===tunnelTexture);if(wall)wall.material.color.setHex(s.wall);
 scene.fog.color.setHex(s.fog);scene.background.setHex(s.fog);
 const glow=s.accent;
 for(const o of underground.children)if(o.isPointLight)o.color.setHex(glow);
 toast(`GEOLOGY SHIFT · ${s.name}`,'warn',true);updateHUD();
}
function breakRock(){
 const cap=tierCap();
 if(state.depth>=cap){state.stuck=true;state.drilling=false;toast(`MK ${roman(state.tier)} RATING REACHED · RETURN TO LAB`,'warn',true);setStatus('DEPTH RATING EXCEEDED','warn');updateHUD();return;}
 const oldLayer=currentStrataIndex();
 const increment=Math.min(DEPTH_PER_BREAK,cap-state.depth,CORE_DEPTH-state.depth);
 state.depth+=increment;state.breaks++;state.rockProgress=0;state.stuck=false;
 const reward=Math.round((22+currentStrataIndex()*8)*state.oreMultiplier+rand(-3,6));state.cash+=reward;
 state.surfacePos={x:0,z:30};
 dom.flash.classList.add('fire');window.setTimeout(()=>dom.flash.classList.remove('fire'),450);
 // Advance the bore face while keeping the player in a safe, framed section of tunnel.
 mineFace.position.z-=3.4;camera.position.z-=3.4;
 for(const o of tunnelBits.children)o.position.z-=3.4;
 if(mineFace.position.z < -74){mineFace.position.z=-11;camera.position.z=4;for(const o of tunnelBits.children)o.position.z+=63;}
 if(state.depth>=CORE_DEPTH){state.depth=CORE_DEPTH;state.phase='core';state.coreTimer=0;state.drilling=false;toast('EARTH’S CORE REACHED','good',true);setObjective('Core reached. You made it all the way down.');setStatus('MISSION COMPLETE','good');updateHUD();return;}
 if(currentStrataIndex()!==oldLayer)switchStrata();else updateHUD();
 toast(`ORE HAULED · +${currency(reward)} SCRIP`,'good');
 if(state.depth%1000<DEPTH_PER_BREAK||state.depth===1400||state.depth===3000||state.depth===4700||state.depth===5800)toast(`${format(state.depth)} m · ${currentStrata().name}`,'warn');
 if(state.depth>=cap){state.stuck=true;state.drilling=false;setStatus('RIG LIMIT · HOIST TO SURFACE','warn');setObjective('Rig rating reached. Hoist up and install the next bore head in the lab.');}
 if(state.fuel<=0){state.drilling=false;toast('FUEL EMPTY · HOIST BACK TO SITE 09','bad',true);}
}
function startGame(){
 if(state.started)return;state.started=true;dom.intro.classList.add('hidden');document.body.classList.add('playing');setPhase('surface');updateHUD();
 setObjective('Visit the depot, then descend and drill to 6,371 m.');toast('SHIFT STARTED · E TO INTERACT · WASD TO MOVE','good');
 dom.canvas.requestPointerLock?.();
}
function setPause(paused){
 state.pause=paused;dom.pause.classList.toggle('hidden',!paused);
 if(paused){state.drilling=false;mouseDown=false;document.exitPointerLock?.();}else dom.canvas.requestPointerLock?.();
}
function onKeyDown(e){
 if(['KeyW','KeyA','KeyS','KeyD','Space','KeyE','KeyT','Escape'].includes(e.code))e.preventDefault();
 keys.add(e.code);if(e.repeat)return;
 if(e.code==='KeyE'&&!state.modal)chooseInteraction();
 if(e.code==='KeyT'&&!state.modal)useHoist();
 if(e.code==='Escape'&&state.modal){closeModal();return;}
 if(e.code==='Escape'&&!state.modal&&state.started&&document.pointerLockElement)setPause(true);
}
function onKeyUp(e){keys.delete(e.code);}
function onPointerLock(){
 if(document.pointerLockElement===dom.canvas){dom.pause.classList.add('hidden');state.pause=false;}
 else if(state.started&&!state.modal&&!state.pause&&dom.intro.classList.contains('hidden'))setPause(true);
}
function onMouseMove(e){if(document.pointerLockElement!==dom.canvas||state.modal)return;yaw-=e.movementX*.0022;pitch-=e.movementY*.0022;pitch=clamp(pitch,-1.35,1.35);camera.rotation.set(pitch,yaw,0,'YXZ');}
function onMouseDown(e){if(e.button!==0)return;if(!state.started||state.modal||state.pause||state.transitioning)return;if(document.pointerLockElement!==dom.canvas){dom.canvas.requestPointerLock?.();return;}mouseDown=true;}
function onMouseUp(e){if(e.button===0){mouseDown=false;state.drilling=false;}}
function movePlayer(dt){
 if(document.pointerLockElement!==dom.canvas||state.modal||state.pause||state.transitioning)return;
 const speed=state.phase==='surface'?7.3:4.2, forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
 let dx=0,dz=0;if(keys.has('KeyW')){dx+=forward.x;dz+=forward.z;}if(keys.has('KeyS')){dx-=forward.x;dz-=forward.z;}if(keys.has('KeyD')){dx+=right.x;dz+=right.z;}if(keys.has('KeyA')){dx-=right.x;dz-=right.z;}
 const len=Math.hypot(dx,dz);if(len){dx=dx/len*speed*dt;dz=dz/len*speed*dt;}
 if(state.phase==='surface'){camera.position.x=clamp(camera.position.x+dx,-35,35);camera.position.z=clamp(camera.position.z+dz,-32,34);}
 else if(state.phase==='underground'){camera.position.x=clamp(camera.position.x+dx,-5.7,5.7);camera.position.z=clamp(camera.position.z+dz,-75,mineFace.position.z+4.4);}
 camera.position.y=1.72;
}
function drillUpdate(dt){
 const active=state.phase==='underground'&&mouseDown&&state.aimAtFace&&!state.stuck&&!state.transitioning&&!state.modal;
 state.drilling=active;
 if(!active)return;
 if(state.fuel<=0){state.drilling=false;mouseDown=false;toast('TURBINE STALLED · NO DIESEL','bad');return;}
 if(state.depth>=tierCap()){state.stuck=true;state.drilling=false;mouseDown=false;updateHUD();toast('BORE HEAD LIMIT · HOIST TO SCIENCE LAB','warn',true);return;}
 state.fuel=Math.max(0,state.fuel-dt*.42/state.fuelEfficiency);
 state.rockProgress+=dt*.48*TIERS[state.tier].speed;
 if(Math.random()<dt*.75){state.cash+=1;state.oreMultiplier=1.05;}
 if(state.rockProgress>=1)breakRock();updateHUD();
 if(state.fuel===0){state.drilling=false;mouseDown=false;toast('FUEL EMPTY · HOIST BACK TO SITE 09','bad',true);}
}
function animate(now){
 requestAnimationFrame(animate);const dt=Math.min(.05,(now-lastTime)/1000);lastTime=now;state.time+=dt;
 if(state.pause||state.modal||!state.started){}else{movePlayer(dt);if(mouseDown&&state.phase==='underground'){updateAim();drillUpdate(dt);}else{state.drilling=false;updateAim();}}
 updatePrompt();renderer.render(scene,camera);
}
function resize(){camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);}
dom.start.addEventListener('click',startGame);dom.resume.addEventListener('click',()=>setPause(false));dom.modalClose.addEventListener('click',closeModal);
dom.modal.addEventListener('mousedown',e=>{if(e.target===dom.modal)closeModal();});
dom.canvas.addEventListener('mousedown',onMouseDown);document.addEventListener('mouseup',onMouseUp);document.addEventListener('mousemove',onMouseMove);
document.addEventListener('keydown',onKeyDown);document.addEventListener('keyup',onKeyUp);document.addEventListener('pointerlockchange',onPointerLock);window.addEventListener('resize',resize);
state.surfacePos={x:START_POS.x,z:START_POS.z};setPhase('surface');updateHUD();requestAnimationFrame(animate);
