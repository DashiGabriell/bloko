# 06 — Guia Prático: Como Criar Novos Estados e Animações

Este guia explica passo a passo como adicionar um novo estado de animação à máquina de estados.

## Cenário Exemplo: Adicionar uma animação de "rolar" (dodge roll)

Vamos adicionar um estado `roll` que faz o personagem dar um rolamento ao pressionar a tecla `R`.

---

## Passo 1: Obter a Animação FBX

1. Faça o download da animação "Dodge Roll" do Mixamo (ou crie no Blender)
2. Certifique-se de que o esqueleto usa os mesmos nomes de ossos do `base.fbx` (prefixo `mixamorig`)
3. Exporte como FBX
4. Salve em: `models/base/animations/roll.fbx`

---

## Passo 2: Carregar a Animação no main.js

Adicione o carregamento no mesmo bloco onde as outras animações são carregadas (após a linha 474):

```javascript
// === NOVO: Carregar animação de rolar ===
fbxLoader.load('models/base/animations/roll.fbx', (rollModel) => {
    console.log('Roll model carregado:', rollModel);

    if (rollModel.animations && rollModel.animations.length > 0) {
        const rollClip = rollModel.animations[0];
        animations['roll'] = mixer.clipAction(rollClip);
        animations['roll'].setLoop(THREE.LoopOnce);       // Toca uma vez
        animations['roll'].clampWhenFinished = true;       // Congela na última frame
        console.log('Animação Roll carregada:', rollClip.name);
    }
}, undefined, (error) => {
    console.error('Erro ao carregar roll.fbx:', error);
});
```

**Localização exata:** Após a linha 474 (`console.error('Erro ao carregar shooting.fbx:', error);`) e antes da linha 476 (comentário "Carregar animações internas...").

---

## Passo 3: Adicionar o Estado na Função changeAnimationState()

Em `game.js`, dentro da função `changeAnimationState()` (linhas 411-428), adicione o novo estado:

```javascript
// Após o bloco 'shooting', adicionar:
} else if (newState === 'roll') {
    targetAnimation = animations['roll'] || animations['Roll'] || animations['dodge_roll'] || animations['idle'];
```

**Localização exata:** Após a linha 427 (fechamento do `else if` do `shooting`) e antes da linha 429 (`if (targetAnimation)`).

---

## Passo 4: Adicionar Configuração de Loop no changeAnimationState()

Na linha 440, a condição atual `if (newState === 'upjump' || newState === 'downpump' || newState === 'shooting')` precisa incluir o novo estado:

```javascript
// ANTES (linha 440):
if (newState === 'upjump' || newState === 'downpump' || newState === 'shooting') {

// DEPOIS:
if (newState === 'upjump' || newState === 'downpump' || newState === 'shooting' || newState === 'roll') {
```

Isso garante que `roll` use `THREE.LoopOnce` e `clampWhenFinished = true`.

---

## Passo 5: Adicionar Input e Lógica de Transição

Em `game.js`, dentro de `updateGame()`, adicione o gatilho para a nova animação.

### Opção A: Gatilho por tecla (ex: tecla R)

No bloco de detecção de teclas (após linha 604, antes do throttle multiplayer), adicione:

```javascript
// === NOVO: Tecla R para rolar ===
if (keys['KeyR'] && !jumpStarted && currentAnimationState !== 'roll') {
    playAnimation('roll');
    // Impedir movimento durante o roll (opcional)
    velocity.x = 0;
    velocity.z = 0;
}
```

### Opção B: Estado temporário com retorno automático

Como `roll` é `LoopOnce`, você precisa detectar quando termina e voltar ao estado normal. Adicione esta lógica no bloco de detecção de fim de animação (após o bloco de `shooting`, ~linha 643):

```javascript
// === NOVO: Detectar fim do roll ===
if (currentAnimationState === 'roll' && animationState.current) {
    if (!animationState.current.isRunning()) {
        // Roll terminou, voltar ao estado apropriado
        if (isAiming) {
            playAnimation('aimingstoped');
        } else {
            playAnimation('idle');
        }
        console.log('🎯 Roll finalizado!');
    }
}
```

---

## Passo 6: Evitar Interrupção Durante o Roll

No bloco de seleção de animação (linha 765-788), adicione o novo estado à condição de bloqueio:

```javascript
// ANTES (linha 767):
if (currentAnimationState !== 'shooting') {

// DEPOIS:
if (currentAnimationState !== 'shooting' && currentAnimationState !== 'roll') {
```

Isso impede que o movimento ou mira interrompam o roll enquanto ele está tocando.

---

## Passo 7: Adicionar Som (Opcional)

Carregue o som e toque durante o roll:

```javascript
// No início de game.js, junto com outros áudios:
let rollAudio = new Audio('models/sound/roll.wav');
rollAudio.volume = 0.5;

// No gatilho da tecla R:
if (keys['KeyR'] && !jumpStarted && currentAnimationState !== 'roll') {
    playAnimation('roll');
    rollAudio.currentTime = 0;
    rollAudio.play();
}
```

---

## Passo 8: Atualizar o Envio Multiplayer

O estado `roll` já será enviado automaticamente pelo código existente na linha 945:

```javascript
anim: currentAnimationState || 'idle'
```

---

## Resumo do que criar/modificar

| Arquivo | Ação |
|---------|------|
| `models/base/animations/roll.fbx` | **CRIAR** — Arquivo de animação |
| `main.js` (~linha 475) | **EDITAR** — Adicionar carregamento da animação |
| `game.js` (~linha 428) | **EDITAR** — Adicionar mapeamento em `changeAnimationState()` |
| `game.js` (linha 440) | **EDITAR** — Adicionar `roll` à condição de `LoopOnce` |
| `game.js` (~linha 605) | **EDITAR** — Adicionar gatilho de tecla |
| `game.js` (~linha 643) | **EDITAR** — Adicionar detecção de fim do roll |
| `game.js` (linha 767) | **EDITAR** — Bloquear transições durante roll |
| `models/sound/roll.wav` (opcional) | **CRIAR** — Som de rolamento |

---

## Checklist para Novos Estados

- [ ] A animação FBX existe na pasta `models/base/animations/`
- [ ] O esqueleto da animação é compatível com `base.fbx`
- [ ] O carregamento foi adicionado em `main.js`
- [ ] O mapeamento foi adicionado em `changeAnimationState()`
- [ ] O tipo de loop foi configurado corretamente (`LoopRepeat` ou `LoopOnce`)
- [ ] O gatilho foi adicionado em `updateGame()` (tecla, estado, evento)
- [ ] A lógica de retorno foi implementada (para estados `LoopOnce`)
- [ ] As transições indesejadas foram bloqueadas
- [ ] O estado aparece no payload multiplayer

---

## Boas Práticas

1. **Nomes consistentes:** Use nomes em inglês minúsculo para estados (`walk`, `run`, `shooting`)
2. **Fallbacks sempre:** Cada mapeamento deve ter fallbacks para nomes alternativos de animação
3. **LoopOnce precisa de retorno:** Animações de disparo único devem ter um mecanismo de retorno ao estado anterior
4. **Evite múltiplos `playAnimation()` no mesmo frame:** A guard clause `currentAnimationState === newState` evita loops infinitos
5. **Use `timeScale` para controle fino:** Como feito no `downpump` com `timeScale = 0` para congelar
6. **Teste a transição:** Verifique se o cross-fade de 0.2s está suave e não causa "pulos" visuais
