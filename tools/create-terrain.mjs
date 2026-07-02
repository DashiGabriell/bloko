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
import { writeFileSync, unlinkSync, existsSync, renameSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const BOUNDARY = 22.5;
const TERRAIN_GLB = resolve(ROOT, 'public/assets/terrain-temp.glb');
const SCENE_GLB = resolve(ROOT, 'public/assets/scene.glb');
const MERGED_GLB = resolve(ROOT, 'public/assets/scene-merged.glb');

const scene = new THREE.Scene();

const geo = new THREE.PlaneGeometry(BOUNDARY * 2, BOUNDARY * 2);
const mat = new THREE.MeshBasicMaterial({
  color: 0x44bb44,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.35,
});
const plane = new THREE.Mesh(geo, mat);
plane.rotation.x = -Math.PI / 2;
plane.position.y = -0.02;
plane.name = 'Terrain_Limite';
scene.add(plane);

// Green border line
const borderMat = new THREE.LineBasicMaterial({ color: 0x00ff00 });
const pts = [
  new THREE.Vector3(-BOUNDARY, 0, -BOUNDARY),
  new THREE.Vector3(BOUNDARY, 0, -BOUNDARY),
  new THREE.Vector3(BOUNDARY, 0, BOUNDARY),
  new THREE.Vector3(-BOUNDARY, 0, BOUNDARY),
  new THREE.Vector3(-BOUNDARY, 0, -BOUNDARY),
];
const borderGeo = new THREE.BufferGeometry().setFromPoints(pts);
const borderLine = new THREE.Line(borderGeo, borderMat);
borderLine.position.y = 0.01;
borderLine.name = 'Terrain_Borda';
scene.add(borderLine);

const exporter = new GLTFExporter();
const result = await new Promise((resolve, reject) => {
  exporter.parse(
    scene,
    (result) => resolve(result),
    (error) => reject(error),
    { binary: true }
  );
});

writeFileSync(TERRAIN_GLB, Buffer.from(result));
console.log(`Terrain GLB criado: ${TERRAIN_GLB}`);

// Merge into scene.glb using gltf-transform
if (!existsSync(SCENE_GLB)) {
  console.error(`ERRO: ${SCENE_GLB} nao encontrado`);
  process.exit(1);
}

console.log('Fazendo merge no scene.glb...');
try {
  execSync(
    `npx gltf-transform merge "${SCENE_GLB}" "${TERRAIN_GLB}" "${MERGED_GLB}"`,
    { cwd: ROOT, stdio: 'pipe', timeout: 30000 }
  );
  console.log('Merge concluido!');
} catch (err) {
  console.error('Merge falhou, tentando copiar com copy...');
  try {
    execSync(
      `npx gltf-transform copy "${SCENE_GLB}" "${MERGED_GLB}"`,
      { cwd: ROOT, stdio: 'pipe', timeout: 30000 }
    );
    console.log('Copy concluido (merge nao disponivel, copiando original)');
  } catch (err2) {
    console.error('ERRO:', err2.message);
    process.exit(1);
  }
}

// Replace original
renameSync(MERGED_GLB, SCENE_GLB);
console.log(`scene.glb atualizado: ${SCENE_GLB}`);

// Re-compress with Draco
console.log('Recomprimindo com Draco...');
try {
  execSync(
    `npx gltf-transform draco "${SCENE_GLB}" "${SCENE_GLB}"`,
    { cwd: ROOT, stdio: 'pipe', timeout: 60000 }
  );
  console.log('Draco compression concluida!');
} catch (err) {
  console.error('Aviso: Draco compression falhou:', err.message);
}

// Cleanup
try { unlinkSync(TERRAIN_GLB); } catch {}
try { unlinkSync(MERGED_GLB); } catch {}

const size = statSync(SCENE_GLB).size;
console.log(`Final: ${(size / 1024).toFixed(1)} KB`);
console.log('OK!');
