# 🧱 Plano de Implementação: Personagens Voxel com Customização

## Filosofia da Abordagem Híbrida

```
Cenário → Blender (.glb + Draco)  ← já planejado no roadmap
Players → Voxel (Three.js puro)   ← nova abordagem
```

Mantemos a riqueza visual do cenário modelado no Blender enquanto os
personagens são montados proceduralmente com cubos, garantindo:
- Customização infinita sem re-exportar assets
- Performance leve (geometria compartilhada)
- Pipeline simplificado (tudo em JS/Three.js)

---

## Fase 1: Arquitetura do Player Voxel

### 1.1 Estrutura do Corpo (Componentes)

Cada jogador é uma árvore de `Group`s com `Mesh` individuais:

```
PlayerVoxel (Group)
├── Cabeça          (BoxGeometry 0.6 x 0.6 x 0.6)
├── Tronco          (BoxGeometry 0.7 x 0.8 x 0.4)
├── Braço Esquerdo  (BoxGeometry 0.25 x 0.7 x 0.25)
├── Braço Direito   (BoxGeometry 0.25 x 0.7 x 0.25)
├── Perna Esquerda  (BoxGeometry 0.3 x 0.6 x 0.3)
└── Perna Direita   (BoxGeometry 0.3 x 0.6 x 0.3)
```

#### Definição no código

```js
const BODY_PARTS = {
  cabeca:  { size: [0.6, 0.6, 0.6],  offset: [0, 1.3, 0] },
  tronco:  { size: [0.7, 0.8, 0.4],  offset: [0, 0.4, 0] },
  bracoEsq: { size: [0.25, 0.7, 0.25], offset: [-0.48, 0.6, 0] },
  bracoDir: { size: [0.25, 0.7, 0.25], offset: [0.48, 0.6, 0] },
  pernaEsq: { size: [0.3, 0.6, 0.3],  offset: [-0.2, -0.2, 0] },
  pernaDir: { size: [0.3, 0.6, 0.3],  offset: [0.2, -0.2, 0] },
}
```

### 1.2 Geometria Compartilhada (InstancedMesh)

Para performance com N jogadores em tela:

- **Opção A (simples):** Cada parte usa sua própria `BoxGeometry` — suficiente para
  até ~50 jogadores. Cada mesh tem seu próprio material com `color` setado.
- **Opção B (avançada):** Usar `InstancedMesh` para cada parte do corpo —
  necessário acima de ~100 jogadores. Todas as cabeças compartilham a mesma
  geometria, todos os troncos idênticos, etc.

**Recomendação inicial:** Opção A. Se atingir limite, migrar para Opção B.

### 1.3 Paleta de Cores

```js
const AVATAR_PALETTE = [
  { nome: "Azure",      cabeca: 0x4A90D9, tronco: 0x2C5F8A, membros: 0x1E3A5F },
  { nome: "Ruby",       cabeca: 0xD94A4A, tronco: 0x8A2C2C, membros: 0x5F1E1E },
  { nome: "Forest",     cabeca: 0x4AD94A, tronco: 0x2C8A2C, membros: 0x1E5F1E },
  { nome: "Amber",      cabeca: 0xD9A64A, tronco: 0x8A6F2C, membros: 0x5F4C1E },
  { nome: "Purple",     cabeca: 0x9B4AD9, tronco: 0x642C8A, membros: 0x451E5F },
  // ... total de 16+ cores
}
```

O jogador escolhe a paleta ao entrar (já existe sistema de escolha de cor).

---

## Fase 2: Customização (Sistema de Acessórios)

### 2.1 Arquitetura de Itens

Cada item é um `Group` filho de uma parte do corpo:

```
PlayerVoxel
├── Cabeça
│   ├── Geometry: Box
│   └── Acessórios:  [chapéu, óculos, capacete, coroa, etc.]
├── Tronco
│   └── Acessórios:  [mochila, capa, colete, etc.]
└── ... (demais partes)
```

### 2.2 Definição de Itens

