# Migração do Sistema de Animação — Padrão FSM (EXPLICACAO → BLOKO)

## Objetivo

Adaptar a **Máquina de Estados Finitos (FSM)** de animação documentada em `EXPLICACAO/` para o sistema de personagens **voxel** do BLOKO, que atualmente usa apenas um booleano `isMoving` para controlar animação procedural simples.

---

## Análise dos Dois Sistemas

### Sistema Atual (BLOKO) — `player-voxel.js`

```js
// Estado atual: 1 bit
this.isMoving = false;

// Animação: 2 estados possíveis
updateAnimation(dt) {
  if (this.isMoving) {
    this.animTime += dt * 10;
    const swing = Math.sin(this.animTime) * 0.6;
    // braços e pernas oscilam
  } else if (this.animTime !== 0) {
    this.animTime = 0;
    // tudo reseta para 0 (corte seco)
  }
}
```

**Limitações:**
- Apenas 2 estados (parado / andando)
- Transição abrupta (sem cross-fade)
- Sem animação de idle (parado = estático)
- Sem corrida

### Padrão EXPLICACAO — Guns&Coins

```js
// 8 estados com FSM completa
changeAnimationState('idle' | 'walk' | 'run' | 'aiming' | ...)

// Transição suave com cross-fade
animationState.current.fadeOut(0.2);
animationState.current = targetAnimation;
animationState.current.fadeIn(0.2);
animationState.current.play();

// Árvore de decisão por prioridade
if (isAiming && moving) → 'aiming'
else if (isRunning)     → 'run'
else if (moving)        → 'walk'
else                    → 'idle'
```

**Por que não podemos copiar diretamente:**
- O sistema EXPLICACAO usa `THREE.AnimationMixer` + FBX com esqueleto ósseo (`mixamorig` bones)
- O BLOKO usa meshes primitivas (esfera, cilindro, box) sem ossos
- `AnimationMixer` exige `SkinnedMesh` com `Bones`

---

## Solução: FSM Adaptada para Animação Procedural

Mantemos a **estrutura da FSM** (estados, transições, cross-fade, árvore de decisão) mas substituímos `AnimationClip`/`AnimationAction` por **parâmetros de animação procedural** específicos para cada estado.

### Arquitetura

```
main.js (game loop)
  │
  ├── updateMovement(dt)
  │     └── árvore de decisão → localPlayer.changeState('walk'|'run'|'idle')
  │
  └── localPlayer.updateAnimation(dt)
        └── STATE_CONFIG[currentState].getTargets(animTime)
              └── lerp das rotações (com cross-fade)
                    └── aplica em this.parts[].rotation
```

### Mapa de Estados

| Estado | Gatilho | Braços | Pernas | Tronco | Loop |
|---|---|---|---|---|---|
| `idle` | Nenhum input de movimento | sway ±0.04 rad | parado (0) | respiração ±0.015 rad | contínuo |
| `walk` | WASD sem Shift | swing ±0.4, speed 8x | oposto aos braços | 0 | contínuo |
| `run` | WASD + Shift | swing ±0.7, speed 14x | oposto aos braços | inclinação ±0.05 | contínuo |

### Parâmetros por Estado

```js
const STATE_CONFIG = {
  idle: {
    getTargets: (t) => ({
      tronco:   { x: 0, y: 0, z: Math.sin(t * 1.5) * 0.015 },
      bracoEsq: { x: Math.sin(t * 2) * 0.04, y: 0, z: 0 },
      bracoDir: { x: -Math.sin(t * 2) * 0.04, y: 0, z: 0 },
      pernaEsq: { x: 0, y: 0, z: 0 },
      pernaDir: { x: 0, y: 0, z: 0 },
    }),
  },
  walk: {
    getTargets: (t) => {
      const s = Math.sin(t * 8) * 0.4;
      return {
        tronco:   { x: 0, y: 0, z: 0 },
        bracoEsq: { x: s, y: 0, z: 0 },
        bracoDir: { x: -s, y: 0, z: 0 },
        pernaEsq: { x: -s, y: 0, z: 0 },
        pernaDir: { x: s, y: 0, z: 0 },
      };
    },
  },
  run: {
    getTargets: (t) => {
      const s = Math.sin(t * 14) * 0.7;
      return {
        tronco:   { x: Math.sin(t * 14) * 0.05, y: 0, z: 0 },
        bracoEsq: { x: s, y: 0, z: 0 },
        bracoDir: { x: -s, y: 0, z: 0 },
        pernaEsq: { x: -s * 1.1, y: 0, z: 0 },
        pernaDir: { x: s * 1.1, y: 0, z: 0 },
      };
    },
  },
};
```

