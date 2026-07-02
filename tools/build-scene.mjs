if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    constructor() { this.result = null; this.onload = null; this.onloadend = null; }
    readAsArrayBuffer(blob) {
      const finish = () => {
        if (this.onload) this.onload({ target: this });
        if (this.onloadend) this.onloadend({ target: this });
      };
      if (blob instanceof Blob) {
        blob.arrayBuffer().then(buf => { this.result = buf; finish(); });
      } else {
        this.result = blob; finish();
      }
    }
  };
}

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================
// LOAD CONFIG
// ============================================================
function loadBuildConfig() {
  const configPath = join(__dirname, '..', 'config', 'config.json');
  const defaults = {
    halfStreet: 20,
    streetWidth: 8,
    sidewalkWidth: 1.5,
    buildingWidth: 5,
    buildingDepth: 4,
    buildingHeight: 3.2,
    lightDirection: { x: 0.4, y: 0.7, z: 0.3 },
    ambientIntensity: 0.35,
    lightIntensity: 0.65,
    includeTrees: true,
    includeLamps: true,
    includeStreetMarkings: true,
    vertexBakingEnabled: true,
    ambientOcclusion: true,
  };

  try {
    const raw = readFileSync(configPath, 'utf8');
    const file = JSON.parse(raw);
    const build = file.build || {};
    return { ...defaults, ...build };
  } catch {
    return defaults;
  }
}

const cfg = loadBuildConfig();
console.log('[Build] Configuração:', JSON.stringify(cfg, null, 2));

const OUTPUT = join(__dirname, '..', 'public', 'assets', 'scene.glb');
const METADATA_OUTPUT = join(__dirname, '..', 'public', 'assets', 'scene-metadata.json');

mkdirSync(dirname(OUTPUT), { recursive: true });

const scene = new THREE.Scene();

function createBox(w, h, d, color, pos) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pos.x, pos.y, pos.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createPlane(w, d, color, pos, rotX = -Math.PI / 2) {
  const geo = new THREE.PlaneGeometry(w, d);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = rotX;
  mesh.position.set(pos.x, pos.y, pos.z);
  mesh.receiveShadow = true;
  return mesh;
}

function createWindow(w, h, pos, color = 0x88ccff, emissive = 0x446688) {
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshStandardMaterial({
    color, emissive, emissiveIntensity: 0.3,
    roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pos.x, pos.y, pos.z);
  return mesh;
}

function createDoor(w, h, pos, color = 0x8B4513) {
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pos.x, pos.y, pos.z);
  return mesh;
}

function createAwning(w, d, pos, color) {
  const group = new THREE.Group();
  const segs = 4;
  for (let i = 0; i < segs; i++) {
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(w / segs, d),
      new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? color : 0xffffff, roughness: 0.8, side: THREE.DoubleSide })
    );
    strip.position.set(pos.x - w / 2 + (i + 0.5) * (w / segs), pos.y, pos.z);
    strip.rotation.x = Math.PI * 0.15;
    group.add(strip);
  }
  return group;
}

function createBarberPole(pos, h) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, h, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
  );
  pole.position.set(0, h / 2, 0);
  group.add(pole);
  const colors = [0xff0000, 0xffffff, 0x0000ff];
  for (let i = 0; i < 6; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.1, 0.03, 6, 8),
      new THREE.MeshStandardMaterial({ color: colors[i % 3], roughness: 0.5 })
    );
    ring.position.set(0, (i + 0.5) * (h / 6), 0);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }
  group.position.set(pos.x, pos.y, pos.z);
  return group;
}

function createTree(pos, s) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08 * s, 0.12 * s, 1.5 * s, 6),
    new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.9 })
  );
  trunk.position.set(0, 0.75 * s, 0);
  group.add(trunk);

  for (let i = 0; i < 3; i++) {
    const r = 0.5 * s * (1 - i * 0.2);
    const green = new THREE.Mesh(
      new THREE.SphereGeometry(r, 6, 6),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.32, 0.6, 0.25 + i * 0.08),
        roughness: 0.8
      })
    );
    green.position.set(0, 1.5 * s + i * 0.3 * s, 0);
    green.scale.y = 0.7;
    group.add(green);
  }

  group.position.set(pos.x, 0, pos.z);
  return group;
}

function createStreetLamp(pos) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.06, 2.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.5, metalness: 0.3 })
  );
  pole.position.set(0, 1.25, 0);
  group.add(pole);

  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.04, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.5, metalness: 0.3 })
  );
  arm.position.set(0.3, 2.5, 0);
  group.add(arm);

  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffdd88, emissive: 0xffaa44, emissiveIntensity: 0.5 })
  );
  lamp.position.set(0.6, 2.45, 0);
  group.add(lamp);

  group.position.set(pos.x, 0, pos.z);
  return group;
}

