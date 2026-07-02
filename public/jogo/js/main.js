import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import nipplejs from 'nipplejs';
import { PlayerVoxel, PALETTES } from './player-voxel.js';
import { CameraController } from './camera.js';
import { PlayerModel3D } from './player-model-3d.js';

let TICK_RATE = 15;
let SEND_INTERVAL = 1000 / TICK_RATE;
let LERP_FACTOR = 0.1;
let MOVE_SPEED = 5;
const PLAYER_SIZE = 0.5;
const PLAYER_HEIGHT = 0.5;
const VOXEL_CENTER_Y = 0.55;
let BOUNDARY = 18;
let SERVER_CONFIG = null;

let keyState = {};
let touchInput = { x: 0, y: 0 };
let isTouchDevice = false;
let targetX = 0;
let targetZ = 0;
let currentX = 0;
let currentZ = 0;
let currentRotation = 0;
let lastSendTime = 0;
let sceneReady = false;
let worldGroup = null;

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

function createRemotePlayer(id) {
  const colorIdx = remotePlayers.size % PALETTES.length;
  const voxel = new PlayerVoxel(PALETTES[colorIdx]);
  voxel.position.set(0, VOXEL_CENTER_Y, 0);
  scene.add(voxel.group);
  remotePlayers.set(id, { voxel, targetX: 0, targetZ: 0, targetY: VOXEL_CENTER_Y, currentX: 0, currentZ: 0, rotation: 0 });
}

function removeRemotePlayer(id) {
  const p = remotePlayers.get(id);
  if (p) {
    p.voxel.dispose();
    scene.remove(p.voxel.group);
    remotePlayers.delete(id);
  }
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

socket.on('server:config', (cfg) => {
  SERVER_CONFIG = cfg;
  if (cfg.environment) {
    BOUNDARY = cfg.environment.worldBounds ?? BOUNDARY;
    MOVE_SPEED = cfg.environment.playerSpeed ?? MOVE_SPEED;
    LERP_FACTOR = cfg.environment.lerpFactor ?? LERP_FACTOR;
    scene.background = new THREE.Color(cfg.environment.skyColor ?? '#87CEEB');
    if (cfg.features?.fog) {
      scene.fog = new THREE.Fog(
        new THREE.Color(cfg.environment.fogColor ?? '#87CEEB'),
        cfg.environment.fogNear ?? 25,
        cfg.environment.fogFar ?? 45
      );
    } else {
      scene.fog = null;
    }
    renderer.toneMappingExposure = cfg.environment.toneMappingExposure ?? 1.2;
    camCtrl.setDefaultDistance(cfg.environment.cameraDistance ?? camCtrl.defaultDistance);
    camCtrl.setDefaultHeight(cfg.environment.cameraHeight ?? camCtrl.defaultHeight);
    camera.fov = cfg.environment.cameraFov ?? camera.fov;
    camera.updateProjectionMatrix();
  }
  if (cfg.network) {
    TICK_RATE = cfg.network.tickRate ?? TICK_RATE;
    SEND_INTERVAL = 1000 / TICK_RATE;
  }
  if (cfg.features) {
    renderer.shadowMap.enabled = cfg.features.sceneShadows ?? true;
  }
  console.log('Config recebida do servidor:', cfg);
});

socket.on('current-players', (players) => {
  for (const id of [...remotePlayers.keys()]) {
    removeRemotePlayer(id);
  }
  for (const p of players) {
    if (p.id === socket.id) continue;
    createRemotePlayer(p.id);
    const rp = remotePlayers.get(p.id);
    if (rp) {
      rp.currentX = p.x;
      rp.currentZ = p.z;
      rp.targetX = p.x;
      rp.targetZ = p.z;
      rp.targetY = p.y ?? VOXEL_CENTER_Y;
      rp.rotation = p.rotation || 0;
      rp.voxel.position.set(p.x, p.y ?? VOXEL_CENTER_Y, p.z);
    }
  }
  updateHUDCount();
});

socket.on('game-state', (players) => {
  const activeIds = new Set();
  for (const p of players) {
    if (p.id === socket.id) continue;
    activeIds.add(p.id);
    if (!remotePlayers.has(p.id)) {
      createRemotePlayer(p.id);
    }
    const rp = remotePlayers.get(p.id);
    if (rp) {
      rp.targetX = p.x;
      rp.targetZ = p.z;
      rp.targetY = p.y ?? VOXEL_CENTER_Y;
      rp.rotation = p.rotation || 0;
    }
  }
  for (const [id] of remotePlayers) {
    if (!activeIds.has(id)) {
      removeRemotePlayer(id);
    }
  }
  updateHUDCount();
});

socket.on('player-disconnected', (id) => {
  removeRemotePlayer(id);
  updateHUDCount();
});

socket.on('store:open', (store) => {
  showStoreOverlay(store);
});

socket.on('store:closed', () => {
  hideStoreOverlay();
});

camCtrl.onEnterStore = (storeId) => {
  if (SERVER_CONFIG?.features?.iframePortals !== false) {
    socket.emit('store:enter', { storeId });
  }
};

camCtrl.onLeaveStore = () => {
  socket.emit('store:leave');
};

document.addEventListener('click', (e) => {
  const closeBtn = document.getElementById('store-overlay-close');
  if (closeBtn && closeBtn.contains(e.target)) {
    hideStoreOverlay();
    socket.emit('store:leave');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideStoreOverlay();
    socket.emit('store:leave');
  }
});

// --- COLLISION BOXES FOR BUILDINGS ---
let buildingBounds = [
  { x: [-7.5, -2.5], z: [-9.5, -5.5] },
  { x: [2.5, 7.5], z: [-9.5, -5.5] },
  { x: [-7.5, -2.5], z: [5.5, 9.5] },
  { x: [2.5, 7.5], z: [5.5, 9.5] },
  { x: [-13.35, -8.35], z: [-9.5, -5.5] },
  { x: [8.9, 15.6], z: [-11.3, -4.4] },
  { x: [15.5, 21.0], z: [-8.5, -4.0] },
  { x: [16.5, 22.0], z: [4.5, 9.5] },
];

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
  if (!overlay || !iframe) return;
  iframe.src = store.site_url || 'about:blank';
  overlay.classList.remove('hidden');
}

