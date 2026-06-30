# Plano: Personagem 3D com Animações (Blender → Three.js)

## Visão Geral

Substituir o sistema atual de voxel por um personagem 3D modelado no Blender com animações de idle e walk.

---

## Fase 1: Modelagem no Blender

### 1.1. Personagem Low-Poly

| Especificação | Valor |
|---------------|-------|
| Polígonos | ~300-500 triângulos |
| Textura | Única textura 256x256 (atlás) |
| Rigging | Armadura simples (3 ossos: hips, spine, head) |
| Escala | 1 unidade = 1 metro (1.7m de altura total) |
| Pivot | Base dos pés na origem (0,0,0) |

### 1.2. Estrutura do Personagem

```
Player (Armature)
├── Hips (osso raiz)
│   ├── Spine
│   │   ├── Head
│   │   ├── UpperBody mesh
│   └── Legs mesh
```

### 1.3. Animações

Duas animações no mesmo arquivo `.glb`:

**Idle (quadro 0-20):**
- Respiração leve (subir/descer torso 0.02u)
- Balanço sutil dos braços
- Loop suave

**Walk (quadro 25-45):**
- Marcha com 8 quadros por passo
- Braços opostos às pernas
- Movimento vertical sutil (bobbing)

### 1.4. Exportação do Blender

```
- Formato: .glb (binário)
- Incluir: Armature + Animations + Mesh
- Compression: Draco (via gltf-transform depois)
- Arquivo destino: public/assets/player.glb
- Tamanho estimado: ~30-50 KB
```

**Checklist de exportação:**
- [ ] Apply Scale (Ctrl+A > Scale) em tudo
- [ ] Naming: armature = "Armature", animations = "idle" e "walk"
- [ ] Sem objetos ocultos na cena
- [ ] Uncheck "Selected Objects" — exportar tudo
- [ ] Incluir "Animations" + "Armature" checkados
- [ ] Draco compress pós-exportação:
  ```bash
  npx gltf-transform draco public/assets/player.glb public/assets/player.glb
  ```

---

## Fase 2: Código Novo — PlayerModel3D.js

Criar `public/js/player-model-3d.js` — classe que substitui `PlayerVoxel`.

```js
import * as THREE from 'three';

export class PlayerModel3D {
  constructor(modelData, palette) {
    this.mixer = new THREE.AnimationMixer(modelData.scene);
    this.actions = {};
    this.currentAction = null;

    // Mapeia animações do .glb
    for (const clip of modelData.animations) {
      const action = this.mixer.clipAction(clip);
      if (clip.name === 'idle') {
        action.setEffectiveWeight(1);
      } else {
        action.setEffectiveWeight(0);
      }
      this.actions[clip.name] = action;
    }

    // Inicia em idle
    this.actions.idle?.play();
    this.currentAction = this.actions.idle;

    // Instancia o modelo
    this.group = modelData.scene.clone();
    this.group.scale.set(0.5, 0.5, 0.5); // Ajuste fino
    this.group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Aplica cor da paleta
        if (child.material) {
          const mat = child.material.clone();
          mat.color.setHex(palette.primary);
          child.material = mat;
        }
      }
    });
  }

  setAnimation(name, fadeTime = 0.2) {
    const action = this.actions[name];
    if (!action || action === this.currentAction) return;

    if (this.currentAction) this.currentAction.fadeOut(fadeTime);
    action.reset().fadeIn(fadeTime).play();
    this.currentAction = action;
  }

  setMoving(isMoving) {
    this.setAnimation(isMoving ? 'walk' : 'idle');
  }

  updateAnimation(dt) {
    this.mixer.update(dt);
  }

  set position(v) {
    this.group.position.copy(v);
    this.group.position.y += 0.25; // Ajuste da altura do modelo
  }

  get position() {
    return this.group.position;
  }

  set rotation(v) {
    this.group.rotation.y = v;
  }

  get rotation() {
    return this.group.rotation.y;
  }

  dispose() {
    this.mixer.stopAllAction();
    // Remove referências
    this.actions = null;
    this.currentAction = null;
    this.mixer = null;
  }
}
```

---

## Fase 3: Mudanças no main.js

### 3.1. Carregar o modelo do personagem (junto com a cena)

```js
// No lugar de import PlayerVoxel
import { PlayerModel3D } from './player-model-3d.js';
```

Adicionar no callback de load da cena, ou em paralelo:

```js
let playerModelData = null;

loader.load('/assets/player.glb', (gltf) => {
  playerModelData = gltf;
  // Inicializa player local e remotos pendentes
  initPlayers();
}, ...);
```

### 3.2. Substituir PlayerVoxel por PlayerModel3D

