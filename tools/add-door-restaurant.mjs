#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const GLB_PATH = resolve(ROOT, 'public/assets/scene.glb');

function readGLB(path) {
  const buf = readFileSync(path);
  const magic = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  if (magic !== 0x46546C67) throw new Error('Not a GLB file');
  if (version !== 2) throw new Error('Unsupported GLB version');

  const chunks = [];
  let offset = 12;
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.slice(offset + 8, offset + 8 + length);
    chunks.push({ type, length, data });
    offset += 8 + length;
  }
  return { header: { magic, version, length: buf.length }, chunks };
}

function findChunk(chunks, type) {
  return chunks.find(c => c.type === type);
}

function writeUint32(buf, offset, val) {
  buf[offset] = val & 0xFF;
  buf[offset + 1] = (val >> 8) & 0xFF;
  buf[offset + 2] = (val >> 16) & 0xFF;
  buf[offset + 3] = (val >> 24) & 0xFF;
}

function main() {
  console.log('  Lendo GLB...');
  const glb = readGLB(GLB_PATH);

  const jsonChunk = findChunk(glb.chunks, 0x4E4F534A);
  const binChunk = findChunk(glb.chunks, 0x004E4942);

  if (!jsonChunk || !binChunk) {
    console.error('  ERRO: JSON or BIN chunk not found');
    process.exit(1);
  }

  const json = JSON.parse(jsonChunk.data.toString('utf8'));

  // ---- Build vertex data for door plane ----
  const hw = 0.3, hh = 0.75;

  // Positions: 4 VEC3 float32
  const pos = new Float32Array([
    -hw, -hh, 0,   hw, -hh, 0,   hw, hh, 0,   -hw, hh, 0
  ]);

  // Normals: 4 VEC3 float32 (facing +Z)
  const norm = new Float32Array([0,0,1, 0,0,1, 0,0,1, 0,0,1]);

  // UVs: 4 VEC2 float32
  const uv = new Float32Array([0,0, 1,0, 1,1, 0,1]);

  // Indices: 6 uint16
  const idx = new Uint16Array([0,1,2, 0,2,3]);

  // Concatenate all into one buffer
  const binData = Buffer.concat([
    Buffer.from(pos.buffer),
    Buffer.from(norm.buffer),
    Buffer.from(uv.buffer),
    Buffer.from(idx.buffer),
  ]);
  // 48 + 48 + 32 + 12 = 140 bytes
  console.log(`  Dados da porta: ${binData.length} bytes`);

  // ---- Current buffer info ----
  const bufLen = json.buffers[0].byteLength;
  const newBufLen = bufLen + binData.length;
  const bvIndex = json.bufferViews.length;
  const accBase = json.accessors.length; // 504

  console.log(`  BufferViews existentes: ${json.bufferViews.length}`);
  console.log(`  Accessors existentes: ${json.accessors.length}`);
  console.log(`  Meshes existentes: ${json.meshes.length}`);
  console.log(`  Nos existentes: ${json.nodes.length}`);

  // ---- Add bufferView ----
  json.bufferViews.push({
    buffer: 0,
    byteOffset: bufLen,
    byteLength: binData.length,
  });

  // ---- Add accessors ----
  // indices (SCALAR, UNSIGNED_SHORT = 5123)
  json.accessors.push({
    bufferView: bvIndex,
    byteOffset: 128,
    count: 6,
    type: 'SCALAR',
    componentType: 5123,
  });
  // positions (VEC3, FLOAT = 5126)
  json.accessors.push({
    bufferView: bvIndex,
    byteOffset: 0,
    count: 4,
    type: 'VEC3',
    componentType: 5126,
    min: [-hw, -hh, 0],
    max: [hw, hh, 0],
  });
  // normals (VEC3, FLOAT)
  json.accessors.push({
    bufferView: bvIndex,
    byteOffset: 48,
    count: 4,
    type: 'VEC3',
    componentType: 5126,
  });
  // texcoords (VEC2, FLOAT)
  json.accessors.push({
    bufferView: bvIndex,
    byteOffset: 96,
    count: 4,
    type: 'VEC2',
    componentType: 5126,
  });

  // ---- Add mesh ----
  const meshIndex = json.meshes.length;
  json.meshes.push({
    name: 'Door_Restaurant',
    primitives: [{
      attributes: {
        POSITION: accBase + 1,
        NORMAL: accBase + 2,
        TEXCOORD_0: accBase + 3,
      },
      mode: 4,
      material: 92,
      indices: accBase,
    }],
  });

  // ---- Add node ----
  const nodeIndex = json.nodes.length;
  json.nodes.push({
    name: 'Door_Restaurant',
    translation: [17.87, 0.75, -4.42],
    mesh: meshIndex,
  });

  // ---- Update buffer length ----
  json.buffers[0].byteLength = newBufLen;

  // ---- Add node to scene ----
  const scene = json.scenes[json.scene || 0];
  scene.nodes.push(nodeIndex);

  // ---- Rebuild JSON chunk ----
  const jsonStr = JSON.stringify(json);
  const newJsonData = Buffer.from(jsonStr, 'utf8');
  // Pad to 4 bytes
  const jsonPad = (4 - (newJsonData.length % 4)) % 4;
  const newJsonChunk = Buffer.concat([newJsonData, Buffer.alloc(jsonPad)]);

  // ---- Rebuild BIN chunk ----
  const newBinChunk = Buffer.concat([binChunk.data, binData]);
  const binPad = (4 - (newBinChunk.length % 4)) % 4;
  const newBinPadded = Buffer.concat([newBinChunk, Buffer.alloc(binPad)]);

  // ---- Rebuild file ----
  const totalLength = 12 + 8 + newJsonChunk.length + 8 + newBinPadded.length;

  const out = Buffer.alloc(totalLength);
  // Header
  writeUint32(out, 0, 0x46546C67);
  writeUint32(out, 4, 2);
  writeUint32(out, 8, totalLength);
  // JSON chunk
  let off = 12;
  writeUint32(out, off, newJsonChunk.length);
  writeUint32(out, off + 4, 0x4E4F534A);
  newJsonChunk.copy(out, off + 8);
  off += 8 + newJsonChunk.length;
  // BIN chunk
  writeUint32(out, off, newBinPadded.length);
  writeUint32(out, off + 4, 0x004E4942);
  newBinPadded.copy(out, off + 8);

  writeFileSync(GLB_PATH, out);
  console.log(`  GLB atualizado: ${totalLength} bytes`);
  console.log(`  Mesh index: ${meshIndex}, Node index: ${nodeIndex}`);
  console.log('  Porta Door_Restaurant adicionada em (17.87, 0.75, -4.42)');
}

main();