function hideStoreOverlay() {
  const overlay = document.getElementById('store-overlay');
  const iframe = document.getElementById('store-iframe');
  if (overlay) overlay.classList.add('hidden');
  if (iframe) iframe.src = 'about:blank';
}

function checkCollision(x, z) {
  const padding = PLAYER_SIZE / 2 + 0.1;
  for (const b of buildingBounds) {
    if (x + padding > b.x[0] && x - padding < b.x[1] &&
        z + padding > b.z[0] && z - padding < b.z[1]) {
      return true;
    }
  }

  const curbZ = 4;
  if (Math.abs(z) > curbZ && Math.abs(z) < curbZ + 0.3) {
    return false;
  }

  if (Math.abs(x) > BOUNDARY || Math.abs(z) > BOUNDARY) {
    return true;
  }

  return false;
}

function updateMovement(dt) {
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

  if (dx !== 0 || dz !== 0) {
    const len = Math.sqrt(dx * dx + dz * dz);
    dx /= len;
    dz /= len;

    const newX = targetX + dx * MOVE_SPEED * dt;
    const newZ = targetZ + dz * MOVE_SPEED * dt;

    if (!checkCollision(newX, targetZ)) targetX = newX;
    if (!checkCollision(targetX, newZ)) targetZ = newZ;

    currentRotation = Math.atan2(dx, dz);
  }

  if (dx === 0 && dz === 0) {
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

  camCtrl.update(currentX, currentZ);
}

function updateHUDCount() {
  const countEl = document.getElementById('count');
  if (countEl) {
    countEl.textContent = remotePlayers.size + 1;
  }
}

function hideLoading() {
  const el = document.getElementById('loading-screen');
  if (el) el.classList.add('hidden');
}

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
      if (metadata.stores && metadata.stores.length > 0) {
        const storeZones = metadata.stores.map(s => ({
          cx: s.center[0],
          cz: s.center[1],
          storeId: s.storeId,
        }));
        camCtrl.setStoreZones(storeZones);
        console.log(`Store zones carregadas: ${storeZones.length} loja(s)`);
      }
    }

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
    const dx = rp.targetX - rp.voxel.position.x;
    const dz = rp.targetZ - rp.voxel.position.z;
    rp.voxel.changeState(Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01 ? 'walk' : 'idle');
    rp.voxel.position.x += dx * LERP_FACTOR;
    rp.voxel.position.z += dz * LERP_FACTOR;
    rp.voxel.position.y += (rp.targetY - rp.voxel.position.y) * LERP_FACTOR;
    rp.voxel.rotation.y = rp.rotation;
    rp.voxel.updateAnimation(dt);
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
