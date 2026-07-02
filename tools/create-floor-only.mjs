#!/usr/bin/env node

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
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const BOUNDARY = 22.5;
const SCENE_GLB = resolve(ROOT, 'public/assets/scene.glb');
const METADATA_OUTPUT = resolve(ROOT, 'public/assets/scene-metadata.json');

const scene = new THREE.Scene();
const geo = new THREE.PlaneGeometry(BOUNDARY * 2, BOUNDARY * 2);
const mat = new THREE.MeshStandardMaterial({
  color: 0x9CA89C,
  roughness: 0.9,
  metalness: 0,
  side: THREE.DoubleSide,
});
const floor = new THREE.Mesh(geo, mat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
floor.name = 'Ground';
floor.receiveShadow = true;
scene.add(floor);

const exporter = new GLTFExporter();
const result = await new Promise((resolve, reject) => {
  exporter.parse(
    scene,
    (result) => resolve(result),
    (error) => reject(error),
    { binary: true }
  );
});

writeFileSync(SCENE_GLB, Buffer.from(result));
console.log(`OK: ${SCENE_GLB} (${(result.byteLength / 1024).toFixed(1)} KB)`);

writeFileSync(METADATA_OUTPUT, JSON.stringify({ buildings: [], stores: [] }, null, 2));
console.log(`OK: ${METADATA_OUTPUT} limpo`);
