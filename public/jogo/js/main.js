import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import nipplejs from 'nipplejs';
import { CameraController } from './camera.js';
import { PlayerModel3D } from './player-model-3d.js';

let TICK_RATE = 15;
let SEND_INTERVAL = 1000 / TICK_RATE;
let LERP_FACTOR = 0.1;
let MOVE_SPEED = 5;
const PLAYER_SIZE = 0.5;
const PLAYER_HEIGHT = 0.5;
let BOUNDARY = 22.5;
let SERVER_CONFIG = null;
let COLLISION_ENABLED = true;
let TOUCH_ENABLED = true;

let keyState = {};
let touchInput = { x: 0, y: 0 };
let isTouchDevice = false;
let targetX = 0;
let targetZ = 0;
let currentX = 0;
let currentZ = 0;
let currentRotation = Math.PI;
let lastSendTime = 0;
let sceneReady = false;
let worldGroup = null;
let storeCooldown = 0;
const STORE_COOLDOWN_MS = 1500;
let storeOpen = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 25, 45);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 80);
camera.position.set(8, 14, 12);
camera.lookAt(0, 0, 0);
const camCtrl = new CameraController(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0x8899bb, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
dirLight.position.set(8, 15, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.left = -25;
dirLight.shadow.camera.right = 25;
dirLight.shadow.camera.top = 25;
dirLight.shadow.camera.bottom = -25;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 40;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
fillLight.position.set(-8, 5, -5);
scene.add(fillLight);

const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x444422, 0.6);
scene.add(hemiLight);

const localPlayer = new PlayerModel3D();
localPlayer.position.set(0, 0, -5.5);
scene.add(localPlayer.group);

currentX = 0;
currentZ = -5.5;
targetX = 0;
targetZ = -5.5;

const remotePlayers = new Map();

function createRemotePlayer(id, nickname, avatarColor) {
  remotePlayers.set(id, { targetX: 0, targetZ: 0, currentX: 0, currentZ: 0, rotation: 0, nickname: nickname || 'Jogador', avatarColor: avatarColor || '#4F46E5' });
}

function removeRemotePlayer(id) {
  remotePlayers.delete(id);
}

updateHUDCount();

document.addEventListener('keydown', (e) => {
  keyState[e.key.toLowerCase()] = true;
});

document.addEventListener('keyup', (e) => {
  keyState[e.key.toLowerCase()] = false;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function isTouchCapable() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

if (isTouchCapable()) {
  isTouchDevice = true;
  const zone = document.getElementById('joystick-zone');
  zone.style.display = 'block';

  const joystick = nipplejs.create({
    zone,
    mode: 'static',
    position: { left: '80px', bottom: '80px' },
    color: 'rgba(255, 255, 255, 0.5)',
    size: 120,
    threshold: 0.1,
  });

  joystick.on('move', (evt, data) => {
    touchInput.x = data.vector.x;
    touchInput.y = -data.vector.y;
  });

  joystick.on('end', () => {
    touchInput.x = 0;
    touchInput.y = 0;
  });
}

const socket = io();

socket.on('connect', () => {
  const nickname = localStorage.getItem('bloko_nickname') || `Jogador-${socket.id.slice(0, 5)}`;
  const avatarColor = localStorage.getItem('bloko_avatarColor') || '#4A90D9';
  socket.emit('player:join', { nickname, avatarColor });
});

socket.on('server:config', applyConfig);
socket.on('config:update', applyConfig);

function applyConfig(cfg) {
  SERVER_CONFIG = cfg;
  if (cfg.environment) {
    const e = cfg.environment;
    BOUNDARY = e.worldBounds ?? BOUNDARY;
    MOVE_SPEED = e.playerSpeed ?? MOVE_SPEED;
    LERP_FACTOR = e.lerpFactor ?? LERP_FACTOR;
    scene.background = new THREE.Color(e.skyColor ?? '#87CEEB');
    if (cfg.features?.fog) {
      scene.fog = new THREE.Fog(
        new THREE.Color(e.fogColor ?? '#87CEEB'),
        e.fogNear ?? 25,
        e.fogFar ?? 45
      );
    } else {
      scene.fog = null;
    }
    renderer.toneMappingExposure = e.toneMappingExposure ?? 1.2;
    camCtrl.setDefaultDistance(e.cameraDistance ?? camCtrl.defaultDistance);
    camCtrl.setDefaultHeight(e.cameraHeight ?? camCtrl.defaultHeight);
    camera.fov = e.cameraFov ?? camera.fov;
    camera.updateProjectionMatrix();
    ambientLight.intensity = e.ambientLightIntensity ?? ambientLight.intensity;
    dirLight.intensity = e.directionalLightIntensity ?? dirLight.intensity;
    fillLight.intensity = e.fillLightIntensity ?? fillLight.intensity;
    hemiLight.intensity = e.hemisphereLightIntensity ?? hemiLight.intensity;
    if (e.fogColor) {
      scene.fog?.color.set(e.fogColor);
      hemiLight.color.set(e.fogColor);
    }
  }
  if (cfg.network) {
    TICK_RATE = cfg.network.tickRate ?? TICK_RATE;
    SEND_INTERVAL = 1000 / TICK_RATE;
  }
  if (cfg.features) {
    renderer.shadowMap.enabled = cfg.features.sceneShadows ?? true;
    COLLISION_ENABLED = cfg.features.collisionDetection ?? true;
    TOUCH_ENABLED = cfg.features.touchControls ?? true;
    const joystickZone = document.getElementById('joystick-zone');
    if (joystickZone) {
      joystickZone.style.display = TOUCH_ENABLED && isTouchDevice ? 'block' : 'none';
    }
  }
  console.log('Config aplicada:', cfg);
}

socket.on('current-players', (players) => {
  for (const id of [...remotePlayers.keys()]) {
    removeRemotePlayer(id);
  }
  for (const p of players) {
    if (p.id === socket.id) continue;
    createRemotePlayer(p.id, p.nickname, p.avatarColor);
    const rp = remotePlayers.get(p.id);
    if (rp) {
      rp.currentX = p.x;
      rp.currentZ = p.z;
      rp.targetX = p.x;
      rp.targetZ = p.z;
      rp.rotation = p.rotation || 0;
    }
  }
  updateHUDCount();
  renderPlayerList();
});

socket.on('player:joined', (p) => {
  if (p.id === socket.id) return;
  if (!remotePlayers.has(p.id)) {
    createRemotePlayer(p.id, p.nickname, p.avatarColor);
  }
  const rp = remotePlayers.get(p.id);
  if (rp) {
    rp.nickname = p.nickname || rp.nickname;
    rp.avatarColor = p.avatar_color || p.avatarColor || rp.avatarColor;
  }
  renderPlayerList();
});

socket.on('game-state', (players) => {
  const activeIds = new Set();
  for (const p of players) {
    if (p.id === socket.id) continue;
    activeIds.add(p.id);
    if (!remotePlayers.has(p.id)) {
      createRemotePlayer(p.id, p.nickname, p.avatarColor);
    }
    const rp = remotePlayers.get(p.id);
    if (rp) {
      rp.targetX = p.x;
      rp.targetZ = p.z;
      rp.targetY = p.y ?? VOXEL_CENTER_Y;
      rp.rotation = p.rotation || 0;
      rp.nickname = p.nickname || rp.nickname;
      rp.avatarColor = p.avatarColor || rp.avatarColor;
    }
  }
  for (const [id] of remotePlayers) {
    if (!activeIds.has(id)) {
      removeRemotePlayer(id);
    }
  }
  updateHUDCount();
  renderPlayerList();
});

socket.on('player-disconnected', (id) => {
  removeRemotePlayer(id);
  updateHUDCount();
  renderPlayerList();
});

socket.on('store:open', (store) => {
  showStoreOverlay(store);
});

socket.on('store:closed', () => {
  hideStoreOverlay();
  storeCooldown = Date.now() + STORE_COOLDOWN_MS;
});

camCtrl.onEnterStore = (storeId) => {
  const now = Date.now();
  if (now < storeCooldown) return;
  if (SERVER_CONFIG?.features?.iframePortals !== false) {
    socket.emit('store:enter', { storeId });
  }
};

camCtrl.onLeaveStore = () => {
  socket.emit('store:leave');
};

function isStoreOverlayVisible() {
  const overlay = document.getElementById('store-overlay');
  return overlay && !overlay.classList.contains('hidden');
}

document.addEventListener('click', (e) => {
  const closeBtn = document.getElementById('store-overlay-close');
  if (closeBtn && closeBtn.contains(e.target)) {
    hideStoreOverlay();
    socket.emit('store:leave');
    storeCooldown = Date.now() + STORE_COOLDOWN_MS;
    return;
  }

  const overlay = document.getElementById('store-overlay');
  const content = document.getElementById('store-overlay-content');
  if (overlay && content && !overlay.classList.contains('hidden') && !content.contains(e.target)) {
    hideStoreOverlay();
    socket.emit('store:leave');
    storeCooldown = Date.now() + STORE_COOLDOWN_MS;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isStoreOverlayVisible()) {
    hideStoreOverlay();
    socket.emit('store:leave');
    storeCooldown = Date.now() + STORE_COOLDOWN_MS;
  }
});

// --- COLLISION BOXES FOR BUILDINGS ---
let buildingBounds = [];

async function loadSceneMetadata() {
  try {
    const res = await fetch('/assets/scene-metadata.json');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function showStoreOverlay(store) {
  const overlay = document.getElementById('store-overlay');
  const iframe = document.getElementById('store-iframe');
  const nameEl = document.getElementById('store-overlay-name');
  if (!overlay || !iframe) return;
  if (nameEl) nameEl.textContent = store.name || '';
  iframe.src = store.site_url || 'about:blank';
  storeOpen = true;
  overlay.classList.remove('hidden');
}

function hideStoreOverlay() {
  const overlay = document.getElementById('store-overlay');
  const iframe = document.getElementById('store-iframe');
  if (overlay) overlay.classList.add('hidden');
  if (iframe) iframe.src = 'about:blank';
  storeOpen = false;
}

let collisionDebug = false;

document.addEventListener('keydown', (e) => {
  if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
    collisionDebug = !collisionDebug;
    console.log(`%c[Collision Debug] ${collisionDebug ? 'ATIVADO' : 'DESATIVADO'}`, 'font-weight:bold;color:' + (collisionDebug ? '#0f0' : '#f00'));
  }
});

function checkCollision(x, z, label) {
  if (!COLLISION_ENABLED) return false;

  const padding = PLAYER_SIZE / 2 + 0.1;
  for (let i = 0; i < buildingBounds.length; i++) {
    const b = buildingBounds[i];
    if (x + padding > b.x[0] && x - padding < b.x[1] &&
        z + padding > b.z[0] && z - padding < b.z[1]) {
      if (collisionDebug) {
        const name = b.name || `bound #${i}`;
        console.log(
          `%c[COLISAO] %c${name}%c bloqueou ${label || 'movimento'} em (${x.toFixed(2)}, ${z.toFixed(2)}) | bounds: X[${b.x[0]}, ${b.x[1]}] Z[${b.z[0]}, ${b.z[1]}]`,
          'font-weight:bold;color:#f44',
          'font-weight:bold;color:#ff0',
          'color:#aaa'
        );
      }
      return true;
    }
  }

  const curbZ = 4;
  if (Math.abs(z) > curbZ && Math.abs(z) < curbZ + 0.3) {
    return false;
  }

  if (Math.abs(x) > BOUNDARY || Math.abs(z) > BOUNDARY) {
    if (collisionDebug) {
      console.log(`%c[COLISAO] %cLimite do mundo%c em (${x.toFixed(2)}, ${z.toFixed(2)}) | BOUNDARY=${BOUNDARY}`, 'font-weight:bold;color:#f44', 'font-weight:bold;color:#ff0', 'color:#aaa');
    }
    return true;
  }

  return false;
}

function updateMovement(dt) {
  if (storeOpen) return;

  let dx = 0;
  let dz = 0;

  if (keyState['w']) dz -= 1;
  if (keyState['s']) dz += 1;
  if (keyState['a']) dx -= 1;
  if (keyState['d']) dx += 1;

  if (touchInput.x !== 0 || touchInput.y !== 0) {
    dx = touchInput.x;
    dz = touchInput.y;
  }

  const hasInput = dx !== 0 || dz !== 0;

  if (hasInput) {
    const transformed = camCtrl.transformInputForMovement(dx, dz);
    dx = transformed.x;
    dz = transformed.z;

    const len = Math.sqrt(dx * dx + dz * dz);
    dx /= len;
    dz /= len;

    const newX = targetX + dx * MOVE_SPEED * dt;
    const newZ = targetZ + dz * MOVE_SPEED * dt;

    if (!checkCollision(newX, targetZ, 'eixo X')) targetX = newX;
    if (!checkCollision(targetX, newZ, 'eixo Z')) targetZ = newZ;

    currentRotation = Math.atan2(dx, dz);
  }

  if (!hasInput) {
    localPlayer.changeState('idle');
  } else if (keyState['shift']) {
    localPlayer.changeState('run');
  } else {
    localPlayer.changeState('walk');
  }

  currentX += (targetX - currentX) * LERP_FACTOR;
  currentZ += (targetZ - currentZ) * LERP_FACTOR;

  localPlayer.position.x = currentX;
  localPlayer.position.z = currentZ;
  localPlayer.rotation.y = currentRotation;

  camCtrl.update(currentX, currentZ, currentRotation, dt);
}

function updateHUDCount() {
  const countEl = document.getElementById('count');
  if (countEl) {
    countEl.textContent = remotePlayers.size + 1;
  }
}

function renderPlayerList() {
  const list = document.getElementById('player-list');
  if (!list) return;
  list.innerHTML = '';

  const localNickname = localStorage.getItem('bloko_nickname') || 'Jogador';
  const localColor = localStorage.getItem('bloko_avatarColor') || '#4A90D9';

  const li = document.createElement('li');
  li.className = 'player-list-item';
  li.innerHTML = `<span class="player-list-avatar" style="background:${localColor}"></span><span class="player-list-name">${localNickname}</span><span class="player-list-you">você</span>`;
  list.appendChild(li);

  for (const [id, rp] of remotePlayers) {
    const item = document.createElement('li');
    item.className = 'player-list-item';
    item.innerHTML = `<span class="player-list-avatar" style="background:${rp.avatarColor}"></span><span class="player-list-name">${rp.nickname}</span>`;
    list.appendChild(item);
  }
}

const playerCountEl = document.getElementById('player-count');
const playerListPopup = document.getElementById('player-list-popup');
if (playerCountEl && playerListPopup) {
  playerCountEl.addEventListener('click', () => {
    playerListPopup.classList.toggle('hidden');
    if (!playerListPopup.classList.contains('hidden')) {
      renderPlayerList();
    }
  });
  const popupCloseBtn = playerListPopup.querySelector('.glass-popup-close');
  if (popupCloseBtn) {
    popupCloseBtn.addEventListener('click', () => {
      playerListPopup.classList.add('hidden');
    });
  }
  document.addEventListener('click', (e) => {
    if (!playerCountEl.contains(e.target) && !playerListPopup.contains(e.target)) {
      playerListPopup.classList.add('hidden');
    }
  });
}

function hideLoading() {
  const el = document.getElementById('loading-screen');
  if (el) el.classList.add('hidden');
}

// --- BOUNDARY VISUALIZER ---
let boundaryGroup = null;
let boundaryVisible = false;

function createBoundaryVisualizer() {
  const group = new THREE.Group();

  const half = BOUNDARY;
  const gridDivisions = 8;
  const step = (half * 2) / gridDivisions;

  const gridMat = new THREE.LineBasicMaterial({ color: 0x44cc44, transparent: true, opacity: 0.4 });
  for (let i = 0; i <= gridDivisions; i++) {
    const t = -half + i * step;
    const px = [new THREE.Vector3(t, 0.01, -half), new THREE.Vector3(t, 0.01, half)];
    const pz = [new THREE.Vector3(-half, 0.01, t), new THREE.Vector3(half, 0.01, t)];
    const gx = new THREE.Line(new THREE.BufferGeometry().setFromPoints(px), gridMat);
    const gz = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pz), gridMat);
    group.add(gx, gz);
  }

  const fillMat = new THREE.MeshBasicMaterial({
    color: 0x44cc44,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), fillMat);
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = -0.005;
  group.add(fill);

  const borderMat = new THREE.LineBasicMaterial({ color: 0xff4444, linewidth: 2 });
  const pts = [
    new THREE.Vector3(-half, 0.02, -half),
    new THREE.Vector3(half, 0.02, -half),
    new THREE.Vector3(half, 0.02, half),
    new THREE.Vector3(-half, 0.02, half),
    new THREE.Vector3(-half, 0.02, -half),
  ];
  const border = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), borderMat);
  group.add(border);

  group.visible = false;
  scene.add(group);
  boundaryGroup = group;
}