**Criação do player local:**

```js
// ANTES:
const localPlayer = new PlayerVoxel(PALETTES[Math.floor(Math.random() * PALETTES.length)]);

// DEPOIS:
const localPlayer = new PlayerModel3D(playerModelData, PALETTES[...]);
```

**Criação de remote players:**

```js
// ANTES:
function createRemotePlayer(id) {
  const voxel = new PlayerVoxel(PALETTES[colorIdx]);
  remotePlayers.set(id, { voxel, ... });
}

// DEPOIS:
function createRemotePlayer(id) {
  const model = new PlayerModel3D(playerModelData, PALETTES[colorIdx]);
  remotePlayers.set(id, { model, ... });
}
```

### 3.3. Game Loop

```js
// Já existe updateAnimation no loop atual para remotas:
// rp.voxel.updateAnimation(dt); → rp.model.updateAnimation(dt);

// Player local também:
// localPlayer.updateAnimation(dt); → continua igual (mesmo nome de método)
```

### 3.4. Ajustes de Posição

```js
// O PlayerModel3D centraliza o ajuste interno:
// this.group.position.y += 0.25;
// Então onde antes usava VOXEL_CENTER_Y (0.55), agora usa PLAYER_HEIGHT/2 (0.25) ou 0.

// Atualizar game state:
socket.emit('player-move', {
  x: currentX,
  y: 0, // ou PLAYER_HEIGHT/2
  z: currentZ,
  rotation: currentRotation
});
```

---

## Fase 4: Animação dos Remotos

**Idle/Walk por proximidade do target:**

```js
for (const [, rp] of remotePlayers) {
  const dx = rp.targetX - rp.model.position.x;
  const dz = rp.targetZ - rp.model.position.z;
  const isMoving = Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001;

  rp.model.setMoving(isMoving);

  rp.model.position.x += dx * LERP_FACTOR;
  rp.model.position.z += dz * LERP_FACTOR;
  rp.model.rotation.y = rp.rotation;
  rp.model.updateAnimation(dt);
}
```

---

## Fase 5: Paleta de Cores

Manter a paleta existente. O `PlayerModel3D` recebe um objeto `palette` e aplica nos materiais:

```js
// Estrutura da paleta (já usada pelo PlayerVoxel):
export const PALETTES = [
  { primary: 0x00aaff, secondary: 0x0077cc, accent: 0xffffff },
  { primary: 0xff6600, secondary: 0xcc4400, accent: 0xffffff },
  // ...
];
```

**Mapeamento no modelo 3D:**
- `primary` → Cor do corpo/roupa principal
- `secondary` → Calçados/acessórios
- `accent` → Detalhes (olhos, cintos)

O modelo deve ter 3 grupos de vértices nomeados: `Body`, `Shoes`, `Details` para aplicar cada cor corretamente. Ou usar 3 materiais separados no Blender.

---

## Fase 6: Hitbox de Colisão

O modelo 3D NÃO deve ser usado para colisão. Manter uma hitbox invisível separada (cápsula ou cilindro):

```js
// Invisível, apenas para colisão
const hitbox = new THREE.Mesh(
  new THREE.CylinderGeometry(0.2, 0.2, PLAYER_HEIGHT, 8),
  new THREE.MeshBasicMaterial({ visible: false })
);
hitbox.position.set(0, PLAYER_HEIGHT / 2, 0);
localPlayer.group.add(hitbox);
```

---

## Ordem de Implementação

| Passo | O que fazer | Arquivos | Esforço |
|-------|-------------|----------|---------|
| 1 | Modelar personagem no Blender (idle + walk) | `.blend` → `player.glb` | ~2h |
| 2 | Exportar + Draco compress | `public/assets/player.glb` | ~10min |
| 3 | Criar `PlayerModel3D.js` | `public/js/player-model-3d.js` | ~30min |
| 4 | Modificar `main.js` para carregar e usar | `public/js/main.js` | ~30min |
| 5 | Testar: idle/walk no player local | — | ~15min |
| 6 | Testar: animação sincronizada nos remotos | — | ~15min |
| 7 | Ajustar alturas, rotação, câmera | `main.js` | ~15min |
| 8 | **Total** | | **~4h** |

---

## Rollback

Caso algo dê errado, o sistema voxel ainda existe intacto em `public/js/player-voxel.js`. Basta reverter os imports e a criação de players no `main.js` para o estado anterior.

---

## Extras Futuros (fora do escopo)

- Animação de "correr" (sprint)
- Animação de "acenar" (emote ao entrar)
- Skins diferentes (não só cor, mas formato)
- Partículas nos pés ao andar
- Sombra projetada do personagem no chão