---

## Método `changeState(newState)` — Equivalente ao `changeAnimationState()` do EXPLICACAO

```js
changeState(newState) {
  // Guard clause: se já está neste estado e transição completa, ignora
  if (newState === this.currentState && this.transitionT >= 1) return;

  // Snapshot das rotações atuais para o cross-fade
  this.fromRotations = {};
  for (const name of Object.keys(this.parts)) {
    this.fromRotations[name] = {
      x: this.parts[name].rotation.x,
      y: this.parts[name].rotation.y,
      z: this.parts[name].rotation.z,
    };
  }

  this.currentState = newState;
  this.transitionT = 0; // inicia transição
}
```

### Fluxo da Transição

```
changeState('walk')
  ↓
Snapshot: salva rotações atuais em fromRotations
  ↓
transitionT = 0
  ↓
Próximo frame: updateAnimation(dt)
  ↓
transitionT += dt / 0.2   (cross-fade de 0.2s)
  ↓
t = smoothstep(transitionT)   (easing cúbico)
  ↓
Para cada parte:
  rotation.x = from.x + (target.x - from.x) * t
  ↓
transitionT >= 1 → fim da transição
  ↓
Aplica targets diretamente
```

**Easing (smoothstep):** `t * t * (3 - 2 * t)` — igual suavidade do cross-fade do AnimationMixer.

---

## Árvore de Decisão em `main.js`

Substituir chamada atual:

```js
// ANTES:
localPlayer.setMoving(dx !== 0 || dz !== 0);

// DEPOIS:
if (dx === 0 && dz === 0) {
  localPlayer.changeState('idle');
} else if (keyState['shift']) {
  localPlayer.changeState('run');
} else {
  localPlayer.changeState('walk');
}
```

### Jogadores Remotos

Inferir estado pela velocidade do movimento:

```js
const dx = rp.targetX - rp.voxel.position.x;
const dz = rp.targetZ - rp.voxel.position.z;
const dist = Math.sqrt(dx * dx + dz * dz);

if (dist < 0.001) {
  rp.voxel.changeState('idle');
} else {
  const speed = dist / dt;
  rp.voxel.changeState(speed > MOVE_SPEED * 0.8 ? 'run' : 'walk');
}
```

> **Opcional:** Enviar o campo `anim: currentState` no socket (`player-move`) para sincronização precisa.

---

## Arquivos Alterados

| Arquivo | O que muda | Linhas |
|---|---|---|
| `public/jogo/js/player-voxel.js` | Adicionar `STATE_CONFIG`, `changeState()`, refatorar `updateAnimation()`, adicionar `transitionT`/`fromRotations` | ~30 |
| `public/jogo/js/main.js` | Árvore de decisão no lugar de `setMoving()`, inferência de estado para remotos | ~8 |

### Nenhuma alteração em:
- `camera.js`
- `style.css`
- `index.html`
- Servidor / Socket.IO
- Assets da cena

---

## Código Final de `player-voxel.js` (esboço)

