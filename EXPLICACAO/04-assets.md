# 04 — Assets, Modelos e Animações

## Estrutura de Pastas

```
models/
├── base/
│   ├── base.fbx                       ← MODELO PRINCIPAL (personagem com esqueleto)
│   ├── shaded.png                     ← Textura difusa do personagem
│   ├── texture_diffuse.png            ← Textura PBR difusa
│   ├── texture_metallic.png           ← Textura PBR metálica
│   ├── texture_normal.png             ← Textura PBR normal
│   ├── texture_pbr.png                ← Textura PBR
│   ├── texture_roughness.png          ← Textura PBR rugosidade
│   └── animations/                    ← PASTA COM TODAS AS ANIMAÇÕES
│       ├── aiming.fbx                 ← Mirando andando
│       ├── aimingstoped.fbx           ← Mirando parado
│       ├── downjump.fbx               ← (não usado no código)
│       ├── downpump.fbx               ← Descida do pulo
│       ├── idle.fbx                   ← Parado
│       ├── run.fbx                    ← Correndo
│       ├── shooting.fbx               ← Atirando
│       ├── upjump.fbx                 ← Subida do pulo
│       └── walk.fbx                   ← Caminhando
├── cute_bear/                         ← Modelo alternativo (não usado ativamente)
│   ├── scene.gltf
│   └── scene.bin
├── bunny/                             ← Modelo alternativo (não usado ativamente)
│   ├── scene.gltf
│   └── scene.bin
├── cloud1/                            ← Modelo de nuvem
│   ├── scene.gltf
│   ├── scene.bin
│   └── textures/
├── sound/                             ← Efeitos sonoros
│   ├── coin.wav
│   ├── jump.wav
│   ├── levelup.wav
│   ├── shooting1.mp3
│   └── trilha/                        ← Músicas de fundo (12 faixas)
└── textures/                          ← Texturas de skin alternativa
```

## O Modelo Principal: base.fbx

- **Formato:** FBX (Autodesk)
- **Fonte:** Mixamo (Adobe) ou modelagem personalizada
- **Esqueleto:** Contém ossos nomeados com prefixo `mixamorig` (padrão Mixamo)
- **Escala:** Importado com escala `0.01` para ajustar ao mundo Three.js (linha 295)
- **Posição:** Inicialmente em `(0, 0, 0)`, com `position.y = 0` (pés no chão)

## As Animações: Arquivos FBX Individuais

Cada animação é um arquivo FBX separado que contém:
1. O mesmo esqueleto do personagem (`mixamorig` bones)
2. Apenas os `tracks` de animação para aquela ação específica
3. Nenhuma malha/geometria (apenas dados de animação óssea)

### Detalhes de cada animação:

| Arquivo | Clips | Loop | Uso |
|---------|-------|------|-----|
| `idle.fbx` | 1 | LoopRepeat | Estado padrão, sem input |
| `walk.fbx` | 1 | LoopRepeat | Movimento com teclas |
| `run.fbx` | 1 | LoopRepeat | Shift + movimento |
| `aiming.fbx` | 1 | LoopRepeat | Botão direito + movimento |
| `aimingstoped.fbx` | 1 | LoopRepeat | Botão direito + parado |
| `upjump.fbx` | 1 | LoopOnce | Subindo no ar |
| `downpump.fbx` | 1 | LoopOnce (timeScale=0) | Descendo no ar (congelado) |
| `shooting.fbx` | 1 | LoopOnce | Clique esquerdo |

### Como o Three.js Processa as Animações

```
Arquivo .fbx
    ↓ FBXLoader.load()
Modelo com animations[]
    ↓ mixer.clipAction(clip)
AnimationAction
    ↓ .play() / .fadeIn() / .fadeOut()
Mixer.update(delta)
    ↓ Interpola os bones do esqueleto
Modelo animado na tela
```

## O Esqueleto (Skinning)

O modelo `base.fbx` contém:
- **SkinnedMesh** — Malha ligada ao esqueleto
- **Bones** — Ossos nomeados (ex: `mixamorigHips`, `mixamorigSpine`, etc.)
- Cada animação manipula a rotação/posição desses ossos ao longo do tempo

O AnimationMixer do Three.js aplica as transformações dos clips de animação sobre os bones, deformando a malha do personagem.

## Sincronização do Sistema de Ossos

**IMPORTANTE:** O personagem `base.fbx` e todas as animações FBX devem compartilhar **o mesmo sistema de ossos** (mesmos nomes de bones). O código em main.js:324-326 confirma isso:

```javascript
// NÃO remover "mixamorig" pois o novo modelo base.fbx JÁ tem esse prefixo
// As animações do Mixamo já vêm com "mixamorig" e o modelo também!
```

Isso é crítico: se os nomes dos ossos não corresponderem entre o modelo e as animações, o `mixer.clipAction()` falhará silenciosamente.

## Carregamento Assíncrono e Ordem

As animações são carregadas de forma **assíncrona** e **independente**. A ordem de carregamento não é garantida:

1. Primeiro: `base.fbx` (cria o `mixer`)
2. Em paralelo: todos os 9 arquivos de animação
3. Cada animação é registrada em `animations{}` assim que termina de carregar
4. A animação `idle.fbx` é a única que inicia automaticamente (se for a primeira a carregar)

**Problema potencial:** Se `shooting.fbx` carregar antes de `idle.fbx`, a transição para `idle` no início pode falhar. O `guard clause` em `changeAnimationState()` trata isso verificando `if (!mixer || !animations)`.

## Modelos Alternativos (Não Utilizados)

- **Cute Bear** (`models/cute_bear/scene.gltf`) — Selecionado como padrão em `index.html:577` mas nunca carregado de fato
- **Bunny** (`models/bunny/scene.gltf`) — Botão existe no menu mas sem funcionalidade
- **Super Trooper** — Texturas existem mas não implementado

## Efeitos Sonoros

| Arquivo | Função | Volume |
|---------|--------|--------|
| `shooting1.mp3` | Disparo | 50% |
| `coin.wav` | Coleta de moeda | 60% |
| `jump.wav` | Pulo | 50% |
| `trilha/*.mp3` (12) | Música de fundo | 30% (regulável) |