function toggleBoundaryVisualizer() {
  boundaryVisible = !boundaryVisible;
  if (boundaryGroup) {
    boundaryGroup.visible = boundaryVisible;
  }
  console.log(`%c[Limites] ${boundaryVisible ? 'MOSTRANDO' : 'ESCONDENDO'} area caminhavel (BOUNDARY=${BOUNDARY})`, 'font-weight:bold;color:' + (boundaryVisible ? '#0f0' : '#f44'));
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    toggleBoundaryVisualizer();
  }
});

// --- LOAD .GLB SCENE ---
const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
loader.setDRACOLoader(dracoLoader);

loader.load(
  '/assets/scene.glb',
  async (gltf) => {
    worldGroup = gltf.scene;

    worldGroup.traverse((child) => {
      if (child.isMesh) {
        child.receiveShadow = true;
        child.castShadow = true;
        child.frustumCulled = false;
      }
    });

    worldGroup.position.set(0, 0, 0);
    scene.add(worldGroup);

    const metadata = await loadSceneMetadata();
    if (metadata) {
      if (metadata.buildings && metadata.buildings.length > 0) {
        buildingBounds = metadata.buildings.map(b => ({
          name: b.name,
          x: [b.bounds.x[0], b.bounds.x[1]],
          z: [b.bounds.z[0], b.bounds.z[1]],
        }));
        console.log(`Collision bounds carregados: ${buildingBounds.length} edificio(s)`);
      }
    }

    const meshes = [];
    worldGroup.traverse((child) => {
      if (child.isMesh) meshes.push(child);
    });
    camCtrl.setObstacles(meshes);

    createBoundaryVisualizer();

    sceneReady = true;
    hideLoading();
    console.log('Cena carregada!');
  },
  (xhr) => {
    const pct = Math.round((xhr.loaded / xhr.total) * 100);
    const el = document.querySelector('#loading-screen p');
    if (el) el.textContent = `Carregando BLOKKO... ${pct}%`;
  },
  (err) => {
    console.error('Erro ao carregar cena:', err);
    hideLoading();
  }
);

let lastTickTime = performance.now();

function gameLoop(time) {
  requestAnimationFrame(gameLoop);

  const dt = Math.min((time - lastTickTime) / 1000, 0.05);
  lastTickTime = time;

  updateMovement(dt);

  for (const [, rp] of remotePlayers) {
    rp.currentX += (rp.targetX - rp.currentX) * LERP_FACTOR;
    rp.currentZ += (rp.targetZ - rp.currentZ) * LERP_FACTOR;
  }

  localPlayer.updateAnimation(dt);

  if (time - lastSendTime >= SEND_INTERVAL) {
    lastSendTime = time;
    socket.emit('player-move', {
      x: currentX,
      y: localPlayer.position.y,
      z: currentZ,
      rotation: currentRotation
    });
  }

  renderer.render(scene, camera);
}

gameLoop(performance.now());
