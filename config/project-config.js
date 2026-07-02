import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, 'config.json');

const defaults = {
  features: {
    multiplayer: true,
    iframePortals: true,
    collisionDetection: true,
    touchControls: true,
    autoCreateRooms: true,
    sceneShadows: true,
    fog: true,
    vertexColors: true,
    trees: true,
    lamps: true,
    streetMarkings: true,
  },

  environment: {
    worldBounds: 22.5,
    playerSize: 0.5,
    playerHeight: 0.5,
    playerSpeed: 5,
    lerpFactor: 0.1,
    skyColor: '#87CEEB',
    fogColor: '#87CEEB',
    fogNear: 25,
    fogFar: 45,
    ambientLightIntensity: 0.5,
    directionalLightIntensity: 1.0,
    fillLightIntensity: 0.3,
    hemisphereLightIntensity: 0.6,
    cameraFov: 55,
    cameraFovThirdPerson: 75,
    cameraDistance: 14,
    cameraHeight: 12,
    thirdPersonDistance: 5,
    thirdPersonHeight: 2.5,
    thirdPersonLateralOffset: 0.6,
    thirdPersonLookAhead: 2.5,
    thirdPersonLookHeight: 1.8,
    thirdPersonPositionLag: 0.04,
    thirdPersonRotationLag: 0.12,
    toneMappingExposure: 1.2,
  },

  network: {
    tickRate: 15,
    corsOrigin: '*',
    serverPort: 3000,
  },

  rooms: {
    maxPlayersPerRoom: 10,
    defaultRoomName: 'Quadra Principal',
  },

  debug: {
    showFps: false,
    showHitboxes: false,
    showPlayerCoordinates: false,
    showGrid: false,
    showCollisionBounds: false,
    enableServerLogs: true,
    logLevel: 'info',
    showWireframe: false,
  },

  build: {
    dracoCompression: true,
    vertexBakingEnabled: true,
    ambientOcclusion: true,
    sceneOutputPath: 'public/assets/scene.glb',
    includeTrees: true,
    includeLamps: true,
    includeStreetMarkings: true,
    halfStreet: 20,
    streetWidth: 8,
    sidewalkWidth: 1.5,
    buildingWidth: 5,
    buildingDepth: 4,
    buildingHeight: 3.2,
    lightDirection: { x: 0.4, y: 0.7, z: 0.3 },
    ambientIntensity: 0.35,
    lightIntensity: 0.65,
  },

  admin: {
    title: 'BLOKO Admin',
    theme: 'dark',
    autoRefresh: true,
    refreshInterval: 5000,
  },
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function deepMerge(target, source) {
  const result = clone(target);
  for (const key in source) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

let currentConfig = clone(defaults);

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const overrides = JSON.parse(raw);
      currentConfig = deepMerge(defaults, overrides);
      console.log('[Config] Configuração carregada de config.json');
    } else {
      currentConfig = clone(defaults);
      console.log('[Config] Usando configuração padrão');
    }
  } catch (err) {
    console.error('[Config] Erro ao carregar config.json:', err.message);
    currentConfig = clone(defaults);
  }
  return currentConfig;
}

function saveConfig(newConfig) {
  try {
    const merged = deepMerge(defaults, newConfig);
    currentConfig = merged;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf8');
    console.log('[Config] Configuração salva em config.json');
    return true;
  } catch (err) {
    console.error('[Config] Erro ao salvar:', err.message);
    return false;
  }
}

function getConfig() {
  return clone(currentConfig);
}

function getDefaults() {
  return clone(defaults);
}

function resetConfig() {
  currentConfig = clone(defaults);
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      fs.unlinkSync(CONFIG_PATH);
    }
    console.log('[Config] Configuração resetada para padrões');
    return true;
  } catch (err) {
    console.error('[Config] Erro ao resetar:', err.message);
    return false;
  }
}

loadConfig();

export default { getConfig, getDefaults, saveConfig, resetConfig, loadConfig };
