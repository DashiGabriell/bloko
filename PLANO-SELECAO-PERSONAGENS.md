# Plano: Sistema de Seleção de Personagens

## Visão Geral

Cada jogador pode escolher entre múltiplos personagens 3D. O modelo escolhido é sincronizado com todos os outros jogadores em tempo real.

---

## Arquitetura

```
player.glb (raiz)          → modelo padrão
characters/
├── avatar-01.glb           # Robô
├── avatar-02.glb           # Gato
├── avatar-03.glb           # Esqueleto
├── avatar-04.glb           # Ninja
├── avatar-05.glb           # Robô 2
└── avatar-06.glb           # Alien
```

Cada `.glb` contém a malha + armadura + animações **idênticas** (mesmo nome de armature, mesmo nome de animações: `idle`, `walk`). A única diferença é o visual.

---

## Fase 1: Estrutura de Dados

### 1.1. Catálogo de Personagens (`public/js/character-registry.js`)

```js
export const CHARACTERS = [
  {
    id: 'default',
    name: 'Bloko Original',
    file: '/assets/player.glb',
    palette: ['Body', 'Shoes', 'Details'], // materiais que recebem cor
    locked: false,
    default: true,
  },
  {
    id: 'robo',
    name: 'Robô',
    file: '/assets/characters/avatar-01.glb',
    palette: ['Armor', 'Visor', 'Joint'],
    locked: false,
  },
  {
    id: 'gato',
    name: 'Gato',
    file: '/assets/characters/avatar-02.glb',
    palette: ['Fur', 'Belly', 'Accessories'],
    locked: false,
  },
  {
    id: 'ninja',
    name: 'Ninja',
    file: '/assets/characters/avatar-04.glb',
    palette: ['Suit', 'Mask', 'Belt'],
    locked: true, // desbloqueável
    unlockCondition: 'Convide 3 amigos para jogar',
  },
  // ...
];

export const DEFAULT_CHARACTER = 'default';
```

### 1.2. Cache de Modelos (`Map`)

Os `.glb` são carregados uma vez e reutilizados por todos os jogadores (local + remotos):

```js
const modelCache = new Map(); // id → { scene, animations }

async function getCharacterModel(id) {
  if (modelCache.has(id)) return modelCache.get(id);
  const char = CHARACTERS.find(c => c.id === id);
  if (!char) throw new Error(`Personagem ${id} não encontrado`);

  const gltf = await loader.loadAsync(char.file);
  const data = { scene: gltf.scene, animations: gltf.animations };
  modelCache.set(id, data);
  return data;
}
```

---

## Fase 2: Mudanças no `PlayerModel3D.js`

### 2.1. Aceitar characterId

```js
export class PlayerModel3D {
  constructor(characterId, palette) {
    const data = modelCache.get(characterId);
    // resto igual, mas usa data.animations para criar mixer
    this.mixer = new THREE.AnimationMixer(data.scene);
    // ...
  }
}
```

### 2.2. Singleton do Loader

O loader é compartilhado e pré-carrega todos os personagens liberados na inicialização:

```js
export async function preloadCharacters(ids) {
  const promises = ids.map(id => getCharacterModel(id));
  await Promise.all(promises);
  console.log(`[Personagens] ${ids.length} modelos carregados`);
}
```

---

## Fase 3: Tela de Seleção

### 3.1. UI (`public/index.html`)

Overlay antes de entrar no jogo:

```html
<div id="character-select" class="character-select-overlay">
  <h2>Escolha seu Personagem</h2>
  <div class="character-grid">
    <!-- gerado dinamicamente -->
  </div>
  <button id="confirm-character">Entrar no BLOKO</button>
</div>
```

### 3.2. Preview 3D

Uma **segunda cena Three.js miniatura** (ou a mesma cena com câmera isolada) exibe o personagem rodando a animação idle em loop:

```js
function createPreviewScene() {
  const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('preview-canvas'),
    alpha: true,
  });
  // câmera focada no personagem, fundo transparente
  // luz simples, rotação automática lenta
}
```

### 3.3. Grid de Seleção

```
┌──────────┐ ┌──────────┐ ┌──────────┐
│  Robô    │ │  Gato    │ │ Boneco   │
│  [PREVIEW]│ │ [PREVIEW]│ │ [PREVIEW]│
│  SELECION │ │          │ │          │
└──────────┘ └──────────┘ └──────────┘
┌──────────┐ ┌──────────┐ ┌──────────┐
│  Ninja   │ │ Alien    │ │ Palhaço  │
│ 🔒       │ │          │ │          │
│ CONVIDAR │ │          │ │          │
└──────────┘ └──────────┘ └──────────┘
```

- Personagens liberados: clicáveis com borda destacada no selecionado
- Personagens bloqueados: com cadeado + condição de desbloqueio
- Ao clicar, o preview 3D troca para o modelo correspondente

### 3.4. Confirmação

Botão "Entrar" só fica ativo após selecionar um personagem. Ao clicar:

```js
document.getElementById('confirm-character').onclick = () => {
  const selected = getSelectedCharacter();
  localStorage.setItem('bloko_character', selected.id);
  document.getElementById('character-select').classList.add('hidden');
  socket.emit('player:join', {
    nickname: '...',
    characterId: selected.id,
  });
};
```

---

## Fase 4: Sincronização Multiplayer

### 4.1. Servidor (`server.js`)

