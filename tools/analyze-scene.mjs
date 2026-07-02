#!/usr/bin/env node

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const GLB_PATH = resolve(ROOT, 'public/assets/scene.glb');
const MAIN_JS_PATH = resolve(ROOT, 'public/jogo/js/main.js');
const METADATA_PATH = resolve(ROOT, 'public/assets/scene-metadata.json');
const COLLISION_MARGIN = 0.3;

const NAMED_PREFIXES = ['Predio_', 'Loja_', 'Porta_', 'Collider_'];

function detectPrefix(name) {
  for (const prefix of NAMED_PREFIXES) {
    if (name.startsWith(prefix)) {
      return {
        prefix,
        type: prefix === 'Predio_' ? 'building' : prefix === 'Loja_' ? 'store' : prefix === 'Porta_' ? 'door' : 'collider',
        storeId: prefix === 'Loja_' ? name.slice(5).toLowerCase() : null,
      };
    }
  }
  if (name.startsWith('Door_')) {
    return { prefix: 'Door_', type: 'door', storeId: null };
  }
  return null;
}

function readGLBJson(glbPath) {
  const buf = readFileSync(glbPath);
  let offset = 12;
  while (offset < buf.length) {
    const chunkLen = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const chunkData = buf.slice(offset + 8, offset + 8 + chunkLen);
    if (chunkType === 0x4E4F534A) {
      return JSON.parse(chunkData.toString('utf8').replace(/\0+$/, ''));
    }
    offset += 8 + chunkLen;
  }
  throw new Error('JSON chunk not found');
}

function loadExistingBounds() {
  if (!existsSync(MAIN_JS_PATH)) return [];
  const src = readFileSync(MAIN_JS_PATH, 'utf-8');
  const bounds = [];
  const pattern = /\{\s*x\s*:\s*\[([-\d.]+)\s*,\s*([-\d.]+)\]\s*,\s*z\s*:\s*\[([-\d.]+)\s*,\s*([-\d.]+)\]\s*\}/g;
  let m;
  while ((m = pattern.exec(src)) !== null) {
    bounds.push({ x: [parseFloat(m[1]), parseFloat(m[2])], z: [parseFloat(m[3]), parseFloat(m[4])] });
  }
  return bounds;
}

function boundsCovered(aabb, existingBounds) {
  for (const b of existingBounds) {
    if (
      aabb.min[0] + COLLISION_MARGIN >= b.x[0] && aabb.max[0] - COLLISION_MARGIN <= b.x[1] &&
      aabb.min[2] + COLLISION_MARGIN >= b.z[0] && aabb.max[2] - COLLISION_MARGIN <= b.z[1]
    ) {
      return true;
    }
  }
  return false;
}

function getNodeWorldPosition(node, nodes) {
  const pos = node.translation ? [node.translation[0], node.translation[1], node.translation[2]] : [0, 0, 0];
  return pos;
}

function computeNodeBounds(node, nodes, accessors, meshIndex) {
  const pos = getNodeWorldPosition(node, nodes);
  const mesh = meshes[meshIndex];
  if (!mesh) return null;
  const prim = mesh.primitives?.[0];
  if (!prim) return null;
  const posAcc = accessors[prim.attributes.POSITION];
  if (!posAcc) return null;
  const sx = node.scale ? node.scale[0] : 1;
  const sz = node.scale ? node.scale[2] : 1;
  const min = [
    pos[0] + (posAcc.min?.[0] || 0) * sx,
    0,
    pos[2] + (posAcc.min?.[2] || 0) * sz,
  ];
  const max = [
    pos[0] + (posAcc.max?.[0] || 0) * sx,
    5,
    pos[2] + (posAcc.max?.[2] || 0) * sz,
  ];
  return { min, max };
}

