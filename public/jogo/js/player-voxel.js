import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

function createGeometry(type, params) {
  switch (type) {
    case 'sphere': return new THREE.SphereGeometry(...params);
    case 'roundedBox': return new RoundedBoxGeometry(...params);
    case 'cylinder': return new THREE.CylinderGeometry(...params);
    default: return new THREE.BoxGeometry(...params);
  }
}

const BODY_DEF = {
  cabeca:   { type: 'sphere',     params: [0.24, 8, 8],                  offset: [0, 0.83, 0] },
  tronco:   { type: 'roundedBox', params: [0.42, 0.65, 0.4, 3, 0.1],    offset: [0, 0.2, 0] },
  bracoEsq: { type: 'cylinder',   params: [0.12, 0.1, 0.55, 6],         offset: [-0.28, 0.25, 0] },
  bracoDir: { type: 'cylinder',   params: [0.12, 0.1, 0.55, 6],         offset: [0.28, 0.25, 0] },
  pernaEsq: { type: 'cylinder',   params: [0.14, 0.1, 0.5, 6],          offset: [-0.15, -0.3, 0] },
  pernaDir: { type: 'cylinder',   params: [0.14, 0.1, 0.5, 6],          offset: [0.15, -0.3, 0] },
};

export const PALETTES = [
  { cabeca: 0x4A90D9, tronco: 0x2C5F8A, bracoEsq: 0x1E3A5F, bracoDir: 0x1E3A5F, pernaEsq: 0x1E3A5F, pernaDir: 0x1E3A5F },
  { cabeca: 0xD94A4A, tronco: 0x8A2C2C, bracoEsq: 0x5F1E1E, bracoDir: 0x5F1E1E, pernaEsq: 0x5F1E1E, pernaDir: 0x5F1E1E },
  { cabeca: 0x4AD94A, tronco: 0x2C8A2C, bracoEsq: 0x1E5F1E, bracoDir: 0x1E5F1E, pernaEsq: 0x1E5F1E, pernaDir: 0x1E5F1E },
  { cabeca: 0xD9A64A, tronco: 0x8A6F2C, bracoEsq: 0x5F4C1E, bracoDir: 0x5F4C1E, pernaEsq: 0x5F4C1E, pernaDir: 0x5F4C1E },
  { cabeca: 0x9B4AD9, tronco: 0x642C8A, bracoEsq: 0x451E5F, bracoDir: 0x451E5F, pernaEsq: 0x451E5F, pernaDir: 0x451E5F },
  { cabeca: 0x4AD9D9, tronco: 0x2C8A8A, bracoEsq: 0x1E5F5F, bracoDir: 0x1E5F5F, pernaEsq: 0x1E5F5F, pernaDir: 0x1E5F5F },
  { cabeca: 0xD94AD9, tronco: 0x8A2C8A, bracoEsq: 0x5F1E5F, bracoDir: 0x5F1E5F, pernaEsq: 0x5F1E5F, pernaDir: 0x5F1E5F },
  { cabeca: 0xD9D94A, tronco: 0x8A8A2C, bracoEsq: 0x5F5F1E, bracoDir: 0x5F5F1E, pernaEsq: 0x5F5F1E, pernaDir: 0x5F5F1E },
];

const STATE_CONFIG = {
  idle: {
    getTargets(t) {
      return {
        tronco:   { x: 0, y: 0, z: Math.sin(t * 1.5) * 0.015 },
        bracoEsq: { x: Math.sin(t * 2) * 0.04, y: 0, z: 0 },
        bracoDir: { x: -Math.sin(t * 2) * 0.04, y: 0, z: 0 },
        pernaEsq: { x: 0, y: 0, z: 0 },
        pernaDir: { x: 0, y: 0, z: 0 },
      };
    },
  },
  walk: {
    getTargets(t) {
      const s = Math.sin(t * 8) * 0.4;
      return {
        tronco:   { x: 0, y: 0, z: 0 },
        bracoEsq: { x: s, y: 0, z: 0 },
        bracoDir: { x: -s, y: 0, z: 0 },
        pernaEsq: { x: -s, y: 0, z: 0 },
        pernaDir: { x: s, y: 0, z: 0 },
      };
    },
  },
  run: {
    getTargets(t) {
      const s = Math.sin(t * 14) * 0.7;
      return {
        tronco:   { x: Math.sin(t * 14) * 0.05, y: 0, z: 0 },
        bracoEsq: { x: s, y: 0, z: 0 },
        bracoDir: { x: -s, y: 0, z: 0 },
        pernaEsq: { x: -s * 1.1, y: 0, z: 0 },
        pernaDir: { x: s * 1.1, y: 0, z: 0 },
      };
    },
  },
};

export class PlayerVoxel {
  constructor(palette) {
    this.group = new THREE.Group();
    this.parts = {};
    this.animTime = 0;
    this.currentState = 'idle';
    this.transitionT = 1;
    this.fromRotations = {};

    for (const [name, def] of Object.entries(BODY_DEF)) {
      const color = palette[name] || 0xCCCCCC;
      const geo = createGeometry(def.type, def.params);
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.5,
        metalness: 0.02,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...def.offset);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.parts[name] = mesh;
    }
  }

  get position() {
    return this.group.position;
  }

  set position(v) {
    this.group.position.copy(v);
  }

  get rotation() {
    return this.group.rotation;
  }

  set rotation(v) {
    this.group.rotation.copy(v);
  }

  changeState(newState) {
    if (newState === this.currentState && this.transitionT >= 1) return;

    this.fromRotations = {};
    for (const name of Object.keys(this.parts)) {
      this.fromRotations[name] = {
        x: this.parts[name].rotation.x,
        y: this.parts[name].rotation.y,
        z: this.parts[name].rotation.z,
      };
    }

    this.currentState = newState;
    this.transitionT = 0;
  }

  updateAnimation(dt) {
    this.animTime += dt;

    const config = STATE_CONFIG[this.currentState];
    if (!config) return;

    const targets = config.getTargets(this.animTime);

    if (this.transitionT < 1) {
      this.transitionT = Math.min(this.transitionT + dt / 0.2, 1);
      const t = this.transitionT;
      const ease = t * t * (3 - 2 * t);

      for (const [name, target] of Object.entries(targets)) {
        const from = this.fromRotations[name] || { x: 0, y: 0, z: 0 };
        this.parts[name].rotation.x = from.x + (target.x - from.x) * ease;
        this.parts[name].rotation.y = from.y + (target.y - from.y) * ease;
        this.parts[name].rotation.z = from.z + (target.z - from.z) * ease;
      }
    } else {
      for (const [name, target] of Object.entries(targets)) {
        this.parts[name].rotation.x = target.x;
        this.parts[name].rotation.y = target.y;
        this.parts[name].rotation.z = target.z;
      }
    }
  }

  setPalette(palette) {
    for (const [name, color] of Object.entries(palette)) {
      const mesh = this.parts[name];
      if (mesh) mesh.material.color.setHex(color);
    }
  }

  dispose() {
    for (const mesh of Object.values(this.parts)) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