```js
const ACESSORIES = {
  chapeu: {
    nome: "Chapéu",
    parte: "cabeca",
    offset: [0, 0.5, 0],
    geometria: {
      tipo: "box",
      params: [0.8, 0.2, 0.8],    // aba
    },
    filhos: [
      { tipo: "box", params: [0.5, 0.4, 0.5], offset: [0, 0.3, 0] }  // topo
    ],
    cor: 0x8B4513,
    destrava: null  // null = disponível para todos
  },
  oculos: {
    nome: "Óculos Escuros",
    parte: "cabeca",
    offset: [0, 0.05, 0.35],
    geometria: { tipo: "box", params: [0.5, 0.1, 0.1] },
    cor: 0x222222,
    destrava: null
  },
  mochila: {
    nome: "Mochila",
    parte: "tronco",
    offset: [0, 0, -0.4],
    geometria: { tipo: "box", params: [0.5, 0.6, 0.3] },
    cor: 0xCC5500,
    destrava: null
  },
  coroa: {
    nome: "Coroa Real",
    parte: "cabeca",
    offset: [0, 0.5, 0],
    geometria: { tipo: "cylinder", params: [0.3, 0.4, 0.3, 8] },
    cor: 0xFFD700,
    destrava: "visitou_todas_lojas"  // item desbloqueável
  },
  capa: {
    nome: "Capa do Herói",
    parte: "tronco",
    offset: [0, -0.1, -0.3],
    geometria: { tipo: "box", params: [0.6, 0.7, 0.05] },
    cor: 0xCC0000,
    destrava: null
  }
}
```

### 2.3 Sistema de Desbloqueio (Gamificação)

| Gatilho | Item Desbloqueado |
|---|---|
| Visitar todas as lojas | Coroa Real (ouro) |
| Ficar 30 min online | Capa do Herói |
| Convidar um amigo | Óculos Especiais (neon) |
| Entrar 7 dias seguidos | Mochila Rara |

Armazenar itens desbloqueados no Supabase tabela `players`:

```sql
ALTER TABLE players ADD COLUMN accessories text[] DEFAULT '{}';
```

### 2.4 Sincronização Multiplayer

Ao conectar, o servidor envia:

```json
{
  "id": "abc123",
  "nickname": "Zé",
  "palette": "ruby",
  "accessories": ["chapeu", "oculos"]
}
```

O cliente monta o voxel com base nesses dados. Jogadores remotos veem
a customização em tempo real.

---

## Fase 3: Implementação no Código

### 3.1 Classe `PlayerVoxel` (novo arquivo)

`public/js/player-voxel.js`:

```js
class PlayerVoxel {
  constructor(palette, accessories = []) { ... }
  setPalette(palette) { ... }
  addAccessory(id) { ... }
  removeAccessory(id) { ... }
  animate(tipo, intensidade) { ... }  // idle, andando, pulando
  dispose() { ... }
}
```

### 3.2 Animações Simples (sem skeleton)

Movimento via transformações diretas nos grupos:

- **Andando:** Braços/ pernas oscilam no eixo Z (rotação)
  `Math.sin(time * speed) * 0.5`
- **Idle:** Leve floating (0.05 unidades para cima/baixo) e rotação suave
- **Pulo:** Tronco inclina ligeiramente, braços sobem

```
    ┌─┐          ┌─┐
    │ │    →     ╲ │    (rotação de braços ao andar)
   / \          / \
```

### 3.3 Substituir o Cubo Atual

Em `public/js/main.js`:

```diff
- const playerMesh = new THREE.Mesh(
-   new THREE.BoxGeometry(0.8, 0.8, 0.8),
-   new THREE.MeshStandardMaterial({ color: avatarColor })
- );
+ const playerVoxel = new PlayerVoxel(currentPalette, currentAccessories);
```

### 3.4 Hitbox / Colisão

A hitbox do personagem continua sendo uma bounding box invisível
(independente dos braços/pernas para não afetar colisão com cenário):

```js
const hitbox = new THREE.Box3(
  new THREE.Vector3(-0.4, 0, -0.4),
  new THREE.Vector3(0.4, 1.6, 0.4)
);
```

---

## Fase 4: UI de Customização

### 4.1 Menu de Customização