function bakeLightingInMesh(mesh, lightDir, ambientIntensity, lightIntensity) {
  const geo = mesh.geometry;
  if (!geo.attributes.position) return;

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const baseColor = mesh.material.color || new THREE.Color(0x888888);

  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (geo.attributes.normal) {
      n.fromBufferAttribute(geo.attributes.normal, i);
    } else {
      n.set(0, 1, 0);
    }

    const ndl = Math.max(0, n.dot(lightDir));
    const amb = baseColor.clone().multiplyScalar(ambientIntensity);
    const diff = baseColor.clone().multiplyScalar(ndl * lightIntensity);
    amb.add(diff);

    const ao = 1 - (Math.abs(p.y - 0) < 0.5 ? 0.05 : 0);
    amb.multiplyScalar(ao);

    colors[i * 3] = amb.r;
    colors[i * 3 + 1] = amb.g;
    colors[i * 3 + 2] = amb.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const newMat = mesh.material.clone();
  newMat.vertexColors = true;
  mesh.material = newMat;
}

// ============================================================
// CITY LAYOUT CONSTANTS (from config)
// ============================================================
const HALF_STREET = cfg.halfStreet;
const STREET_WIDTH = cfg.streetWidth;
const SIDEWALK_WIDTH = cfg.sidewalkWidth;
const BW = cfg.buildingWidth;
const BD = cfg.buildingDepth;
const BH = cfg.buildingHeight;
const sidewalkY = 0.05;

const leftRowZ = -(STREET_WIDTH / 2 + SIDEWALK_WIDTH + BD / 2);
const rightRowZ = (STREET_WIDTH / 2 + SIDEWALK_WIDTH + BD / 2);
const bx = [-HALF_STREET / 4, HALF_STREET / 4];

// ============================================================
// STREET
// ============================================================
scene.add(createPlane(HALF_STREET * 2, STREET_WIDTH, 0x444444, { x: 0, y: 0, z: 0 }));
if (cfg.includeStreetMarkings) {
  scene.add(createPlane(HALF_STREET * 2 - 2, 0.1, 0x888888, { x: 0, y: 0.01, z: 0 }));
}

// ============================================================
// SIDEWALKS
// ============================================================
for (const zs of [-1, 1]) {
  scene.add(createPlane(HALF_STREET * 2, SIDEWALK_WIDTH, 0xaaaaaa, { x: 0, y: sidewalkY, z: zs * (STREET_WIDTH / 2 + SIDEWALK_WIDTH / 2) }));
}

// ============================================================
// CURBS
// ============================================================
for (const zs of [-1, 1]) {
  const curb = new THREE.Mesh(
    new THREE.BoxGeometry(HALF_STREET * 2, 0.15, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x666666 })
  );
  curb.position.set(0, 0.075, zs * (STREET_WIDTH / 2));
  scene.add(curb);
}

// ============================================================
// BUILDINGS
// ============================================================
const buildings = [
  { name: 'Café', x: bx[0], z: leftRowZ, color: 0xD4A574, roof: 0x8B4513, accent: 0xA0522D, hasAwning: true, awningColor: 0xD32F2F },
  { name: 'Farmácia', x: bx[1], z: leftRowZ, color: 0xE8F5E9, roof: 0x4CAF50, accent: 0x388E3C, hasAwning: false, awningColor: 0 },
  { name: 'Padaria', x: bx[0], z: rightRowZ, color: 0xFFE0B2, roof: 0xE65100, accent: 0xBF360C, hasAwning: true, awningColor: 0xFF6F00 },
  { name: 'Barbearia', x: bx[1], z: rightRowZ, color: 0xE3F2FD, roof: 0x1565C0, accent: 0x0D47A1, hasAwning: false, awningColor: 0 },
];

