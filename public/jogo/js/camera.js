import * as THREE from 'three';

const PRESETS = [
  {
    angle: Math.PI * 0.25,
    distance: 14,
    height: 12,
    lateralFactor: 0.15,
    lookHeight: 0,
  },
  {
    angle: Math.PI * 0.1,
    distance: 7,
    height: 4,
    lateralFactor: 0.35,
    lookHeight: 1.5,
  },
];

const STORE_ZOOM = {
  angle: Math.PI * 0.1,
  distance: 5,
  height: 3,
  lateralFactor: 0.4,
  lookHeight: 1.8,
};

const TRIGGER_R = 4;

export class CameraController {
  constructor(camera) {
    this.cam = camera;
    this.base = { ...PRESETS[0] };
    this.presetIndex = 0;
    this.mix = 0;
    this.storeTarget = null;
    this.storeZones = [];
    this.currentStoreId = null;
    this.onEnterStore = null;
    this.onLeaveStore = null;

    document.addEventListener('camera:toggle', () => this.togglePreset());
  }

  get defaultDistance() { return this.base.distance; }
  get defaultHeight() { return this.base.height; }

  setDefaultDistance(d) { this.base.distance = d; }
  setDefaultHeight(h) { this.base.height = h; }

  setStoreZones(zones) {
    this.storeZones = zones;
  }

  togglePreset() {
    this.presetIndex = (this.presetIndex + 1) % PRESETS.length;
    const p = PRESETS[this.presetIndex];
    this.base.angle = p.angle;
    this.base.distance = p.distance;
    this.base.height = p.height;
    this.base.lateralFactor = p.lateralFactor;
    this.base.lookHeight = p.lookHeight;
  }

  update(px, pz) {
    let nearest = null;
    let nearSq = Infinity;
    for (const s of this.storeZones) {
      const dx = px - s.cx;
      const dz = pz - s.cz;
      const d = dx * dx + dz * dz;
      if (d < TRIGGER_R * TRIGGER_R && d < nearSq) {
        nearest = s;
        nearSq = d;
      }
    }

    if (nearest) {
      if (this.currentStoreId !== nearest.storeId) {
        if (this.currentStoreId && this.onLeaveStore) this.onLeaveStore(this.currentStoreId);
        this.currentStoreId = nearest.storeId;
        if (this.onEnterStore) this.onEnterStore(nearest.storeId);
      }
      this.mix = Math.min(this.mix + 0.04, 1);
      this.storeTarget = nearest;
    } else if (this.currentStoreId) {
      if (this.onLeaveStore) this.onLeaveStore(this.currentStoreId);
      this.currentStoreId = null;
      this.mix = Math.max(this.mix - 0.04, 0);
      if (this.mix === 0) this.storeTarget = null;
    } else {
      this.mix = Math.max(this.mix - 0.04, 0);
      if (this.mix === 0) this.storeTarget = null;
    }

    const t = this.mix;
    const b = this.base;

    const angle = b.angle + (STORE_ZOOM.angle - b.angle) * t;
    const dist = b.distance + (STORE_ZOOM.distance - b.distance) * t;
    const height = b.height + (STORE_ZOOM.height - b.height) * t;
    const lat = b.lateralFactor + (STORE_ZOOM.lateralFactor - b.lateralFactor) * t;
    const lookY = b.lookHeight + (STORE_ZOOM.lookHeight - b.lookHeight) * t;

    const cx = px + Math.sin(angle) * dist * lat;
    const cz = pz + Math.cos(angle) * dist;

    this.cam.position.lerp(new THREE.Vector3(cx, height, cz), 0.05);

    if (this.storeTarget) {
      const lx = px + (this.storeTarget.cx - px) * t;
      const lz = pz + (this.storeTarget.cz - pz) * t;
      this.cam.lookAt(lx, lookY, lz);
    } else {
      this.cam.lookAt(px, lookY, pz);
    }
  }
}