```
┌──────────────────────────┐
│  ✂️ Customizar Avatar    │
├──────────────────────────┤
│                          │
│   ┌─── Pré-visualização ─┐
│   │    ┌─┐              │
│   │   ─┴─┴─             │
│   │   ─┬─┬─             │
│   │   ─┴─┴─             │
│   └─────────────────────┘
│                          │
│  ┌─ Paleta ─────────────┐│
│  │  ■ ■ ■ ■ ■ ■ ■      ││
│  │  ■ ■ ■ ■ ■ ■ ■      ││
│  │  ■ ■ ■ ■ ■ ■ ■      ││
│  └──────────────────────┘│
│                          │
│  ┌─ Acessórios ─────────┐│
│  │ [✔] Chapéu           ││
│  │ [ ] Óculos           ││
│  │ [🔒] Coroa Real      ││
│  │ [✔] Mochila          ││
│  └──────────────────────┘│
│                          │
│  [Salvar]  [Fechar]      │
└──────────────────────────┘
```

### 4.2 Atalho para Abrir

- Tecla `C` (de Customizar)
- Botão no HUD: "✂️ Avatar"

---

## Fase 5: Cronograma de Implementação

| Etapa | Descrição | Esforço | Dependências |
|---|---|---|---|
| **5.1** | Criar `PlayerVoxel` com estrutura de partes e cores | 2h | — |
| **5.2** | Substituir cubo atual pelo `PlayerVoxel` | 1h | 5.1 |
| **5.3** | Sincronizar paleta + acessórios via Socket.IO | 2h | 5.2 |
| **5.4** | Animações básicas (andar, idle) | 2h | 5.2 |
| **5.5** | Sistema de acessórios (add/remove no código) | 2h | 5.1 |
| **5.6** | UI de customização (HTML/CSS/JS) | 4h | 5.5 |
| **5.7** | Banco: salvar acessórios desbloqueados | 1h | 5.5 |
| **5.8** | Gamificação: gatilhos de desbloqueio | 3h | 5.7 |
| **5.9** | Testes e ajustes de performance | 2h | 5.3, 5.4 |
| | **Total** | **~19h** | |

---

## Considerações Técnicas

### Performance

- `BoxGeometry` compartilhada via `geometry.clone()` — instância única na RAM
- Cada parte do corpo com seu próprio `Material` (permite cor individual)
- Usar `BufferGeometry` diretamente (Three.js já faz isso)
- Limite prático: ~50 jogadores voxel em tela com 60 FPS
- Se precisar de mais: migrar para `InstancedMesh`

### Compatibilidade com Cenário Blender

- Personagens voxel ficam em pé sobre o chão do `.glb` normalmente
- Colisão usa bounding box separada (não afeta malha visual)
- Sombras: personagens voxel projetam sombra no cenário normal
- Iluminação: materiais usam `MeshStandardMaterial` (respeitam luzes e
  ambiente do cenário carregado)

### Expansões Futuras

- **Emotes:** animações predefinidas (acenar, dançar) via rotação de partes
- **Roupas:** substituir cor do tronco/membros por "peças" (camisa, calça)
  que são boxes com cores específicas
- **Mascotes:** cubo menor flutuando ao lado do jogador
- **Efeitos:** partículas (ex: coroa brilha, capa tem trail)
- **Loja virtual:** itens exclusivos por parceria com lojistas

---

## Resumo da Arquitetura Final

```
                    ┌──────────────────┐
                    │   Blender .glb    │  ← Cenário (já no roadmap)
                    │  (Draco ~116KB)   │
                    └────────┬─────────┘
                             │
             ┌───────────────┴───────────────┐
             │         Three.js Scene         │
             │  ┌──────────────────────────┐  │
             │  │     PlayerVoxel (x N)     │  │
             │  │  ┌─┐                     │  │
             │  │ ─┴─┴─  ← cabeça         │  │
             │  │ ─┬─┬─  ← tronco         │  │
             │  │ ─┴─┴─  ← pernas         │  │
             │  │ Chapéu → acessório      │  │
             │  └──────────────────────────┘  │
             └───────────────┬───────────────┘
                             │
              ┌──────────────┴──────────────┐
              │      Socket.IO (15 tps)      │
              │  palette + accessories []    │
              └──────────────┬──────────────┘
                             │
              ┌──────────────┴──────────────┐
              │         Supabase             │
              │  players.accessories[]       │
              └─────────────────────────────┘
```
