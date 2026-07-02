import * as THREE from 'three';

const ISOMETRIC_PRESETS = [
  { angle: Math.PI * 0.25, distance: 14, height: 12, lateralFactor: 0.15, lookHeight: 0 },
  { angle: Math.PI * 0.1, distance: 7, height: 4, lateralFactor: 0.35, lookHeight: 1.5 },
];

const ISO_STORE_ZOOM = {
  angle: Math.PI * 0.1, distance: 5, height: 3, lateralFactor: 0.4, lookHeight: 1.8,
};

const TP_DEFAULTS = {
  distance: 5,
  height: 2.5,
  lateralOffset: 0.6,
  lookAhead: 2.5,
  lookHeight: 1.8,
  positionLag: 0.04,
  rotationLag: 0.12,
  collisionMargin: 0.3,
  minDistance: 1.5,
};

const TP_STORE_ZOOM = {
  distance: 2.5,
  height: 1.5,
  lateralOffset: 0.3,
  lookAhead: 0.5,
  lookHeight: 1.2,
};

const ISO_FOV = 55;
const TP_FOV = 75;
const TRIGGER_R = 2;

export class CameraController {
  constructor(camera) {
    this.cam = camera;
    this.mode = 'isometric';

    this.isoBase = { ...ISOMETRIC_PRESETS[0] };
    this.isoPresetIndex = 0;

    this.tp = { ...TP_DEFAULTS };
    this.tpSmoothedAngle = 0;
    this.tpInitialized = false;
    this.tpCurrentPos = new THREE.Vector3();
    this.tpCurrentLook = new THREE.Vector3();

    this.mix = 0;
    this.storeTarget = null;
    this.storeZones = [];
    this.currentStoreId = null;
    this.onEnterStore = null;
    this.onLeaveStore = null;

    this.obstacleMeshes = [];
    this.raycaster = new THREE.Raycaster();

    document.addEventListener('camera:toggle', () => this.toggleMode());

    this.cam.fov = ISO_FOV;
    this.cam.updateProjectionMatrix();
  }

  get defaultDistance() {
    return this.mode === 'isometric' ? this.isoBase.distance : this.tp.distance;
  }

  get defaultHeight() {
    return this.mode === 'isometric' ? this.isoBase.height : this.tp.height;
  }

  setDefaultDistance(d) {
    if (this.mode === 'isometric') this.isoBase.distance = d;
    else this.tp.distance = d;
  }

  setDefaultHeight(h) {
    if (this.mode === 'isometric') this.isoBase.height = h;
    else this.tp.height = h;
  }

  setStoreZones(zones) {
    this.storeZones = zones;
  }

  setObstacles(meshes) {
    this.obstacleMeshes = meshes;
  }

  get isThirdPerson() {
    return this.mode === 'thirdPerson';
  }

  toggleMode() {
    if (this.mode === 'isometric') {
      this.mode = 'thirdPerson';
      this.cam.fov = TP_FOV;
      this.tpInitialized = false;
    } else {
      this.mode = 'isometric';
      this.cam.fov = ISO_FOV;
    }
    this.cam.updateProjectionMatrix();
    document.dispatchEvent(new CustomEvent('camera:mode-changed', { detail: { mode: this.mode } }));
  }

  update(px, pz, rotation, dt) {
    this._checkStoreZones(px, pz);

    if (this.mode === 'isometric') {
      this._updateIsometric(px, pz);
    } else {
      this._updateThirdPerson(px, pz, rotation, dt);
    }
  }

