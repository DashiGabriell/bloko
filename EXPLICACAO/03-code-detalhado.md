# 03 — Análise Detalhada do Código

## 1. Variáveis Globais de Animação (main.js:8-15)

```javascript
let mixer = null;              // THREE.AnimationMixer vinculado ao modelo
let animations = {};           // Dicionário: { nome: AnimationAction }
let activeAction = null;       // (não usado ativamente)
let previousAction = null;     // (não usado ativamente)
const animationState = { current: null }; // Wrapper mutável para ação ativa
```

- `mixer` — Instância do `AnimationMixer` que gerencia todas as animações do modelo. Criado após o carregamento do `base.fbx`.
- `animations` — Objeto que armazena pares `chave: AnimationAction`. As chaves são: `idle`, `walk`, `run`, `aiming`, `aimingstoped`, `upjump`, `downpump`, `shooting`.
- `animationState` — Objeto wrapper que contém `current`. É usado como referência mutável, já que `animationState` é `const` mas suas propriedades podem ser alteradas.

## 2. Carregamento das Animações (main.js:316-486)

Cada animação é carregada individualmente via `FBXLoader`:

```javascript
fbxLoader.load('models/base/animations/idle.fbx', (idleModel) => {
    if (idleModel.animations && idleModel.animations.length > 0) {
        const idleClip = idleModel.animations[0];  // Pega o primeiro clip
        animations['idle'] = mixer.clipAction(idleClip); // Cria AnimationAction
        // Inicia idle se for a primeira animação
        if (!animationState.current) {
            animationState.current = animations['idle'];
            animationState.current.play();
        }
    }
});
```

**Padrão para cada animação:**
1. Carrega o arquivo `.fbx` da pasta `models/base/animations/`
2. Extrai o primeiro `AnimationClip` do modelo carregado
3. Cria um `AnimationAction` via `mixer.clipAction(clip)`
4. Armazena em `animations[nome]`
5. Para `run`, `aiming`, `aimingstoped`: configura `setLoop(THREE.LoopRepeat)`
6. Para `upjump`, `downpump`, `shooting`: configura `setLoop(THREE.LoopOnce)` + `clampWhenFinished = true`

**Fallback de downpump (main.js:431-436):**
```javascript
// Se downpump falhar ao carregar, usa upjump como fallback
if (animations['upjump']) {
    animations['downpump'] = animations['upjump'];
}
```

**Animações internas do modelo FBX (main.js:477-484):**
```javascript
if (model.animations && model.animations.length > 0) {
    model.animations.forEach((clip) => {
        if (!animations[clip.name]) {
            animations[clip.name] = mixer.clipAction(clip);
        }
    });
}
```
Carrega animações que porventura estejam embutidas no próprio `base.fbx`.

## 3. A Função changeAnimationState() (game.js:405-463)

Esta é o **núcleo da máquina de estados**. Recebe uma string com o nome do estado desejado e executa a transição.

### Guard Clauses
```javascript
if (!mixer || !animations || currentAnimationState === newState) return;
```
- Se o mixer ainda não foi criado, retorna
- Se o dicionário de animações está vazio, retorna
- Se já está no estado solicitado, retorna (evita transições desnecessárias)

### Mapeamento Estado → Animação
```javascript
let targetAnimation = null;
if (newState === 'idle') {
    targetAnimation = animations['idle'] || animations['Idle'] || animations['idle_animation'] || animations[Object.keys(animations)[0]];
}
// ... (mesmo padrão para todos os 8 estados)
```

Cada estado tem uma lista de fallbacks para nomes alternativos de animação, garantindo compatibilidade com diferentes naming conventions do Mixamo.

Se `targetAnimation` for `null` (animação não encontrada), a função retorna sem fazer nada.

### Execução da Transição
```javascript
if (targetAnimation) {
    // Fade out da atual
    if (animationState.current) {
        animationState.current.fadeOut(0.2);
    }
    // Seta e reseta a nova
    animationState.current = targetAnimation;
    animationState.current.reset();
    // Configura loop
    if (newState === 'upjump' || newState === 'downpump' || newState === 'shooting') {
        animationState.current.setLoop(THREE.LoopOnce);
        animationState.current.clampWhenFinished = true;
        if (newState === 'shooting') {
            isShootingAnimationFinished = false;
        }
    } else {
        animationState.current.setLoop(THREE.LoopRepeat);
        animationState.current.clampWhenFinished = false;
    }
    // Fade in + play
    animationState.current.fadeIn(0.2);
    animationState.current.play();
    currentAnimationState = newState;  // Atualiza o estado atual
}
```

## 4. O Loop Principal e a Máquina de Estados (game.js:617-955)

A função `updateGame()` é chamada a cada frame (~60fps) pelo `animate()` em `main.js:584`.

### Passo 1: Detecção de fim de shooting (620-643)
Verifica se a animação `shooting` terminou (`isRunning()` retorna `false`) e decide para qual estado voltar baseado em `isAiming`.

### Passo 2: Movimento do personagem (678-728)
Calcula o vetor de movimento baseado nas teclas pressionadas e no `cameraYaw` (direção da câmera). Aplica modificadores de velocidade:
- Normal: `speed * 1.0`
- Mirando: `speed * 0.5`
- Correndo: `speed * 1.5`

### Passo 3: Rotação do personagem (731-755)
- **Mirando:** Rotaciona suavemente para a direção do raycast do mouse (`shootDirection`) com `rotationSpeed = 0.1`
- **Não mirando:** Rotaciona instantaneamente para a direção do movimento

### Passo 4: Seleção de animação (764-788)
A lógica condicional descrita na seção 2 deste documento.

### Passo 5: Controle do pulo (792-858)
Gerencia as fases do pulo, transição `upjump` → `downpump` (congelado), e detecção de pouso.

### Passo 6: Atualização da câmera (872-886)
Câmera em terceira pessoa controlada pelo mouse (yaw/pitch/zoom).

### Passo 7: Colisão com chips (889-930)
Detecta coleta de moedas (distância entre jogador e chip).

## 5. O Render Loop (main.js:568-608)

```javascript
function animate() {
    requestAnimationFrame(animate);
    const delta = 0.016;  // ~60fps fixo
    
    if (mixer) {
        mixer.update(delta);  // Avança todas as animações
    }
    
    window.chipData?.getChip()?.rotation.z += 0.015; // Gira a moeda
    
    updateGame();    // Lógica do jogo + máquina de estados
    updateClouds();  // Movimento das nuvens
    
    // Interpolação de jogadores remotos (multiplayer)
    // ...
    
    renderer.render(scene, camera);
}
```

> **Nota:** O `delta` é fixo em `0.016` segundos (16ms = ~60fps) em vez de usar o delta real do `requestAnimationFrame`, o que pode causar inconsistências em taxas de quadros diferentes.

## 6. Variável de Estado Atual (game.js:92)

```javascript
let currentAnimationState = 'idle';
```

Esta variável global armazena o estado atual da máquina e é usada tanto para:
- Evitar transições redundantes (`guard clause` em `changeAnimationState`)
- Verificar o estado atual em outras partes da lógica (`currentAnimationState === 'shooting'`)
- Enviar o estado atual para o servidor multiplayer (`anim: currentAnimationState` em game.js:945)
