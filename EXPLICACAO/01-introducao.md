# 01 — Introdução à Máquina de Estados de Animação

## Visão Geral

Esta aplicação Three.js (Guns&Coins) utiliza uma **máquina de estados finitos (FSM)** para controlar as animações do personagem 3D em tempo real. A máquina de estados determina qual animação deve ser reproduzida a cada frame com base nas entradas do jogador (teclado e mouse), estado do personagem (no chão/ pulando/ mirando) e eventos do jogo (tiro, coleta).

## Objetivo

O personagem 3D precisa responder com animações suaves e adequadas para cada ação:

- Parado → animação `idle`
- Andando → animação `walk`
- Correndo → animação `run`
- Mirando parado → animação `aimingstoped`
- Mirando andando → animação `aiming`
- Pulando (subindo) → animação `upjump`
- Pulando (descendo) → animação `downpump`
- Atirando → animação `shooting`

## Arquivos Envolvidos

| Arquivo | Função |
|---------|--------|
| `main.js` | Configuração da cena Three.js, carregamento do modelo e animações, render loop |
| `game.js` | Lógica do jogo: movimento, pulo, tiro, HUD, câmera, e **máquina de estados de animação** |
| `index.html` | Estrutura HTML, menu, HUD, players de música/vídeo |

## Como os Módulos se Conectam

1. `main.js` carrega o modelo FBX e todos os arquivos de animação (`.fbx`)
2. `main.js` cria um `THREE.AnimationMixer` vinculado ao modelo
3. Cada animação carregada vira um `THREE.AnimationClip` registrado no objeto `animations{}`
4. `game.js` importa `mixer`, `animations`, `animationState` e `model` de `main.js`
5. `game.js` exporta `updateGame()` que é chamado a cada frame no loop `animate()` de `main.js`
6. Dentro de `updateGame()`, a máquina de estados decide qual animação tocar via `changeAnimationState()`

## Fluxo Simplificado

```
Usuário pressiona tecla
       ↓
 game.js: updateGame() (a cada frame)
       ↓
 Verifica inputs (keys[]), flags (isAiming, isRunning, onGround)
       ↓
 Máquina de estados decide: idle | walk | run | aiming | aimingstoped | upjump | downpump | shooting
       ↓
 changeAnimationState(newState)
       ↓
 FadeOut da animação atual → Reset → Configura Loop → FadeIn → Play()
       ↓
 main.js: mixer.update(delta) aplica os ossos ao modelo
       ↓
 Personagem animado na tela
```

## Tecnologias Utilizadas

- **Three.js** v0.181.1 — Engine 3D
- **FBXLoader** — Carregamento de modelos e animações no formato FBX (Mixamo)
- **AnimationMixer** — Sistema de blending e transição entre animações
- **AnimationAction** — Controle individual de cada animação (play, pause, fade, loop)
- **Socket.IO** — Multiplayer (sincronização de posição e animação entre jogadores)
