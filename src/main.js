import * as THREE from 'three';
import './style.css';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9caeaa);
scene.fog = new THREE.Fog(0x9caeaa, 32, 105);
const camera = new THREE.PerspectiveCamera(73, window.innerWidth / window.innerHeight, .08, 140);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
raycaster.far = 7.5;
const world = new THREE.Group(); world.name = 'surface camp'; scene.add(world);
const mines = new THREE.Group(); mines.name = 'mine'; scene.add(mines);
const effects = new THREE.Group(); scene.add(effects);
const mats = {
  earth: new THREE.MeshStandardMaterial({ color: 0x594d3e, roughness: 1 }),
  ground: new THREE.MeshStandardMaterial({ color: 0x80745c, roughness: 1 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x625e54, roughness: .96 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x222b29, roughness: .82 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xb76f43, roughness: .75 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xe9b761, roughness: .5, emissive: 0x704718, emissiveIntensity: .25 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x777e70, roughness: .88 }),
  green: new THREE.MeshStandardMaterial({ color: 0x85956c, roughness: .75 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x45514c, roughness: .4, metalness: .55 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x8db8b2, roughness: .23, metalness: .12, emissive: 0x29403a, emissiveIntensity: .2 }),
  pale: new THREE.MeshStandardMaterial({ color: 0xd7d2bd, roughness: .8 }),
  sand: new THREE.MeshStandardMaterial({ color: 0xa18e6d, roughness: 1 }),
};
function box(parent, name, x, y, z, sx, sy, sz, material, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.name = name; mesh.position.set(x, y, z);
  mesh.castShadow = options.castShadow !== false; mesh.receiveShadow = options.receiveShadow !== false;
  if (options.rotation) mesh.rotation.set(...options.rotation);
  parent.add(mesh); return mesh;
}
function mat(color, roughness = .8) { return new THREE.MeshStandardMaterial({ color, roughness }); }
function random(seed) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}
function labelTexture(lines) {
  const c = document.createElement('canvas'); c.width = 640; c.height = 200;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#28312d'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#d6ac68'; ctx.lineWidth = 7; ctx.strokeRect(5, 5, 630, 190);
  ctx.textAlign = 'center'; ctx.fillStyle = '#f1ead8';
  ctx.font = '700 58px sans-serif'; ctx.fillText(lines[0], 320, 86);
  ctx.fillStyle = '#d6ac68'; ctx.font = '500 23px monospace'; ctx.fillText(lines[1], 320, 143);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function buildFacility(parent, kind, x, z, lab = false) {
  const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  const width = 8.2, height = 4.7;
  box(g, `${kind} foundation`, 0, .2, 0, width + .6, .4, 6.5, mats.dark);
  box(g, `${kind} walls`, 0, height / 2 + .4, 0, width, height, 5.9, lab ? mats.concrete : mats.orange);
  box(g, `${kind} roof`, 0, height + .5, 0, width + .5, .36, 6.4, mats.dark);
  box(g, `${kind} fascia`, 0, height + .72, 0, width + .7, .14, 6.55, lab ? mats.green : mats.yellow);
  for (const wx of [-2.55, 2.55]) {
    box(g, 'window frame', wx, 2.25, -3.02, 1.75, 1.75, .12, mats.dark);
    box(g, 'window', wx, 2.25, -3.1, 1.48, 1.48, .06, mats.glass, { castShadow: false });
    box(g, 'window mullion', wx, 2.25, -3.15, .055, 1.48, .04, mats.pale, { castShadow: false });
  }
  box(g, 'door frame', 0, 1.55, -3.02, 1.65, 3.1, .18, mats.dark);
  box(g, 'door', 0, 1.53, -3.14, 1.34, 2.84, .1, mats.metal);
  box(g, 'door glass', 0, 2.1, -3.2, 1.08, 1.45, .05, mats.glass, { castShadow: false });
  box(g, 'door handle', .48, 1.2, -3.28, .06, .35, .08, mats.yellow);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1), new THREE.MeshBasicMaterial({ map: labelTexture(lab ? ['FIELD LAB', 'RESEARCH  /  UPGRADES'] : ['SUPPLY DEPOT', 'FUEL  /  PROVISIONS']), toneMapped: false }));
  sign.position.set(0, 5.08, -3.36); g.add(sign);
  for (const side of [-1, 1]) {
    box(g, 'side brace', side * 4.05, 2.3, 0, .18, 4.4, 5.9, mats.dark);
    box(g, 'corner light', side * 3.45, 4.15, -3.25, .28, .18, .12, mats.yellow);
  }
  return g;
}
function buildWorld() {
  const hemi = new THREE.HemisphereLight(0xdce9e5, 0x65523b, 2.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b0, 3.1); sun.position.set(-18, 28, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -35; sun.shadow.camera.right = 35; sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -35; scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), mats.ground); floor.rotation.x = -Math.PI / 2; floor.position.y = -.08; floor.receiveShadow = true; world.add(floor);
  // Dusty graded worksite and a marked route to the lift.
  const rand = random(2024);
  for (let i = 0; i < 145; i++) {
    const x = (rand() - .5) * 70, z = (rand() - .5) * 70;
    if (Math.abs(x) < 19 && z > -14 && z < 12) continue;
    const size = .18 + rand() * .75;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rand() > .5 ? mats.stone : mats.sand);
    rock.position.set(x, size * .5 - .04, z); rock.rotation.set(rand(), rand(), rand()); rock.castShadow = true; world.add(rock);
  }
  for (let i = -2; i <= 2; i++) box(world, 'lift road marker', i * 1.15, .012, -5.3, .72, .025, 5.5, mats.sand, { castShadow: false });
  buildFacility(world, 'lab', -11, 0, true); buildFacility(world, 'depot', 11, 0, false);
  // Surface lift platform and its conspicuous safety gantry.
  box(world, 'lift pad', 0, .12, -8, 6.8, .24, 6.3, mats.dark);
  box(world, 'lift deck', 0, .29, -8, 4.4, .12, 4.2, mats.metal);
  for (const x of [-2.25, 2.25]) {
    box(world, 'lift post', x, 3.15, -9.75, .22, 6, .22, mats.orange);
    box(world, 'lift beacon', x, 5.9, -9.75, .45, .2, .45, mats.yellow);
  }
  box(world, 'lift crossbar', 0, 6.05, -9.75, 4.7, .24, .24, mats.dark);
  box(world, 'lift sign', 0, 4.8, -9.66, 3.2, .72, .15, mats.yellow);
  const beacon = new THREE.PointLight(0xffb85e, 1.3, 14); beacon.position.set(0, 4.8, -8); world.add(beacon);
  // Small storage crates and a utility mast make the camp feel occupied.
  for (const [x, z] of [[-18, -4], [-17, -2], [17, 3], [18, 2]]) {
    box(world, 'supply crate', x, .65, z, 1.25, 1.3, 1.25, mats.orange);
    box(world, 'crate lid', x, 1.33, z, 1.34, .1, 1.34, mats.dark);
  }
  box(world, 'utility mast', -19, 3.2, -11, .16, 6.4, .16, mats.dark);
  for (const y of [2.4, 4.2]) box(world, 'mast arm', -18.4, y, -11, 1.2, .12, .12, mats.orange);
  const mastLight = new THREE.PointLight(0xff9a57, .8, 8); mastLight.position.set(-18.2, 4.4, -11); world.add(mastLight);
}
buildWorld();
const player = { x: 0, y: 1.7, z: 8 };
let yaw = 0, pitch = -.06, started = false, paused = false, panelOpen = false, pointerLocked = false, soundOn = true;
let inMine = false, layerIndex = 0, depth = 0, cash = 180, fuel = 36, oreCount = 0, drillLevel = 1, tankLevel = 1;
let rocks = [], currentTarget = null, toastTimer = 0;
const keys = new Set(), dust = [];
const layerData = [
  { name: 'SURFACE CRUST', depth: 0, base: 0x70604a, ore: 0xb77b4e, value: 18 },
  { name: 'SEDIMENTARY SHELF', depth: 637, base: 0x756451, ore: 0xc07d53, value: 22 },
  { name: 'GRANITE SEAM', depth: 1274, base: 0x666960, ore: 0x929e97, value: 28 },
  { name: 'COPPER VEIN', depth: 1911, base: 0x635749, ore: 0xc47a4f, value: 36 },
  { name: 'IRON STRATA', depth: 2548, base: 0x494e4b, ore: 0x9ca49a, value: 44 },
  { name: 'OBSIDIAN BELT', depth: 3185, base: 0x373c3b, ore: 0x899e9a, value: 55 },
  { name: 'CRYSTAL CAVERN', depth: 3822, base: 0x344c4c, ore: 0x74c2b5, value: 72 },
  { name: 'GOLDEN MANTLE', depth: 4459, base: 0x584b35, ore: 0xd4ad5b, value: 92 },
  { name: 'LOWER MANTLE', depth: 5096, base: 0x483a35, ore: 0xd47755, value: 120 },
  { name: 'OUTER CORE', depth: 5733, base: 0x592c27, ore: 0xff9a53, value: 160 },
  { name: 'EARTH’S CORE', depth: 6371, base: 0x783822, ore: 0xffca72, value: 220 },
];
function makeMine() {
  mines.clear(); rocks = [];
  box(mines, 'mine floor', 0, -.2, -35, 7.3, .4, 82, mats.earth, { castShadow: false });
  box(mines, 'left mine wall', -3.72, 2.2, -35, .35, 4.8, 82, mats.stone);
  box(mines, 'right mine wall', 3.72, 2.2, -35, .35, 4.8, 82, mats.stone);
  box(mines, 'mine ceiling', 0, 4.62, -35, 7.3, .35, 82, mats.dark);
  for (let z = 2; z >= -78; z -= 5.2) {
    for (const x of [-3.35, 3.35]) box(mines, 'mine timber', x, 2.15, z, .24, 4.25, .26, mats.orange);
    box(mines, 'mine crossbeam', 0, 4.17, z, 6.9, .22, .26, mats.orange);
    for (const x of [-3.37, 3.37]) box(mines, 'support plate', x, .12, z, .55, .28, .5, mats.dark);
    if (z < -3) { box(mines, 'amber strip', -3.18, 3.8, z, .1, .12, .75, mats.yellow, { castShadow: false }); const lamp = new THREE.PointLight(0xff9a57, .7, 5); lamp.position.set(0, 3.9, z); mines.add(lamp); }
  }
  addMineExit(); createLayer();
}
function addMineExit() {
  const invisible = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const exit = box(mines, 'mine-exit', 0, 1, 4.35, 3.3, 2, .5, invisible, { castShadow: false }); exit.userData.active = true;
  box(mines, 'return beacon', 0, 4.05, 4.28, 2.7, .16, .18, mats.yellow);
  for (const x of [-1.4, 1.4]) box(mines, 'tunnel support', x, 2.1, 4.35, .16, 4.1, .18, mats.orange);
}
function createLayer() {
  const data = layerData[Math.min(layerIndex, layerData.length - 1)];
  const rand = random(731 + layerIndex * 1709), z = -7 - layerIndex * 6.2;
  const rockMat = mat(data.base, .94);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
    const isOre = rand() < .35 + Math.min(.25, layerIndex * .025);
    const material = isOre ? new THREE.MeshStandardMaterial({ color: data.ore, roughness: .48, metalness: .15, emissive: data.ore, emissiveIntensity: .055 }) : rockMat;
    const block = box(mines, isOre ? 'ore-bearing rock' : 'rock', (col - 2) * 1.3, .68 + row * 1.28, z, 1.22, 1.2, .72, material);
    block.userData.health = 1 + Math.floor(rand() * Math.max(1, 4 - drillLevel));
    block.userData.maxHealth = block.userData.health; block.userData.ore = isOre;
    block.userData.value = isOre ? data.value + Math.floor(rand() * 12) : 5;
    block.userData.layer = layerIndex; block.userData.active = true; rocks.push(block);
  }
  updateHUD();
}
function updateHUD() {
  const layer = layerData[Math.min(layerIndex, layerData.length - 1)];
  const shownDepth = inMine ? Math.min(6371, layer.depth + Math.max(0, Math.min(620, (-player.z - (7 + layerIndex * 6.2)) * 100))) : depth;
  $('depth-value').textContent = Math.floor(shownDepth).toLocaleString();
  $('depth-fill').style.width = `${Math.max(0, Math.min(100, shownDepth / 6371 * 100))}%`;
  $('cash-value').textContent = cash.toLocaleString(); $('fuel-value').textContent = fuel;
  $('ore-count').textContent = oreCount.toLocaleString(); $('layer-name').textContent = layer.name;
  const dots = $('ore-dots'); dots.innerHTML = '';
  for (let i = 0; i < 15; i++) { const dot = document.createElement('i'); dot.className = `ore-dot${i < 15 - rocks.length ? ' done' : ''}`; dots.append(dot); }
  $('progress-copy').textContent = rocks.length ? `${rocks.length} blocks remain in this seam.` : 'Seam cleared — preparing the next depth.';
  $('zone-label').textContent = inMine ? 'SUBSURFACE WORKS' : 'SURFACE CAMP';
  $('zone-hint').textContent = inMine ? 'WASD MOVE  ·  MOUSE LOOK  ·  HOLD E TO DRILL' : 'WASD MOVE  ·  MOUSE LOOK';
}
function showToast(message) { const toast = $('toast'); toast.textContent = message; toast.classList.add('show'); toastTimer = 2.4; }
function setPrompt(message = '') {
  if (!message || panelOpen || !started || paused) {
    $('prompt-text').textContent = '';
    $('prompt').classList.add('hidden');
    return;
  }
  $('prompt-text').textContent = message; $('prompt').classList.remove('hidden');
}
function requestLock() { if (started && !panelOpen && !paused && document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); }
function beginGame() {
  if (started) return; started = true; $('welcome').classList.add('hidden'); $('hud').classList.remove('hidden');
  $('mining-label').classList.toggle('hidden', !inMine); updateHUD(); requestLock();
}
function enterMine() {
  if (fuel <= 0) { showToast('NO DRILL OIL — REFUEL AT THE SUPPLY DEPOT'); return; }
  inMine = true; layerIndex = 0; depth = 0; player.x = 0; player.y = 1.7; player.z = -1.5; yaw = 0; pitch = 0;
  world.visible = false; mines.visible = true; makeMine(); $('mining-label').classList.remove('hidden');
  showToast('DESCENT COMPLETE — CLEAR THE ROCK FACE'); updateHUD(); requestLock();
}
function returnToCamp() {
  inMine = false; world.visible = true; mines.visible = false; player.x = 0; player.y = 1.7; player.z = 5.4; yaw = 0; pitch = 0;
  $('mining-label').classList.add('hidden'); closePanel(); updateHUD(); showToast('BACK AT CAMP — LAB AND SUPPLY DEPOT ARE OPEN');
  setPrompt('');
}
function panelTemplate(kind) {
  const panel = $('interaction-panel');
  if (kind === 'lab') {
    const drillCost = 140 + (drillLevel - 1) * 160, tankCost = 110 + (tankLevel - 1) * 140;
    panel.innerHTML = `<button class="panel-close" aria-label="Close">×</button><div class="panel-eyebrow">FIELD LAB / EQUIPMENT</div><h2>BUILD A BETTER<br>WAY DOWN.</h2><p class="panel-description">The deeper you go, the tougher the stone gets. Put your credits into a stronger drill and a larger oil tank.</p><div class="upgrade-row"><div class="upgrade-info"><span class="upgrade-icon">✳</span><span><b>Rotary drill · Mk ${drillLevel}</b><small>${drillLevel >= 4 ? 'MAX LEVEL' : 'More bite. Less time per block.'}</small></span></div><button class="buy-button" data-buy="drill" ${drillLevel >= 4 || cash < drillCost ? 'disabled' : ''}>${drillLevel >= 4 ? 'MAXED' : `UPGRADE $${drillCost}`}</button></div><div class="upgrade-row"><div class="upgrade-info"><span class="upgrade-icon">⌁</span><span><b>Oil tank · Mk ${tankLevel}</b><small>${tankLevel >= 4 ? 'MAX LEVEL' : `Capacity ${fuel} L / ${36 + (tankLevel - 1) * 24} L`}</small></span></div><button class="buy-button" data-buy="tank" ${tankLevel >= 4 || cash < tankCost ? 'disabled' : ''}>${tankLevel >= 4 ? 'MAXED' : `UPGRADE $${tankCost}`}</button></div><div class="panel-footer"><span>AVAILABLE CREDITS</span><b>$${cash.toLocaleString()}</b></div>`;
  } else {
    const cap = 36 + (tankLevel - 1) * 24;
    panel.innerHTML = `<button class="panel-close" aria-label="Close">×</button><div class="panel-eyebrow">SUPPLY DEPOT / FUEL</div><h2>KEEP THE RIG<br>RUNNING.</h2><p class="panel-description">Refined drill oil is sold by the can. The mine lift is standing by whenever you’re ready to descend.</p><div class="lift-stats"><div><small>OIL ON HAND</small><b>${fuel} / ${cap} L</b></div><div><small>CREDITS</small><b>$${cash.toLocaleString()}</b></div></div><div class="shop-item"><div class="upgrade-info"><span class="upgrade-icon">⌁</span><span><b>12 L oil can</b><small>${fuel >= cap ? 'TANK IS FULL' : 'A clean, reliable burn.'}</small></span></div><button class="buy-button" data-buy="oil" ${cash < 48 || fuel >= cap ? 'disabled' : ''}>BUY $48</button></div><div class="shop-item"><div class="upgrade-info"><span class="upgrade-icon">▣</span><span><b>Full tank</b><small>Refill all available capacity.</small></span></div><button class="buy-button" data-buy="full" ${cash < Math.ceil((cap - fuel) * 4) || fuel >= cap ? 'disabled' : ''}>$${Math.ceil((cap - fuel) * 4)}</button></div><div class="panel-footer"><span>RETURN TO THE LIFT WHEN READY</span><b>PRESS E</b></div>`;
  }
  panel.dataset.kind = kind; $('panel-backdrop').classList.remove('hidden'); panelOpen = true; setPrompt('');
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
function openPanel(kind) { panelTemplate(kind); }
function closePanel() { panelOpen = false; $('panel-backdrop').classList.add('hidden'); $('interaction-panel').innerHTML = ''; if (started && !paused) requestLock(); }
function performPurchase(type) {
  if (type === 'drill') { const cost = 140 + (drillLevel - 1) * 160; if (cash < cost || drillLevel >= 4) return; cash -= cost; drillLevel++; showToast(`DRILL UPGRADED TO MK ${drillLevel}`); }
  else if (type === 'tank') { const cost = 110 + (tankLevel - 1) * 140; if (cash < cost || tankLevel >= 4) return; cash -= cost; tankLevel++; fuel = Math.min(36 + (tankLevel - 1) * 24, fuel + 8); showToast(`OIL TANK UPGRADED — ${fuel} L CAPACITY`); }
  else if (type === 'oil') { const qty = Math.min(12, 36 + (tankLevel - 1) * 24 - fuel); if (cash < 48 || qty <= 0) return; cash -= 48; fuel += qty; showToast(`${qty} L DRILL OIL ADDED`); }
  else if (type === 'full') { const qty = 36 + (tankLevel - 1) * 24 - fuel, cost = Math.ceil(qty * 4); if (cash < cost || qty <= 0) return; cash -= cost; fuel += qty; showToast(`TANK REFILLED — ${fuel} L READY`); }
  updateHUD(); panelTemplate($('interaction-panel').dataset.kind);
}

function getNearbyInteraction() {
  if (inMine) {
    if (player.z > 2.45) return { type: 'exit', text: 'RETURN TO SURFACE' };
    return null;
  }
  if (Math.abs(player.x) < 2.5 && player.z < -5.8 && player.z > -11) return { type: 'lift', text: 'TAKE THE LIFT DOWN' };
  if (Math.abs(player.x + 11) < 4.5 && player.z > -5.4 && player.z < 5) return { type: 'lab', text: 'OPEN FIELD LAB' };
  if (Math.abs(player.x - 11) < 4.5 && player.z > -5.4 && player.z < 5) return { type: 'shop', text: 'VISIT SUPPLY DEPOT' };
  return null;
}
function interact() {
  const nearby = getNearbyInteraction();
  if (!nearby) return;
  if (nearby.type === 'exit') returnToCamp();
  else if (nearby.type === 'lift') enterMine();
  else openPanel(nearby.type);
}
function setCamera() {
  camera.position.set(player.x, player.y, player.z);
  camera.rotation.order = 'YXZ'; camera.rotation.set(pitch, yaw, 0);
}
function updateTarget() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hit = inMine ? raycaster.intersectObjects(rocks, false)[0] : null;
  currentTarget = hit?.object || null;
  $('crosshair').classList.toggle('active', !!currentTarget);
}
function makeDust(position, color) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(24 * 3);
  for (let i = 0; i < 24; i++) {
    positions[i * 3] = position.x + (Math.random() - .5) * .8;
    positions[i * 3 + 1] = position.y + Math.random() * .8;
    positions[i * 3 + 2] = position.z + (Math.random() - .5) * .8;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const cloud = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: .075, transparent: true, opacity: .9, depthWrite: false }));
  cloud.userData.life = .42; effects.add(cloud); dust.push(cloud);
}
let miningClock = 0;
function mineBlock(delta) {
  if (!inMine || panelOpen || !currentTarget || !currentTarget.userData.active || fuel <= 0) return;
  miningClock -= delta;
  if (miningClock > 0) return;
  miningClock = Math.max(.12, .48 / (1 + (drillLevel - 1) * .32));
  const target = currentTarget;
  if (!target.parent || !target.userData.active) return;
  target.userData.health -= 1 + Math.floor((drillLevel - 1) / 2);
  makeDust(target.position, target.userData.ore ? layerData[Math.min(layerIndex, layerData.length - 1)].ore : 0xb9a68d);
  if (target.userData.health > 0) {
    const ratio = target.userData.health / target.userData.maxHealth;
    target.scale.set(1.22 * (.94 + ratio * .06), 1.2 * (.94 + ratio * .06), .72 * (.94 + ratio * .06));
    return;
  }
  target.userData.active = false;
  mines.remove(target); target.geometry.dispose();
  const material = target.material;
  if (!rocks.some((rock) => rock.material === material)) material.dispose();
  rocks = rocks.filter((rock) => rock !== target);
  oreCount++;
  if (target.userData.ore) {
    cash += target.userData.value;
    showToast(`ORE RECOVERED  +$${target.userData.value}`);
  } else cash += target.userData.value;
  fuel = Math.max(0, fuel - 1);
  updateHUD();
  if (rocks.length === 0) clearLayer();
  if (fuel === 0) showToast('OIL EMPTY — RETURN TO THE SURFACE TO REFUEL');
}
function clearLayer() {
  layerIndex++;
  if (layerIndex >= 10) {
    layerIndex = 10; depth = 6371; updateHUD();
    showToast('THE CORE IS WITHIN REACH — DESCENT COMPLETE');
    setTimeout(() => {
      if (!inMine) return;
      $('interaction-panel').innerHTML = `<button class="panel-close" aria-label="Close">×</button><div class="panel-eyebrow">MISSION COMPLETE / 6,371 M</div><h2>YOU MADE<br>IT TO THE CORE.</h2><p class="panel-description">The whole planet, one seam at a time. Your samples are extraordinary. The surface crew is waiting when you’re ready.</p><div class="panel-footer"><span>ORE RECOVERED</span><b>${oreCount} BLOCKS</b></div>`;
      $('interaction-panel').dataset.kind = 'complete'; $('panel-backdrop').classList.remove('hidden'); panelOpen = true;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    }, 350);
    return;
  }
  depth = layerData[layerIndex].depth;
  showToast(`${layerData[layerIndex - 1].name} CLEARED — NEXT SEAM AHEAD`);
  createLayer(); updateHUD();
}
function doMovement(delta) {
  if (!started || paused || panelOpen) return;
  const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const strafe = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const length = Math.hypot(forward, strafe) || 1;
  const speed = inMine ? 4.15 : 5.2;
  const dx = (Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * speed * delta / length;
  const dz = (-Math.cos(yaw) * forward + Math.sin(yaw) * strafe) * speed * delta / length;
  const nextX = player.x + dx, nextZ = player.z + dz;
  if (inMine) {
    const testX = Math.max(-3.2, Math.min(3.2, nextX));
    const testZ = Math.max(-75, Math.min(4.15, nextZ));
    const blockedX = rocks.some((rock) => Math.abs(rock.position.x - testX) < .82 && Math.abs(rock.position.z - player.z) < .68 && Math.abs(rock.position.y - player.y) < 1.35);
    const blockedZ = rocks.some((rock) => Math.abs(rock.position.x - player.x) < .82 && Math.abs(rock.position.z - testZ) < .68 && Math.abs(rock.position.y - player.y) < 1.35);
    if (!blockedX) player.x = testX;
    if (!blockedZ) player.z = testZ;
    const layer = layerData[Math.min(layerIndex, layerData.length - 1)];
    depth = layer.depth + Math.max(0, Math.min(620, (-player.z - (7 + layerIndex * 6.2)) * 100));
  } else {
    player.x = Math.max(-23, Math.min(23, nextX)); player.z = Math.max(-18, Math.min(19, nextZ));
    // Keep the player outside the solid facility shells.
    for (const centerX of [-11, 11]) {
      if (Math.abs(player.x - centerX) < 4.5 && player.z < 3.2 && player.z > -3.8) {
        if (Math.abs(player.x - centerX) > 3.7) player.x = centerX + Math.sign(player.x - centerX) * 4.6;
        else player.z = player.z < -.3 ? -3.9 : 3.3;
      }
    }
  }
}
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), .05);
  doMovement(delta); setCamera(); updateTarget();
  if (started && !paused && !panelOpen && (keys.has('KeyE') || mouseMining) && inMine) mineBlock(delta);
  const nearby = started ? getNearbyInteraction() : null;
  if (nearby) setPrompt(`${nearby.text}  ·  PRESS E`);
  else if (currentTarget && inMine) setPrompt('HOLD E OR CLICK TO MINE');
  else setPrompt('');
  $('mining-label').classList.toggle('hidden', !inMine || !!currentTarget || panelOpen);
  if (toastTimer > 0) { toastTimer -= delta; if (toastTimer <= 0) $('toast').classList.remove('show'); }
  for (let i = dust.length - 1; i >= 0; i--) {
    const particle = dust[i]; particle.userData.life -= delta;
    const attr = particle.geometry.attributes.position;
    for (let j = 0; j < attr.count; j++) attr.setY(j, attr.getY(j) + delta * .75);
    attr.needsUpdate = true; particle.material.opacity = Math.max(0, particle.userData.life / .42);
    if (particle.userData.life <= 0) { effects.remove(particle); particle.geometry.dispose(); particle.material.dispose(); dust.splice(i, 1); }
  }
  renderer.render(scene, camera);
}
let mouseMining = false;
$('start-button').addEventListener('click', beginGame);
$('resume-button').addEventListener('click', () => { paused = false; $('pause-screen').classList.add('hidden'); requestLock(); });
$('sound-button').addEventListener('click', () => {
  soundOn = !soundOn; $('sound-button').textContent = soundOn ? '♪' : '♫';
  $('sound-button').title = soundOn ? 'Sound on' : 'Sound off'; showToast(soundOn ? 'SOUND ON' : 'SOUND OFF');
});
$('panel-backdrop').addEventListener('click', (event) => {
  if (event.target === $('panel-backdrop') || event.target.closest('.panel-close')) { closePanel(); return; }
  const button = event.target.closest('[data-buy]');
  if (button && !button.disabled) performPurchase(button.dataset.buy);
});
canvas.addEventListener('click', () => { if (started && !panelOpen && !paused && !pointerLocked) requestLock(); });
canvas.addEventListener('mousedown', (event) => { if (event.button === 0 && inMine && started) mouseMining = true; });
window.addEventListener('mouseup', (event) => { if (event.button === 0) mouseMining = false; });
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (started && !pointerLocked && !panelOpen && !paused) {
    paused = true; $('pause-screen').classList.remove('hidden'); setPrompt('');
  }
});
document.addEventListener('mousemove', (event) => {
  if (!pointerLocked || paused || panelOpen) return;
  yaw -= event.movementX * .0022; pitch -= event.movementY * .0022;
  pitch = Math.max(-1.35, Math.min(1.35, pitch));
});
window.addEventListener('keydown', (event) => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  if (event.code === 'Escape' && panelOpen) { closePanel(); return; }
  if (!started) return;
  if (event.code === 'KeyR' && !event.repeat) { returnToCamp(); return; }
  if ((event.code === 'KeyE' || event.code === 'Enter') && !event.repeat) {
    if (panelOpen) { closePanel(); return; }
    const nearby = getNearbyInteraction();
    if (nearby) interact(); else if (!inMine) showToast('MOVE CLOSER TO THE LIFT, LAB, OR SUPPLY DEPOT');
  }
  keys.add(event.code);
});
window.addEventListener('keyup', (event) => { keys.delete(event.code); if (event.code === 'KeyE') miningClock = 0; });
window.addEventListener('blur', () => { keys.clear(); mouseMining = false; });
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
});
world.visible = true; mines.visible = false; player.z = 8; setCamera(); updateHUD(); animate();