// Known buildings (must match buildingBounds in main.js)
const KNOWN_BUILDINGS = [
  { x: [-7.5, -2.5],   z: [-9.5, -5.5],   name: 'Café' },
  { x: [2.5, 7.5],     z: [-9.5, -5.5],   name: 'Farmácia' },
  { x: [-7.5, -2.5],   z: [5.5, 9.5],     name: 'Padaria' },
  { x: [2.5, 7.5],     z: [5.5, 9.5],     name: 'Barbearia' },
  { x: [-13.35, -8.35], z: [-9.5, -5.5],  name: 'loja1.002' },
  { x: [8.9, 15.6],    z: [-11.3, -4.4],  name: 'Hotel' },
  { x: [15.5, 21.0],   z: [-8.5, -4.0],   name: 'Restaurant' },
  { x: [16.5, 22.0],   z: [4.5, 9.5],     name: 'NewBuilding' },
  { x: [4.75, 8.96],   z: [17.61, 22.61], name: 'Burguer' },
  { x: [5.09, 7.94],   z: [10.85, 14.61], name: 'NewRestaurant' },
];

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     BLOKO Scene Analyzer v2.0            ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  const existingBounds = loadExistingBounds();
  console.log(`  bounds existentes: ${existingBounds.length}`);
  console.log('');

  if (!existsSync(GLB_PATH)) {
    console.error(`  ERRO: ${GLB_PATH} nao encontrado`);
    process.exit(1);
  }

  console.log(`  Lendo scene.glb ...`);
  const json = readGLBJson(GLB_PATH);
  const nodes = json.nodes || [];
  const accessors = json.accessors || [];
  const meshes = json.meshes || [];

  // Collect all node info, detect prefixes
  const buildingDefs = [...KNOWN_BUILDINGS];
  const namedNodes = [];
  const doorNodes = [];
  const storeNodes = [];

  for (const node of nodes) {
    const name = node.name || '(unnamed)';
    const prefixInfo = detectPrefix(name);
    if (prefixInfo) {
      const pos = getNodeWorldPosition(node, nodes);
      if (prefixInfo.type === 'door') {
        doorNodes.push({ name, pos, prefixInfo });
      } else if (prefixInfo.type === 'store') {
        storeNodes.push({ name, pos, prefixInfo });
      } else if (prefixInfo.type === 'building') {
        // Use accessor bounds if available, else use position + estimate
        const bounds = { min: [pos[0] - 2.5, 0, pos[2] - 2], max: [pos[0] + 2.5, 5, pos[2] + 2] };
        buildingDefs.push({ x: [bounds.min[0], bounds.max[0]], z: [bounds.min[2], bounds.max[2]], name, _named: true });
      }
    }
    if (name !== '(unnamed)' && !name.startsWith('Mesh_') && !name.startsWith('Node_')) {
      namedNodes.push({ name, pos: getNodeWorldPosition(node, nodes), prefixInfo });
    }
  }

  // Merge duplicates by name
  const seenNames = new Set();
  const uniqueBuildings = [];
  for (const b of buildingDefs) {
    if (!seenNames.has(b.name)) {
      seenNames.add(b.name);
      uniqueBuildings.push(b);
    }
  }

  const missingBounds = [];
  const missingDoors = [];

  // Collect metadata
  const metadataBuildings = [];
  const metadataStores = [];
  const metadataDoorPositions = [];
  const seenDoors = new Set();

  for (const bd of uniqueBuildings) {
    const aabb = { min: [bd.x[0], 0, bd.z[0]], max: [bd.x[1], 5, bd.z[1]] };
    const covered = boundsCovered(aabb, existingBounds);

    const doorMatches = doorNodes.filter(dp =>
      dp.pos[0] >= bd.x[0] - 1 && dp.pos[0] <= bd.x[1] + 1 &&
      dp.pos[2] >= bd.z[0] - 1 && dp.pos[2] <= bd.z[1] + 1
    );

    const hasDoor = doorMatches.length > 0;
    const doorLabel = hasDoor ? `OK (${doorMatches.length})` : 'FALTA!';

    const icon = covered ? '  ' : ' \u{1F195}';
    console.log(` ${icon}  ${bd.name}${bd._named ? ' (named)' : ''}`);
    console.log(`       Centro: x=${((bd.x[0] + bd.x[1]) / 2).toFixed(2)}, z=${((bd.z[0] + bd.z[1]) / 2).toFixed(2)}`);
    console.log(`       Extensao: X[${bd.x[0].toFixed(2)}, ${bd.x[1].toFixed(2)}] Z[${bd.z[0].toFixed(2)}, ${bd.z[1].toFixed(2)}]`);
    console.log(`       Colisao: ${covered ? 'OK' : 'FALTA!'}`);
    console.log(`       Porta:   ${doorLabel}`);

    if (!covered) {
      missingBounds.push(bd);
    }
    if (!hasDoor) {
      missingDoors.push(bd);
    }

    // Collect metadata
    metadataBuildings.push({
      name: bd.name,
      bounds: { x: [bd.x[0], bd.x[1]], z: [bd.z[0], bd.z[1]] },
    });

    // Check if this building has a store prefix
    const storeMatch = storeNodes.find(s =>
      s.pos[0] >= bd.x[0] - 1 && s.pos[0] <= bd.x[1] + 1 &&
      s.pos[2] >= bd.z[0] - 1 && s.pos[2] <= bd.z[1] + 1
    );
    if (storeMatch) {
      metadataStores.push({
        name: storeMatch.name,
        center: [(bd.x[0] + bd.x[1]) / 2, (bd.z[0] + bd.z[1]) / 2],
        storeId: storeMatch.prefixInfo.storeId || storeMatch.name.replace('Loja_', '').toLowerCase(),
      });
    }

    for (const dm of doorMatches) {
      const key = `${dm.pos[0].toFixed(2)}_${dm.pos[2].toFixed(2)}`;
      if (!seenDoors.has(key)) {
        seenDoors.add(key);
        metadataDoorPositions.push({
          name: dm.name,
          position: [dm.pos[0], dm.pos[2]],
        });
      }
    }

    console.log('');
  }

  // Show named nodes not matched to any building
  const unmatched = namedNodes.filter(n =>
    n.prefixInfo?.type === 'building' &&
    !uniqueBuildings.some(b => b.name === n.name)
  );
  if (unmatched.length > 0) {
    console.log('  --- Novos objetos nomeados ---');
    for (const n of unmatched) {
      console.log(`    ${n.name} @ (${n.pos[0].toFixed(2)}, ${n.pos[1].toFixed(2)}, ${n.pos[2].toFixed(2)})`);
    }
    console.log('');
  }

  // Show stand-alone door nodes
  const unmatchedDoors = doorNodes.filter(dn =>
    !metadataDoorPositions.some(md => md.name === dn.name)
  );
  if (unmatchedDoors.length > 0) {
    console.log('  --- Portas sem edificio ---');
    for (const d of unmatchedDoors) {
      console.log(`    ${d.name} @ (${d.pos[0].toFixed(2)}, ${d.pos[1].toFixed(2)})`);
    }
    console.log('');
  }

  console.log('══════════════════════════════════════════');
  console.log('');

  if (missingBounds.length > 0) {
    console.log(`  ${missingBounds.length} edificio(s) sem colisao!`);
    console.log('');
    console.log('  Adicione no array buildingBounds em main.js:');
    console.log('');
    for (const nb of missingBounds) {
      console.log(`  { x: [${nb.x[0].toFixed(2)}, ${nb.x[1].toFixed(2)}], z: [${nb.z[0].toFixed(2)}, ${nb.z[1].toFixed(2)}] },`);
    }
    console.log('');
  } else {
    console.log('  Todos os edificios tem colisao!');
    console.log('');
  }

  if (missingDoors.length > 0) {
    // Filter out known procedural buildings (they have Mesh_* doors from GLTF export)
    const trulyMissing = missingDoors.filter(nb =>
      !['Café', 'Farmácia', 'Padaria', 'Barbearia'].includes(nb.name)
    );
    if (trulyMissing.length > 0) {
      console.log(`  ${trulyMissing.length} edificio(s) sem porta:`);
      for (const nb of trulyMissing) {
        console.log(`    ${nb.name}`);
      }
      console.log('');
    }
  }

  // --- Generate scene-metadata.json ---
  const metadata = {
    version: 2,
    generatedAt: new Date().toISOString(),
    buildings: metadataBuildings,
    stores: metadataStores,
    doorPositions: metadataDoorPositions,
  };

  writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2));
  console.log(`  JSON salvo: scene-metadata.json`);
  console.log(`    - ${metadataBuildings.length} edificio(s)`);
  console.log(`    - ${metadataStores.length} loja(s)`);
  console.log(`    - ${metadataDoorPositions.length} porta(s)`);
  console.log('');
}

main().catch((err) => {
  console.error('  ERRO:', err.message);
  process.exit(1);
});