```js
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const STATE_CONFIG = {
  idle: {
    getTargets(t) {
      return {
        tronco:   { x: 0, y: 0, z: Math.sin(t * 1.5) * 0.015 },
        bracoEsq: { x: Math.sin(t * 2) * 0.04, y: 0, z: 0 },
        bracoDir: { x: -Math.sin(t * 2) * 0.04, y: 0, z: 0 },
        pernaEsq: { x: 0, y: 0, z: 0 },
        pernaDir: { x: 0, y: 0, z: 0 },
      };
    },
  },
  walk: {
    getTargets(t) {
      const s = Math.sin(t * 8) * 0.4;
      return {
        tronco:   { x: 0, y: 0, z: 0 },
        bracoEsq: { x: s, y: 0, z: 0 },
        bracoDir: { x: -s, y: 0, z: 0 },
        pernaEsq: { x: -s, y: 0, z: 0 },
        pernaDir: { x: s, y: 0, z: 0 },
      };
    },
  },
  run: {
    getTargets(t) {
      const s = Math.sin(t * 14) * 0.7;
      return {
        tronco:   { x: Math.sin(t * 14) * 0.05, y: 0, z: 0 },
        bracoEsq: { x: s, y: 0, z: 0 },
        bracoDir: { x: -s, y: 0, z: 0 },
        pernaEsq: { x: -s * 1.1, y: 0, z: 0 },
        pernaDir: { x: s * 1.1, y: 0, z: 0 },
      };
    },
  },
};

// ... BODY_DEF e PALETTES inalterados ...

export class PlayerVoxel {
  constructor(palette) {
    this.group = new THREE.Group();
    this.parts = {};
    this.animTime = 0;
    this.currentState = 'idle';
    this.transitionT = 1; // 1 = transição completa
    this.fromRotations = {};

    for (const [name, def] of Object.entries(BODY_DEF)) {
      const color = palette[name] || 0xCCCCCC;
      const geo = createGeometry(def.type, def.params);
      const mat = new THREE.MeshStandardMaterial({
        color, roughness: 0.5, metalness: 0.02,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...def.offset);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.parts[name] = mesh;
    }
  }

  get position() { return this.group.position; }
  set position(v) { this.group.position.copy(v); }
  get rotation() { return this.group.rotation; }
  set rotation(v) { this.group.rotation.copy(v); }

  changeState(newState) {
    if (newState === this.currentState && this.transitionT >= 1) return;

    this.fromRotations = {};
    for (const name of Object.keys(this.parts)) {
      this.fromRotations[name] = {
        x: this.parts[name].rotation.x,
        y: this.parts[name].rotation.y,
        z: this.parts[name].rotation.z,
      };
    }

    this.currentState = newState;
    this.transitionT = 0;
  }

  updateAnimation(dt) {
    this.animTime += dt;

    const config = STATE_CONFIG[this.currentState];
    if (!config) return;

    const targets = config.getTargets(this.animTime);

    if (this.transitionT < 1) {
      this.transitionT = Math.min(this.transitionT + dt / 0.2, 1);
      const t = this.transitionT;
      const ease = t * t * (3 - 2 * t); // smoothstep

      for (const [name, target] of Object.entries(targets)) {
        const from = this.fromRotations[name] || { x: 0, y: 0, z: 0 };
        this.parts[name].rotation.x = from.x + (target.x - from.x) * ease;
        this.parts[name].rotation.y = from.y + (target.y - from.y) * ease;
        this.parts[name].rotation.z = from.z + (target.z - from.z) * ease;
      }
    } else {
      for (const [name, target] of Object.entries(targets)) {
        this.parts[name].rotation.x = target.x;
        this.parts[name].rotation.y = target.y;
        this.parts[name].rotation.z = target.z;
      }
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
```

---

## Extensões Futuras (seguindo o padrão EXPLICACAO)

Assim como o guia em `EXPLICACAO/06-guia-criacao.md` demonstra, novos estados podem ser adicionados seguindo o mesmo padrão:

```js
saltar: {
  getTargets(t) {
    const progress = t / 0.5; // 0.5s de duração
    if (progress > 1) return STATE_CONFIG.idle.getTargets(t); // fallback
    return {
      tronco:   { x: -0.3 * progress, y: 0, z: 0 },
      bracoEsq: { x: -0.5, y: 0, z: 0 },
      bracoDir: { x: 0.5, y: 0, z: 0 },
      pernaEsq: { x: 0, y: 0, z: 0 },
      pernaDir: { x: 0, y: 0, z: 0 },
    };
  },
},
```

**Checklist para novo estado:**
- [ ] Adicionar entrada em `STATE_CONFIG`
- [ ] Adicionar condição na árvore de decisão em `main.js`
- [ ] Configurar `LoopOnce` se for disparo único (non-blocking até animação terminar)
- [ ] Se `LoopOnce`, implementar retorno automático ao estado anterior

---

## Resumo

```
EXPLICACAO (FBX + AnimationMixer)          BLOKO (voxel + FSM adaptada)
─────────────────────────────────          ──────────────────────────────
changeAnimationState('run')       →        changeState('run')
mixer.update(delta)               →        updateAnimation(dt)
fadeOut(0.2) / fadeIn(0.2)       →        lerp com smoothstep 0.2s
AnimationClip (FBX)               →        STATE_CONFIG[].getTargets(t)
Árvore de decisão (game.js)       →        árvore de decisão (main.js)
```

**Factível?** Sim. A estrutura conceitual é idêntica — apenas o mecanismo de animação muda (FBX → procedural).