  transformInputForMovement(dx, dz) {
    if (this.mode === 'isometric') return { x: dx, z: dz };

    const fwd = new THREE.Vector3();
    this.cam.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 0.001) return { x: dx, z: dz };
    fwd.normalize();

    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);

    return {
      x: right.x * dx + fwd.x * (-dz),
      z: right.z * dx + fwd.z * (-dz),
    };
  }

  _checkStoreZones(px, pz) {
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
  }

  _updateIsometric(px, pz) {
    const t = this.mix;
    const b = this.isoBase;
    const z = this.storeTarget ? ISO_STORE_ZOOM : null;

    const angle = b.angle + ((z?.angle ?? b.angle) - b.angle) * t;
    const dist = b.distance + ((z?.distance ?? b.distance) - b.distance) * t;
    const height = b.height + ((z?.height ?? b.height) - b.height) * t;
    const lat = b.lateralFactor + ((z?.lateralFactor ?? b.lateralFactor) - b.lateralFactor) * t;
    const lookY = b.lookHeight + ((z?.lookHeight ?? b.lookHeight) - b.lookHeight) * t;

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

  _updateThirdPerson(px, pz, rotation, dt) {
    const t = this.mix;
    const b = this.tp;
    const z = this.storeTarget ? TP_STORE_ZOOM : null;

    const distance = z ? b.distance + (z.distance - b.distance) * t : b.distance;
    const height = z ? b.height + (z.height - b.height) * t : b.height;
    const lateralOffset = z ? b.lateralOffset + (z.lateralOffset - b.lateralOffset) * t : b.lateralOffset;
    const lookAhead = z ? b.lookAhead + (z.lookAhead - b.lookAhead) * t : b.lookAhead;
    const lookHeight = z ? b.lookHeight + (z.lookHeight - b.lookHeight) * t : b.lookHeight;

    if (!this.tpInitialized) {
      this.tpSmoothedAngle = rotation;
      this.tpCurrentPos.set(
        px + -Math.sin(rotation) * distance + Math.cos(rotation) * lateralOffset,
        height,
        pz + -Math.cos(rotation) * distance + -Math.sin(rotation) * lateralOffset,
      );
      this.tpCurrentLook.set(px + Math.sin(rotation) * lookAhead, lookHeight, pz + Math.cos(rotation) * lookAhead);
      this.tpInitialized = true;
    }

    let diff = rotation - this.tpSmoothedAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.tpSmoothedAngle += diff * b.rotationLag;

    const angle = this.tpSmoothedAngle;

    const behindX = -Math.sin(angle);
    const behindZ = -Math.cos(angle);
    const rightX = Math.cos(angle);
    const rightZ = -Math.sin(angle);

    let targetX = px + behindX * distance + rightX * lateralOffset;
    let targetZ = pz + behindZ * distance + rightZ * lateralOffset;

    if (this.obstacleMeshes.length > 0) {
      const origin = new THREE.Vector3(px, lookHeight, pz);
      const dir = new THREE.Vector3(targetX - origin.x, height - origin.y, targetZ - origin.z);
      const dist = dir.length();
      if (dist > b.minDistance) {
        dir.divideScalar(dist);
        this.raycaster.set(origin, dir);
        this.raycaster.far = dist;
        const hits = this.raycaster.intersectObjects(this.obstacleMeshes, true);
        const validHit = hits.find(h => h.distance > 0.5);
        if (validHit) {
          const safeDist = Math.max(validHit.distance - b.collisionMargin, b.minDistance);
          const ratio = safeDist / dist;
          targetX = px + (targetX - px) * ratio;
          targetZ = pz + (targetZ - pz) * ratio;
        }
      }
    }

    this.tpCurrentPos.lerp(new THREE.Vector3(targetX, height, targetZ), b.positionLag);
    this.cam.position.copy(this.tpCurrentPos);

    let lookX, lookZ;
    if (this.storeTarget) {
      lookX = px + (this.storeTarget.cx - px) * t;
      lookZ = pz + (this.storeTarget.cz - pz) * t;
    } else {
      const fwdX = Math.sin(rotation);
      const fwdZ = Math.cos(rotation);
      lookX = px + fwdX * lookAhead;
      lookZ = pz + fwdZ * lookAhead;
    }

    this.tpCurrentLook.lerp(new THREE.Vector3(lookX, lookHeight, lookZ), b.positionLag);
    this.cam.lookAt(this.tpCurrentLook);
  }
}