for (const b of buildings) {
  const basePos = { x: b.x, y: sidewalkY + BH / 2, z: b.z };
  const base = createBox(BW, BH, BD, b.color, basePos);
  scene.add(base);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(BW * 0.9, 0.3, BD * 0.9),
    new THREE.MeshStandardMaterial({ color: b.roof, roughness: 0.9 })
  );
  roof.position.set(b.x, sidewalkY + BH, b.z);
  scene.add(roof);

  const isLeft = b.z < 0;
  const fz = b.z + (isLeft ? BD / 2 + 0.01 : -BD / 2 - 0.01);

  const door = createDoor(0.6, 1.5, { x: b.x, y: 0.75, z: fz });
  scene.add(door);

  for (const side of [-1, 1]) {
    const win = createWindow(0.7, 0.7, { x: b.x + side * 1.3, y: 2.0, z: fz });
    scene.add(win);
  }

  const signBg = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 0.35),
    new THREE.MeshStandardMaterial({ color: b.accent, roughness: 0.5, side: THREE.DoubleSide })
  );
  signBg.position.set(b.x, 0.3, fz);
  scene.add(signBg);

  if (b.hasAwning) {
    const awning = createAwning(3.5, 0.6, { x: b.x, y: 1.0, z: fz }, b.awningColor);
    scene.add(awning);
  }

  if (b.name === 'Farmácia') {
    const crossC = 0x4CAF50;
    const crossMat = new THREE.MeshStandardMaterial({ color: crossC, emissive: crossC, emissiveIntensity: 0.3 });
    const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.05), crossMat);
    hBar.position.set(b.x, 2.8, fz);
    scene.add(hBar);
    const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.05), crossMat);
    vBar.position.set(b.x, 2.8, fz);
    scene.add(vBar);
  }

  if (b.name === 'Barbearia') {
    const pole = createBarberPole({ x: b.x + 2.0, y: 0, z: fz }, 1.2);
    scene.add(pole);
  }

  if (b.name === 'Café') {
    const cup = new THREE.Group();
    const cupBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.15, 0.25, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    );
    cupBody.position.set(0, 0.125, 0);
    cup.add(cupBody);
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.08, 0.025, 6, 8, Math.PI * 0.8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    );
    handle.position.set(0.2, 0.125, 0);
    handle.rotation.z = 0.2;
    cup.add(handle);
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(
        new THREE.TorusGeometry(0.03, 0.01, 4, 6),
        new THREE.MeshStandardMaterial({ color: 0xcccccc, transparent: true, opacity: 0.4 })
      );
      s.position.set(-0.04 + i * 0.04, 0.28 + i * 0.05, 0);
      s.rotation.x = Math.PI / 2;
      cup.add(s);
    }
    cup.position.set(b.x + 1.2, 1.2, fz);
    scene.add(cup);
  }

  for (const sxo of [-1.5, 1.5]) {
    const sw = createWindow(0.5, 0.5, { x: b.x + sxo, y: 1.8, z: b.z + (isLeft ? -BD / 2 : BD / 2) });
    sw.rotation.y = Math.PI / 2;
    scene.add(sw);
  }
}

// ============================================================
// TREES (feature flag: includeTrees)
// ============================================================
if (cfg.includeTrees) {
  const trees = [
    { x: -HALF_STREET / 2 + 1, z: leftRowZ - 2.5 },
    { x: -HALF_STREET / 2 + 1, z: rightRowZ + 2.5 },
    { x: HALF_STREET / 2 - 1, z: leftRowZ - 2.5 },
    { x: HALF_STREET / 2 - 1, z: rightRowZ + 2.5 },
  ];
  for (const t of trees) {
    scene.add(createTree(t, 0.8));
  }
}

// ============================================================
// LAMPS (feature flag: includeLamps)
// ============================================================
if (cfg.includeLamps) {
  const lamps = [
    { x: -4, z: -(STREET_WIDTH / 2 + 0.5) },
    { x: 4, z: -(STREET_WIDTH / 2 + 0.5) },
    { x: -4, z: (STREET_WIDTH / 2 + 0.5) },
    { x: 4, z: (STREET_WIDTH / 2 + 0.5) },
  ];
  for (const l of lamps) {
    scene.add(createStreetLamp(l));
  }
}

// ============================================================
// BAKED LIGHTING (from config)
// ============================================================
if (cfg.vertexBakingEnabled) {
  const ld = cfg.lightDirection;
  const lightDir = new THREE.Vector3(ld.x, ld.y, ld.z).normalize();
  scene.traverse((child) => {
    if (child.isMesh) {
      bakeLightingInMesh(child, lightDir, cfg.ambientIntensity, cfg.lightIntensity);
    }
  });
}

// ============================================================
// EXPORT
// ============================================================
console.log('Exportando cena para .glb...');

// Gerar metadata com bounds dos edifícios (para colisão no jogo)
const metadata = {
  buildings: buildings.map(b => {
    const isLeft = b.z < 0;
    return {
      name: b.name,
      bounds: {
        x: [b.x - BW / 2, b.x + BW / 2],
        z: [b.z - BD / 2, b.z + BD / 2],
      },
    };
  }),
  stores: [],
};

writeFileSync(METADATA_OUTPUT, JSON.stringify(metadata, null, 2));
console.log(`OK: ${METADATA_OUTPUT}`);

const exporter = new GLTFExporter();

exporter.parse(
  scene,
  (result) => {
    if (result instanceof ArrayBuffer) {
      writeFileSync(OUTPUT, Buffer.from(result));
      const sizeKB = (result.byteLength / 1024).toFixed(1);
      console.log(`OK: ${OUTPUT} (${sizeKB} KB)`);
    } else {
      writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
      const sizeKB = (Buffer.byteLength(JSON.stringify(result)) / 1024).toFixed(1);
      console.log(`OK: ${OUTPUT} (${sizeKB} KB)`);
    }
    process.exit(0);
  },
  (error) => {
    console.error('ERRO:', error);
    process.exit(1);
  },
  { binary: true, trs: false, onlyVisible: true }
);
