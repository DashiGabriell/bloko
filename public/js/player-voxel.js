import * as THREE from 'three';

const BODY_DEF = {
  cabeca:   { size: [0.5, 0.5, 0.5],  offset: [0, 0.9, 0] },
  tronco:   { size: [0.6, 0.65, 0.4], offset: [0, 0.2, 0] },
  bracoEsq: { size: [0.22, 0.55, 0.22], offset: [-0.41, 0.35, 0] },
  bracoDir: { size: [0.22, 0.55, 0.22], offset: [0.41, 0.35, 0] },
  pernaEsq: { size: [0.28, 0.5, 0.28],  offset: [-0.15, -0.3, 0] },
  pernaDir: { size: [0.28, 0.5, 0.28],  offset: [0.15, -0.3, 0] },
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

export class PlayerVoxel {
  constructor(palette) {
    this.group = new THREE.Group();
    this.parts = {};
    this.animTime = 0;
    this.isMoving = false;

    for (const [name, def] of Object.entries(BODY_DEF)) {
      const color = palette[name] || 0xCCCCCC;
      const geo = new THREE.BoxGeometry(...def.size);
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.4,
        metalness: 0.05,
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

  setMoving(moving) {
    this.isMoving = moving;
  }

  updateAnimation(dt) {
    if (this.isMoving) {
      this.animTime += dt * 10;
      const swing = Math.sin(this.animTime) * 0.6;
      this.parts.bracoEsq.rotation.x = swing;
      this.parts.bracoDir.rotation.x = -swing;
      this.parts.pernaEsq.rotation.x = -swing;
      this.parts.pernaDir.rotation.x = swing;
    } else if (this.animTime !== 0) {
      this.animTime = 0;
      this.parts.bracoEsq.rotation.x = 0;
      this.parts.bracoDir.rotation.x = 0;
      this.parts.pernaEsq.rotation.x = 0;
      this.parts.pernaDir.rotation.x = 0;
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
