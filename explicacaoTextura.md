# Processo de Aplicação de Texturas no Personagem — Guns&Coins

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Arquivos Envolvidos](#2-arquivos-envolvidos)
3. [Passo a Passo do Processo](#3-passo-a-passo-do-processo)
    - [3.1 Criação do TextureLoader](#31-criação-do-textureloader)
    - [3.2 Carregamento Assíncrono da Textura](#32-carregamento-assíncrono-da-textura)
    - [3.3 Configuração da Textura](#33-configuração-da-textura)
    - [3.4 Carregamento do Modelo FBX](#34-carregamento-do-modelo-fbx)
    - [3.5 Função de Aplicação da Textura](#35-função-de-aplicação-da-textura)
    - [3.6 Tratamento de Condição de Corrida (Race Condition)](#36-tratamento-de-condição-de-corrida-race-condition)
4. [Exemplo Visual do Fluxo](#4-exemplo-visual-do-fluxo)
5. [Texturas do Ambiente (Chão e Muros)](#5-texturas-do-ambiente-chão-e-muros)
6. [Texturas Alternativas (Skins)](#6-texturas-alternativas-skins)
7. [Considerações Técnicas](#7-considerações-técnicas)

---

## 1. Visão Geral

O jogo **Guns&Coins** utiliza o motor gráfico **Three.js** para renderização 3D. O personagem principal é um modelo no formato **FBX** (armazenado em `models/base/base.fbx`) que possui um esqueleto rigged animado via **Mixamo**. Para dar cor e detalhes visuais a esse modelo, aplicamos uma **textura difusa** (`models/base/shaded.png`) sobre a superfície do personagem.

Este documento descreve detalhadamente como esse processo foi implementado no arquivo `main.js`.

---

## 2. Arquivos Envolvidos

| Arquivo | Função |
|---|---|
| `models/base/base.fbx` | Modelo 3D do personagem com esqueleto (formato FBX) |
| `models/base/shaded.png` | Textura difusa do personagem (imagem PNG) |
| `main.js` | Código JavaScript que carrega modelo e textura e os integra |
| `models/textures/super_trooper_green_baseColor.png` | Textura de skin alternativa (verde) |
| `models/textures/super_trooper_green_metallicRoughness.png` | Textura PBR metálica da skin alternativa |

---

## 3. Passo a Passo do Processo

### 3.1 Criação do TextureLoader

No início do arquivo `main.js` (linha 69), é criada uma instância do `TextureLoader` do Three.js:

```js
const textureLoader = new THREE.TextureLoader();
```

Este objeto será responsável por carregar **todas as texturas** do jogo: do personagem, do chão, dos muros, etc. Ele é usado de forma **síncrona** (via método `.load()`) para texturas do ambiente e de forma **assíncrona** (via `.loadAsync()`) para a textura do personagem.

### 3.2 Carregamento Assíncrono da Textura

No trecho entre as linhas 235 e 250, a textura `shaded.png` é carregada de forma **assíncrona** utilizando o método `loadAsync()`:

```js
let shadedTexture = null;

textureLoader.loadAsync('models/base/shaded.png').then((texture) => {
    shadedTexture = texture;
    // ... configuração da textura ...
    console.log('Textura shaded carregada com sucesso!');

    // Se o modelo já estiver carregado, aplica a textura imediatamente
    if (model) {
        applyTexturesToModel();
    }
}).catch((error) => {
    console.error('Erro ao carregar textura shaded:', error);
});
```

A escolha por `loadAsync()` (em vez de `load()` com callback) se deve ao fato de que a textura do personagem **não é necessária imediatamente** para a renderização inicial da cena — o carregamento pode ocorrer em paralelo com o carregamento do modelo FBX, que é mais pesado.

### 3.3 Configuração da Textura

Após a textura ser carregada, três propriedades são configuradas (linhas 238-240):

```js
texture.encoding = THREE.sRGBColorSpace;
texture.magFilter = THREE.LinearFilter;
texture.minFilter = THREE.LinearMipmapLinearFilter;
```

| Propriedade | Valor | Explicação |
|---|---|---|
| `encoding` | `THREE.sRGBColorSpace` | Define o espaço de cor como sRGB, que é o padrão para texturas difusas. Isso garante que as cores da imagem PNG sejam reproduzidas fielmente na tela, com a correção de gamma adequada. |
| `magFilter` | `THREE.LinearFilter` | Controla como a textura é amostrada quando um pixel na tela cobre **menos** de um texel (magnificação). O `LinearFilter` faz interpolação bilinear entre os 4 texels mais próximos, resultando em uma imagem mais suave. |
| `minFilter` | `THREE.LinearMipmapLinearFilter` | Controla como a textura é amostrada quando um pixel na tela cobre **mais** de um texel (minificação). Este é o filtro de maior qualidade: usa mipmaps com interpolação trilinear, reduzindo aliasing e serrilhados em objetos distantes. |

### 3.4 Carregamento do Modelo FBX

O modelo FBX é carregado com o `FBXLoader` (linhas 279-310):

```js
const fbxLoader = new FBXLoader();
fbxLoader.load(
    'models/base/base.fbx',
    function (fbx) {
        model = fbx;
        // Ajustes de escala e posição
        model.scale.set(0.01, 0.01, 0.01);
        model.position.y = 0;
        // ...

        // Tenta aplicar a textura se ela já estiver carregada
        applyTexturesToModel();

        // Configura mixer de animação
        mixer = new THREE.AnimationMixer(model);
        // Carrega animações (idle, walk, run, etc.)
        // ...
    }
);
```

Após o carregamento, o modelo é **escalado** para 1% do tamanho original (fator comum para modelos FBX do Mixamo, que costumam vir em escala diferente da usada no Three.js) e posicionado no centro da cena com os pés no chão (`y = 0`).

### 3.5 Função de Aplicação da Textura

A função `applyTexturesToModel()` (linhas 253-276) é o coração do processo:

```js
function applyTexturesToModel() {
    if (!model || !shadedTexture) {
        console.warn('Modelo ou textura ainda não carregados');
        return;
    }

    model.traverse((child) => {
        if (child.isMesh) {
            const material = new THREE.MeshPhongMaterial({
                map: shadedTexture,
                side: THREE.FrontSide
            });

            child.material = material;
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
}
```

**O que ela faz:**

1. **Verificação de segurança**: Confirma se tanto o modelo quanto a textura já estão disponíveis. Se não, exibe um aviso no console e sai.

2. **Percorrimento da árvore do modelo**: `model.traverse()` visita **todos os nós filhos** do modelo, incluindo malhas (meshes), ossos (bones) e grupos.

3. **Identificação de malhas**: Para cada nó filho que seja uma malha (`child.isMesh`), um novo material é criado.

4. **Criação do material**: É instanciado um `MeshPhongMaterial` — um material que suporta iluminação especular (brilho) e difusa. A propriedade `map` recebe a textura carregada, e `side: THREE.FrontSide` indica que a textura só deve ser renderizada na parte frontal das faces.

5. **Substituição do material**: O material original do modelo FBX é **substituído** pelo novo material texturizado. Isso é necessário porque o material padrão do FBX pode não utilizar textura ou pode ter configurações incompatíveis.

6. **Configuração de sombras**: `castShadow = true` e `receiveShadow = true` garantem que o personagem projete e receba sombras corretamente.

### 3.6 Tratamento de Condição de Corrida (Race Condition)

Como tanto o modelo FBX quanto a textura PNG são carregados **de forma assíncrona e independente**, existe uma condição de corrida: não é possível saber qual dos dois terminará primeiro. O código trata essa situação em **três pontos**:

| Cenário | O que acontece |
|---|---|
| **Textura carrega primeiro** | A textura é armazenada em `shadedTexture`. Como `model` ainda é `null`, nada acontece. Quando o modelo terminar de carregar, a linha `applyTexturesToModel()` é chamada dentro do callback do FBXLoader e a textura será aplicada. |
| **Modelo carrega primeiro** | O callback do FBXLoader chama `applyTexturesToModel()`. Como `shadedTexture` ainda é `null`, a função exibe um aviso e retorna sem aplicar nada. Quando a textura terminar de carregar, o `.then()` do `loadAsync` verifica `if (model)` — que agora é verdadeiro — e chama `applyTexturesToModel()`. |
| **Ambos já carregados** | A chamada em qualquer um dos dois callbacks encontrará tanto `model` quanto `shadedTexture` disponíveis e aplicará a textura imediatamente. |

Esse padrão garante que a textura será aplicada **independentemente da ordem de carregamento**, sem necessidade de temporizadores ou polling.

---

## 4. Exemplo Visual do Fluxo

```
                          ┌─────────────────────────────┐
                          │   textureLoader.loadAsync()  │
                          │   'models/base/shaded.png'   │
                          └──────────────┬──────────────┘
                                         │
                                         ▼
                          ┌─────────────────────────────┐
                          │   Textura carregada          │
                          │   → shadedTexture definida   │
                          │   → encoding, filters set    │
                          └──────────────┬──────────────┘
                                         │
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
               model existe?                     model não existe?
                         │                               │
                         ▼                               ▼
               applyTexturesToModel()             Aguarda modelo
                         │                          carregar
                         ▼                               │
               Textura aplicada!                    ┌────┘
                                                    ▼
                                         model carrega →
                                         applyTexturesToModel()
                                                    │
                                                    ▼
                                          Textura aplicada!
```

```
                          ┌─────────────────────────────┐
                          │    fbxLoader.load()          │
                          │   'models/base/base.fbx'    │
                          └──────────────┬──────────────┘
                                         │
                                         ▼
                          ┌─────────────────────────────┐
                          │   Modelo carregado           │
                          │   → scale, position set      │
                          └──────────────┬──────────────┘
                                         │
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
               textura existe?                 textura não existe?
                         │                               │
                         ▼                               ▼
               applyTexturesToModel()             Aviso no console
                         │                       "Ainda não carregados"
                         ▼                               │
               Textura aplicada!                    ┌────┘
                                                    ▼
                                         Textura carrega →
                                         model existe? → SIM
                                         applyTexturesToModel()
                                                    │
                                                    ▼
                                          Textura aplicada!
```

---

## 5. Texturas do Ambiente (Chão e Muros)

O mesmo `TextureLoader` é utilizado para carregar texturas do cenário, mas com uma abordagem **síncrona** (via `.load()` com callback). A diferença principal é o uso de **RepeatWrapping** para repetir a textura em superfícies grandes:

```js
// Chão (main.js:70-75)
const grassTexture = textureLoader.load(
    'textures/textures/grasss_baseColor.jpeg'
);
grassTexture.wrapS = THREE.RepeatWrapping;
grassTexture.wrapT = THREE.RepeatWrapping;
grassTexture.repeat.set(4, 4);
const floorMaterial = new THREE.MeshLambertMaterial({ map: grassTexture });

// Muros (main.js:87-92)
const stoneTexture = textureLoader.load(
    'textures/stone_wall/textures/Scene_-_Root_baseColor.jpeg'
);
stoneTexture.wrapS = THREE.RepeatWrapping;
stoneTexture.wrapT = THREE.RepeatWrapping;
stoneTexture.repeat.set(4, 2);
const wallMaterial = new THREE.MeshLambertMaterial({ map: stoneTexture });
```

| Propriedade | Explicação |
|---|---|
| `wrapS` / `wrapT` | Definidas como `RepeatWrapping` para que a textura se repita (tile) ao invés de esticar quando o objeto for maior que a textura. |
| `repeat.set(4, 4)` | Repete a textura 4 vezes nas direções horizontal (S) e vertical (T) para cobrir o chão. |
| `repeat.set(4, 2)` | Repete 4 vezes na horizontal e 2 na vertical para os muros. |

---

## 6. Texturas Alternativas (Skins)

Na pasta `models/textures/` existem texturas de skin alternativa (`super_trooper_green_*`), que seguem o padrão **PBR** (Physically Based Rendering) com mapas de `baseColor` e `metallicRoughness`. Essas texturas estão disponíveis no diretório do projeto mas **não são carregadas ativamente** no código atual — foram preparadas para uma futura funcionalidade de seleção de skins.

Quando implementada, a troca de skin será feita simplesmente alterando a variável `shadedTexture` e chamando novamente `applyTexturesToModel()`, reaproveitando toda a estrutura já criada.

---

## 7. Considerações Técnicas

### Por que `MeshPhongMaterial` em vez de `MeshStandardMaterial`?

O `MeshPhongMaterial` foi escolhido por ser mais **leve** que o `MeshStandardMaterial` (que calcula PBR completa) e por ser **suficiente** para a textura shaded, que já contém informações de iluminação pré-calculadas na própria imagem. Isso resulta em melhor performance, especialmente em dispositivos menos potentes.

### Por que a textura é carregada com `loadAsync()`?

O modelo FBX é um arquivo relativamente grande (contém geometria, esqueleto, pesos de skinning). Ao carregar textura e modelo em paralelo, o tempo total de carregamento é reduzido, já que as requisições de rede/disco acontecem simultaneamente.

### E se a textura não for encontrada?

O `.catch()` do `loadAsync()` exibe um erro no console, mas o jogo continua funcionando — o modelo será renderizado sem textura (com as cores padrão do material FBX original).

### Por que percorrer todos os nós com `traverse()`?

Modelos FBX do Mixamo geralmente possuem múltiplas malhas (corpo, acessórios, olhos, etc.), cada uma com seu próprio material. Percorrer a árvore completa garante que **todas** as partes visíveis do personagem recebam a textura uniformemente.

---

## Resumo

O processo de aplicação de textura no personagem segue uma arquitetura robusta de **carregamento paralelo**:

1. Um `TextureLoader` carrega `shaded.png` de forma assíncrona, configurando espaço de cor sRGB e filtros de alta qualidade.
2. Um `FBXLoader` carrega `base.fbx`, ajusta escala e posição.
3. A função `applyTexturesToModel()` percorre todas as malhas do modelo e substitui seus materiais por `MeshPhongMaterial` apontando para a textura carregada.
4. Um sistema de verificação dupla garante que a textura seja aplicada independentemente da ordem de carregamento entre modelo e textura.

Esse padrão pode ser facilmente estendido para suportar **múltiplas skins** — bastaria trocar o arquivo de textura e reaplicar o material.
