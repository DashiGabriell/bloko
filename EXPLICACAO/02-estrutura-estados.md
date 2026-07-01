# 02 — Estrutura dos Estados de Animação e Transições

## Mapa Completo de Estados

A aplicação define **8 estados de animação** no total, divididos em duas categorias:

### Estados de Loop Contínuo (THREE.LoopRepeat)

| Estado | Animação | Descrição | Gatilho |
|--------|----------|-----------|---------|
| `idle` | `idle.fbx` | Personagem parado, respirando | Nenhum input de movimento, sem mira |
| `walk` | `walk.fbx` | Caminhada normal | Teclas WASD/Setas + sem Shift + sem mira |
| `run` | `run.fbx` | Corrida | Teclas WASD/Setas + Shift pressionado |
| `aiming` | `aiming.fbx` | Andando enquanto mira | Botão direito + movimento |
| `aimingstoped` | `aimingstoped.fbx` | Parado mirando | Botão direito + parado |

### Estados de Disparo Único (THREE.LoopOnce + clampWhenFinished)

| Estado | Animação | Descrição | Gatilho |
|--------|----------|-----------|---------|
| `upjump` | `upjump.fbx` | Subida do pulo | Espaço (no chão) |
| `downpump` | `downpump.fbx` | Descida do pulo (congelada) | Quando `velocity.y <= 0` |
| `shooting` | `shooting.fbx` | Disparo | Clique esquerdo + mirando |

## Diagrama de Transições de Estado

```
                    ┌──────────────────────────────────────────┐
                    │                  idle                    │
                    └────┬─────────────┬──────────────┬────────┘
                         │             │              │
                    movimento        Shift         Botão Dir
                         │             │              │
                    ┌────▼──┐    ┌─────▼───┐   ┌──────▼────────┐
                    │ walk  │    │   run   │   │ aimingstoped  │
                    └───┬───┘    └────┬────┘   └───┬──┬────────┘
                        │             │            │  │
                    solta Shift   movimento    movimento │
                        │             │            │  │
                    ┌───▼───┐    ┌────▼────┐  ┌───▼──┐ │
                    │ idle  │    │  walk   │  │aiming│ │
                    └───────┘    └─────────┘  └──┬───┘ │
                                                 │     │
                                            Clique Esq
                                                 │
                                           ┌─────▼──────┐
                                           │  shooting  │
                                           └─────┬──────┘
                                                 │
                                        animação terminou
                                              │
                                    ┌──────────┴──────────┐
                                    │                     │
                              ainda mirando?        não mira?
                                    │                     │
                            ┌───────▼───────┐      ┌─────▼─────┐
                            │ aiming/aiming │      │    idle   │
                            │   stoped      │      └───────────┘
                            └───────────────┘

                    ┌─────┐
                    │ Espaço (no chão)
                    └──┬──┘
                       │
                 ┌─────▼──────┐
                 │   upjump   │  ← LoopOnce, toca uma vez
                 └─────┬──────┘
                       │
                 velocity.y <= 0 (ápice do pulo)
                       │
                 ┌─────▼───────┐
                 │  downpump   │  ← LoopOnce, CONGELA (timeScale = 0)
                 └─────┬───────┘
                       │
                    toca o chão (y <= 0)
                       │
                 ┌─────▼───────┐
                 │ idle/walk   │  ← volta ao estado normal
                 └─────────────┘
```

## Tabela de Decisão (game.js:764-788)

A máquina de estados avalia as seguintes condições em ordem de prioridade dentro de `updateGame()`:

```
SE currentAnimationState == 'shooting':
    ├── SE animação de shooting terminou:
    │       ├── SE isAiming == true AND tem movimento → aiming
    │       ├── SE isAiming == true AND sem movimento → aimingstoped
    │       └── SE isAiming == false → idle
    └── SENÃO → mantém shooting (não interrompe)

SE jumpStarted == true:
    └── Não altera animação (bloqueado)

SE NÃO (estado normal):
    ├── SE isAiming == true AND tem movimento → aiming
    ├── SE isAiming == true AND sem movimento → aimingstoped
    ├── SE isRunning == true AND tem movimento → run
    ├── SE tem movimento → walk
    └── SE sem movimento → idle
```

## Lógica do Pulo (game.js:822-843)

```
SE Space pressionado AND onGround:
    ├── velocity.y = jumpForce
    ├── onGround = false
    ├── jumpStarted = true
    ├── currentJumpPhase = 'upjump'
    └── playAnimation('upjump')

SE NOT onGround AND jumpStarted:
    ├── SE velocity.y > 0 AND currentJumpPhase ≠ 'upjump':
    │       ├── currentJumpPhase = 'upjump'
    │       └── playAnimation('upjump')
    │
    └── SE velocity.y <= 0 AND currentJumpPhase == 'upjump':
            ├── currentJumpPhase = 'downpump'
            └── animationState.current.timeScale = 0 (CONGELA)

SE model.position.y <= 0 (tocou o chão):
    ├── model.position.y = 0
    ├── velocity.y = 0
    ├── jumpStarted = false
    ├── currentJumpPhase = null
    └── onGround = true
```

> **Detalhe importante:** A animação `downpump` é congelada com `timeScale = 0` assim que o personagem atinge o ápice do pulo e começa a cair. Isso faz com que o personagem "flutue" na pose final da animação de descida até encostar no chão.

## Sistema de Transição Suave (Cross-Fade)

`changeAnimationState()` (game.js:405-463) implementa transição suave:

```javascript
// Fade out da animação atual (0.2 segundos)
animationState.current.fadeOut(0.2);

// Configura a nova animação
animationState.current = targetAnimation;
animationState.current.reset();

// Configura o tipo de loop
if (estado === 'upjump' || 'downpump' || 'shooting') {
    animationState.current.setLoop(THREE.LoopOnce);
    animationState.current.clampWhenFinished = true;
} else {
    animationState.current.setLoop(THREE.LoopRepeat);
    animationState.current.clampWhenFinished = false;
}

// Fade in + play
animationState.current.fadeIn(0.2);
animationState.current.play();
```

O `THREE.AnimationMixer` gerencia internamente o cross-fade entre as animações, aplicando pesos de mistura nos ossos do esqueleto durante a transição de 0.2 segundos.