O servidor precisa repassar o `characterId` para os outros jogadores:

```js
// socket.on('player:join')
socket.emit('current-players', onlinePlayers.map(p => ({
  ...p,
  characterId: p.character_id || 'default',
})));

socket.broadcast.emit('player:joined', {
  ...player,
  id: socket.id,
  characterId: data.characterId || 'default',
});
```

### 4.2. Banco (`supabase/seed.sql` / migrations)

Adicionar coluna na tabela `players`:

```sql
alter table players add column character_id text default 'default';
```

### 4.3. Cliente (`main.js`)

```js
function createRemotePlayer(id, characterId) {
  const cid = characterId || 'default';
  const model = new PlayerModel3D(cid, PALETTES[colorIdx]);
  // ...
}

// No evento current-players e game-state:
socket.on('game-state', (players) => {
  for (const p of players) {
    const cid = p.characterId || 'default';
    // Se o personagem mudou (raro), recria o remote player
  }
});
```

---

## Fase 5: PlayerModel3D Multi-Character

A classe `PlayerModel3D` precisa ser genérica para qualquer modelo:

```js
export class PlayerModel3D {
  constructor(characterId, palette) {
    const entry = CHARACTERS.find(c => c.id === characterId) || CHARACTERS[0];
    const data = modelCache.get(entry.id);

    this.group = data.scene.clone(true);
    this.mixer = new THREE.AnimationMixer(this.group);

    // Mapeia animações (sempre idle/walk em todo modelo)
    for (const clip of data.animations) {
      const action = this.mixer.clipAction(clip);
      this.actions[clip.name] = action;
    }

    // Aplica paleta nos materiais específicos do personagem
    this.group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const idx = entry.palette.indexOf(child.name);
        if (idx >= 0 && palette[idx]) {
          child.material = child.material.clone();
          child.material.color.setHex(palette[idx]);
        }
      }
    });

    this.actions.idle?.play();
    this.currentAction = this.actions.idle;
  }

  // ... métodos iguais: setAnimation, setMoving, updateAnimation, etc
}
```

---

## Fase 6: Pré-carregamento

Na inicialização, carregar todos os personagens liberados para evitar delay:

```js
// main.js
async function initGame() {
  const availableIds = CHARACTERS.filter(c => !c.locked).map(c => c.id);
  await preloadCharacters(availableIds);
  // ... resto da inicialização
}
```

Isso adiciona ~2-5s ao carregamento inicial (dependendo do tamanho dos .glb), mas elimina qualquer pausa durante o jogo.

---

## Fase 7: Sistema de Desbloqueio

Controle simples via `localStorage`:

```js
function isCharacterUnlocked(id) {
  const char = CHARACTERS.find(c => c.id === id);
  if (!char.locked) return true;
  const unlocks = JSON.parse(localStorage.getItem('bloko_unlocks') || '[]');
  return unlocks.includes(id);
}

function unlockCharacter(id) {
  const unlocks = JSON.parse(localStorage.getItem('bloko_unlocks') || '[]');
  if (!unlocks.includes(id)) {
    unlocks.push(id);
    localStorage.setItem('bloko_unlocks', JSON.stringify(unlocks));
  }
}

// Condições de desbloqueio (exemplos):
const unlockConditions = {
  'ninja': () => { /* convidou 3 amigos via link */ },
  'alien': () => { /* visitou 5 lojas diferentes */ },
};
```

---

## Resumo do que muda em cada arquivo

| Arquivo | Mudança |
|---------|---------|
| `public/js/character-registry.js` | **NOVO** — catálogo de personagens + cache |
| `public/js/player-model-3d.js` | Aceitar `characterId`, usar `modelCache`, aplicar paleta por nome do mesh |
| `public/js/main.js` | Carregar seletor, enviar `characterId` no join, criar remotos com `characterId` |
| `public/index.html` | **NOVO** — overlay de seleção com grid + preview canvas |
| `public/style.css` | Estilos do overlay, grid, preview |
| `server.js` | Repassar `characterId` nos eventos |
| `supabase/migrations/...` | `alter table players add column character_id` |
| `public/assets/characters/*.glb` | **NOVOS** — modelos dos personagens |

---

## Ordem de Implementação

| Passo | O que | Depende | Esforço |
|-------|-------|---------|---------|
| 1 | Criar catálogo + cache (`character-registry.js`) | — | ~20min |
| 2 | Adaptar `PlayerModel3D` para multi-character | Passo 1 | ~30min |
| 3 | Tela de seleção (HTML + CSS + preview 3D) | Passo 2 | ~1h |
| 4 | Sincronizar `characterId` no servidor | — | ~15min |
| 5 | Atualizar `main.js` (join, remotos, game-state) | Passo 2+4 | ~30min |
| 6 | Modelar 3+ personagens no Blender | — | ~3h cada |
| 7 | Sistema de desbloqueio | — | ~30min |
| | **Total (código)** | | **~3h** |
| | **Total (modelagem por personagem)** | | **~3h cada** |

---

## Observações

- **Pré-carregamento** evita travamentos no meio do jogo, mas aumenta o tempo de loading inicial
- Personagens com animações **idênticas** (mesmos nomes de clips, mesma armature) funcionam sem adaptação extra
- O sistema de paleta por nome de mesh é flexível: cada personagem define seus próprios slots de cor
- Desbloqueio via `localStorage` é local — para persistência real, usar coluna no Supabase
