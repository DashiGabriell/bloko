# BLOKO — Resumo da Aplicação

## Visão Geral

**BLOKO** é um micro-metaverso comercial 3D multiplayer em tempo real. O usuário explora uma quadra de bairro low-poly com ruas, calçadas, árvores, postes de luz e fachadas comerciais. A funcionalidade principal são os **portais comerciais**: ao se aproximar da porta de uma loja, um iframe abre exibindo o site real daquele negócio. Jogadores podem ver uns aos outros em tempo real via multiplayer sincronizado.

**Modelo de negócio:** Aluguel de vitrines digitais para negócios reais, painéis de publicidade e gamificação.

---

## Stack Tecnológica

| Camada | Tecnologia | Versão |
|---|---|---|
| Runtime | Node.js | >= 18 |
| Servidor HTTP | Express | 5.x |
| Tempo Real | Socket.IO | 4.8.x |
| Motor 3D | Three.js | r185 (CDN via import map) |
| Banco de Dados | Supabase (PostgreSQL) | Projeto `yuyflyvtxwhmathuxtrr` |
| Cliente Supabase | @supabase/supabase-js | 2.108 |
| Ferramentas GLTF | @gltf-transform/cli + core + extensions | 4.4 |
| Compressão 3D | Draco | 1.5.7 |
| Joystick Touch | NippleJS | 0.10.2 |
| Sistema de Módulos | ES Modules | `"type": "module"` |
| Deploy | Vercel | Serverless Node + estático |
| Autenticação | Supabase Auth | Google OAuth + Email/Senha |

**Diferencial arquitetural:** Não há bundlers nem build steps para o frontend. Three.js, exemplos do Three.js, NippleJS e Supabase JS são carregados via CDN com import maps. A única etapa de build é a geração procedural da cena 3D (script Node.js).

---

## Estrutura de Diretórios

```
C:\Projects\BLOKO\
├── server.js                    # Servidor Express + Socket.IO (654 linhas)
├── package.json                 # Dependências e scripts
├── vercel.json                  # Config de deploy Vercel
├── config/
│   ├── config.json              # Overrides de runtime (ex: fogColor)
│   └── project-config.js        # Gerenciador de configurações com defaults (173 linhas)
│
├── src/lib/supabase.js          # Cliente Supabase + funções DB (221 linhas)
│
├── public/                      # Frontend estático
│   ├── index.html               # Landing page com auth (203 linhas)
│   ├── landing.css              # Estilos da landing (298 linhas)
│   ├── assets/
│   │   ├── scene.glb            # Cena comprimida (~116 KB, Draco)
│   │   └── scene-metadata.json  # Limites dos prédios + metadados das lojas
│   ├── models/base/             # Modelo FBX do personagem + animações
│   ├── jogo/                    # Página do mundo 3D
│   │   ├── index.html           # HTML com import maps (218 linhas)
│   │   ├── style.css            # Estilos HUD/modal (616 linhas)
│   │   └── js/
│   │       ├── main.js          # Three.js client-side (651 linhas)
│   │       ├── camera.js        # Controladora de câmera (266 linhas)
│   │       └── player-model-3d.js  # Modelo FBX 3D (146 linhas)
│   ├── admin/                   # Painel administrativo SPA
│   ├── configuracoes/           # Página de configurações do usuário
│   └── auth/callback.html       # Handler de callback OAuth
│
├── supabase/
│   ├── config.toml              # Config local Supabase CLI (414 linhas)
│   ├── seed.sql                 # Seed data
│   └── migrations/              # Migrações SQL
│       ├── 01_initial_schema.sql
│       ├── 02_settings_table.sql
│       ├── 03_rooms_crud_policies.sql
│       ├── 04_fix_upsert_setting_merge.sql
│       └── 05_sync_stores_door_positions.sql
│
├── tools/                       # Scripts auxiliares
│   ├── build-scene.mjs          # Gerador procedural da cena 3D (460 linhas)
│   ├── analyze-scene.mjs        # Analisador de cena GLB
│   ├── create-terrain.mjs       # Cria plano de terreno
│   ├── create-floor-only.mjs    # Cria chão simples GLB
│   └── add-door-restaurant.mjs  # Injeção de porta no GLB
│
├── EXPLICACAO/                  # Documentação de referência (FSM animação)
├── PadrãoDashi/.agent/          # Definições de agentes/skills/workflows de IA
├── README.md, START.md, OBJETIVO.md, TODO.md, VOXEL-ROADMAP.md, etc.
└── resumo.md                    # Este arquivo
```

---

## Banco de Dados (Supabase / PostgreSQL)

### Tabelas

#### `players` — Jogadores
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | `uuid PK` | Identificador único |
| `nickname` | `text` | Apelido do jogador |
| `avatar_color` | `text` | Cor do avatar (hex) |
| `last_position` | `jsonb` | Última posição `{x,y,z}` |
| `last_rotation` | `float` | Última rotação em radianos |
| `status` | `player_status` | `online`, `offline` ou `idle` |
| `current_store_id` | `uuid FK → stores.id` | Loja atual (se dentro de uma) |
| `created_at` | `timestamptz` | Data de criação |
| `last_seen_at` | `timestamptz` | Última vez visto |

#### `stores` — Comércios / Lojas
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | `uuid PK` | Identificador único |
| `name` | `text` | Nome da loja |
| `slug` | `text UNIQUE` | Slug único para URL/lookup |
| `description` | `text` | Descrição do negócio |
| `category` | `store_category` | Categoria (alimentacao, saude, educacao, servicos, vestuario, entretenimento, outros, lazer) |
| `site_url` | `text` | URL real do site do negócio |
| `logo_url` | `text` | URL do logotipo |
| `position` | `jsonb` | Posição `{x,y,z}` no mundo 3D |
| `collision_box` | `jsonb` | Box de colisão `{width,depth,height}` |
| `is_active` | `boolean` | Se está ativa |
| `created_at` / `updated_at` | `timestamptz` | Controle de versão |

#### `rooms` — Salas / Instâncias
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | `uuid PK` | Identificador único |
| `name` | `text` | Nome da sala (ex: "Quadra Principal") |
| `max_players` | `int (default 10)` | Máximo de jogadores |
| `current_players` | `int` | Contagem atual |
| `is_full` | `boolean` | Sala lotada? |
| `created_at` | `timestamptz` | Data de criação |

#### `room_players` — Relação N:N Salas ↔ Jogadores
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | `uuid PK` | Identificador único |
| `room_id` | `uuid FK → rooms.id` | Sala |
| `player_id` | `uuid FK → players.id` | Jogador |
| `joined_at` | `timestamptz` | Quando entrou |
| *Unique constraint* | `(room_id, player_id)` | Mesmo jogador não pode entrar 2x |

#### `player_visits` — Log de Visitas a Lojas
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | `uuid PK` | Identificador único |
| `player_id` | `uuid FK → players.id` | Jogador |
| `store_id` | `uuid FK → stores.id` | Loja visitada |
| `entered_at` | `timestamptz` | Entrou às |
| `left_at` | `timestamptz` | Saiu às |
| *Unique constraint* | `(player_id, store_id, entered_at)` | Evita duplicatas |

#### `settings` — Configurações do Admin
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | `uuid PK` | Identificador único |
| `section` | `text UNIQUE` | Seção (ex: "features", "environment") |
| `value` | `jsonb` | Valor da configuração |
| `created_at` / `updated_at` | `timestamptz` | Controle de versão |

### Enums PostgreSQL

- `player_status`: `online`, `offline`, `idle`
- `store_category`: `alimentacao`, `saude`, `educacao`, `servicos`, `vestuario`, `entretenimento`, `outros`, `lazer`

### Funções do Banco

- **`ensure_default_room()`** — Cria a sala "Quadra Principal" se não existir e retorna seu UUID. Chamada na inicialização do servidor e quando um player conecta.
- **`update_updated_at_column()`** — Função trigger que automaticamente atualiza `updated_at = now()` em qualquer registro modificado.
- **`upsert_setting(p_section, p_value)`** — Faz merge inteligente de JSONB: se a seção já existe, faz `value || p_value` (mescla objetos); se não existe, insere novo registro.
- **`get_all_settings()`** — Agrega todas as seções num único objeto JSONB para envio otimizado aos clientes.
- **`update_room_player_count()`** — Trigger em `room_players`: no INSERT incrementa `current_players`, no DELETE decrementa, e atualiza `is_full`.

### Row Level Security (RLS)

Todas as tabelas têm RLS habilitado com políticas para:
- `anon` — acesso público mínimo (ex: ler stores ativas)
- `authenticated` — usuários logados podem ler/alterar seus próprios dados
- `service_role` — o servidor (chave service_role) tem acesso irrestrito para operações administrativas

### Migrações

| Migração | Descrição |
|---|---|
| `01_initial_schema.sql` | Schema completo + seed com 8 lojas e sala padrão |
| `02_settings_table.sql` | Tabela `settings` + funções `upsert_setting` e `get_all_settings` |
| `03_rooms_crud_policies.sql` | Políticas RLS para CRUD de salas |
| `04_fix_upsert_setting_merge.sql` | Corrige lógica de merge do upsert |
| `05_sync_stores_door_positions.sql` | Sincroniza lojas com doorPositions do scene-metadata.json; adiciona categoria `lazer` |

---

## Arquitetura da Aplicação

### Backend (`server.js`)

**Servidor HTTP:** Express 5 serve arquivos estáticos de `/public`. Endpoints:

- **`GET /api/auth/config`** — Expõe URL do Supabase + anon key para o cliente
- **`GET /api/health`** — Health check básico
- **`GET /api/health/db`** — Health check com ping no banco
- **`GET /api/auth/me`** — Retorna dados do usuário autenticado (protegido por Bearer token)
- **Admin REST API:** CRUD completo para players, rooms, stores, settings + trigger de build da cena

**Tempo Real (Socket.IO):** Eventos principais do protocolo:

| Evento (cliente → servidor) | Ação |
|---|---|
| `player:join` | Upsert do player, atribui à sala padrão, broadcast de `player:joined` e `players:update` |
| `player:move` | Atualiza posição/rotação; fila em memória para batch write no banco a cada 2s |
| `store:enter` | Busca loja por UUID ou slug, emite `store:open` com a URL real |
| `store:leave` | Emite `store:closed` para o cliente |
| `profile:update` | Atualiza nickname/avatar_color |
| `disconnect` | Marca como offline, remove da sala, broadcast |

| Evento (servidor → cliente) | Descrição |
|---|---|
| `players:update` | Lista de todos os jogadores na sala |
| `player:moved` | Posição atualizada de um jogador remoto |
| `store:open` | Abre iframe com URL da loja |
| `store:closed` | Fecha iframe |
| `config:update` | Configurações alteradas em tempo real |

**Game Loop:** 15 ticks/segundo (configurável via `config.network.tickRate`). Em cada tick, o servidor processa fila de movimentos e faz broadcast.

**Batch de Posições:** Posições dos players são enfileiradas em memória e escritas no Supabase a cada 2 segundos com retry logic, reduzindo pressão de write no banco.

### Frontend

#### Landing Page (`public/index.html`)
- Autenticação via Supabase Auth (Google OAuth + email/senha)
- Links para o jogo e configurações
- Modal "Sobre"

#### Jogo (`public/jogo/`)

**Carregamento da Cena:**
- Three.js com shadows, fog, ACES filmic tone mapping, luz hemispherica + fill + directional
- GLB loader com decodificador Draco (~116 KB)
- Cena gerada proceduralmente (ver seção abaixo)

**Sistema de Câmera (`camera.js`):**
- **Modo Isométrico (padrão):** Câmera orbital com ângulos predefinidos. Ao aproximar de uma loja, faz zoom suave na porta.
- **Modo Terceira Pessoa:** Câmera atrás do personagem com colisão contra obstáculos via raycasting.
- **Transições:** Suaves entre modos e estados de zoom.

**Movimento do Jogador (`main.js`):**
- Teclas WASD + joystick virtual NippleJS (touch)
- Colisão contra bounding boxes dos prédios + limites do mundo
- Suavização via lerp (interpolação linear)
- Velocidade configurável em tempo real

**Multiplayer:**
- Jogadores remotos renderizados como cubos coloridos (placeholder, planejado upgrade para modelo FBX)
- Interpolação de posição via lerp

**Portais Comerciais:**
- Zonas de trigger nas portas das lojas
- Ao entrar: iframe modal com o site real da loja
- Fechar: botão X, tecla Escape, clique fora

**HUD:**
- Contagem de jogadores (lista clicável)
- Cartão do usuário (avatar + nome)
- Botão de troca de câmera
- Modal de perfil (nickname + seletor de cor com 8 opções)

**Modelo 3D do Personagem (`player-model-3d.js`):**
- Classe `PlayerModel3D` carrega modelo FBX (Mixamo-style) com esqueleto
- 3 animações: idle, walk, run via `THREE.AnimationMixer`
- `changeState()` com cross-fade (0.2s fadeIn/fadeOut)

#### Painel Admin (`public/admin/`)
- SPA com sidebar de 9 abas: Dashboard, Features, Environment 3D, Network, Rooms, Stores, Players, Debug, Build
- Dashboard ao vivo: jogadores online, salas, lojas, tick rate
- CRUD completo de stores, rooms, players (com deleção em lote)
- Toggles para features, inputs numéricos/cores/texto para environment/network/debug
- Trigger de rebuild da cena 3D (`tools/build-scene.mjs`)
- Visualizador de logs do servidor
- Persistência dupla: Supabase `settings` + `config/config.json` local

### Sistema de Configuração

- **`config/project-config.js`** — Gerenciador com defaults abrangentes em 7 seções: features, environment, network, rooms, debug, build, admin
- **`config/config.json`** — Overrides de runtime
- **Supabase `settings` table** — Configurações persistentes com merge JSONB
- **Tempo real:** Quando config muda, servidor emite `config:update` para todos os sockets conectados
- **Cliente aplica:** dinamicamente (cor do céu, fog, intensidade da luz, velocidade, tick rate, limites do mundo, etc.)

---

## Cena 3D

### Geração Procedural (`tools/build-scene.mjs`)

Toda a cena 3D é gerada via código Three.js e exportada para `.glb` comprimido:

- **Rua:** 40×8 unidades, cinza, com marcação central
- **Calçadas e meios-fios** em ambos os lados
- **4 prédios** (Café, Farmácia, Padaria, Barbearia) com detalhes únicos:
  - Café: toldo + xícara na fachada
  - Farmácia: cruz verde (emissiva)
  - Padaria: toldo
  - Barbearia: barbeiro (listrado)
  - Cada prédio: caixa principal, telhado, porta frontal, 2 janelas laterais, letreiro
- **4 árvores** low-poly (esferas em cilindros)
- **4 postes de luz** com esferas emissivas
- **Vertex baking:** oclusão ambiente + luz direcional são pré-processadas nas cores dos vértices — sem necessidade de iluminação em tempo de execução
- **Saída:** `public/assets/scene.glb` (~116 KB após Draco)
- **Metadados:** `scene-metadata.json` com bounding boxes para colisão

### Variações de Cena

- `scene.glb` — produção atual
- `scene-backup.glb`, `ORIGINALscene.glb`, `opcaobscene.glb`, `GRANDEscene.glb` — versões alternativas/backup

---

## Autenticação

- **Provider:** Supabase Auth
- **Métodos:** Google OAuth + Email/Senha
- **Fluxo:**
  1. Landing page exibe botão Google + formulário email/senha
  2. Fetch em `/api/auth/config` para obter URL + anon key
  3. Cliente cria cliente Supabase Auth e faz login
  4. Sucesso: redireciona para `/jogo`
  5. Jogo verifica sessão; redireciona para `/` se não logado
  6. OAuth callback tratado em `/auth/callback.html`
- **Servidor:** usa service role key para operações DB (bypass RLS)
- **Middleware** valida Bearer tokens em rotas protegidas (`/api/auth/me`)
- **Multiplayer sem conta:** nick + cor salvos em localStorage

---

## Funcionalidades Notáveis

1. **Portais Comerciais (Iframe Gateways):** Andar até a porta de uma loja 3D abre um iframe com o site real do negócio. É o grande diferencial do produto.

2. **Cena 3D Totalmente Procedural:** A quadra inteira é gerada em código, permitindo regeneração dinâmica com parâmetros diferentes pelo admin.

3. **Vertex-Baked Lighting:** Iluminação pré-processada nos vértices — elimina shadow maps em runtime, roda em dispositivos fracos.

4. **Câmera Dupla:** Transições suaves entre isométrica e terceira pessoa, com zoom automático nas lojas.

5. **Admin com Config ao Vivo:** Admin pode toggle features, ajustar ambiente, gerenciar lojas/salas/players e rebuildar a cena — sem redeploy.

6. **Posições em Batch:** Posições enfileiradas e escritas a cada 2s, reduzindo write pressure no banco.

7. **Pipeline Draco:** Geração → compressão → extração de metadados em um único script (`npm run build:scene`).

8. **Multiplayer Sem Cadastro:** Jogadores entram instantaneamente com apelido e cor.

9. **Workflows de Agente IA:** Diretório `PadrãoDashi/.agent/` com 18 agentes, 12 workflows, 7 skills — sugere uso de IA assistida no desenvolvimento.

---

## Scripts (package.json)

| Comando | Descrição |
|---|---|
| `npm start` | Inicia servidor Node.js (porta 3000) |
| `npm run build:scene` | Gera cena procedural + comprime com Draco |
| `npm run analyze:scene` | Analisa GLB para colisões/metadados |
| `npm run create:terrain` | Cria plano de terreno e mescla com cena |
| `npm test` | Placeholder (sem testes ainda) |

---

## Deploy

- **`vercel.json`:** server.js como serverless function Node.js + `/public/**` como assets estáticos. Todas as rotas caem no servidor.
- **Supabase:** PostgreSQL remoto em `yuyflyvtxwhmathuxtrr.supabase.co`
- **Frontend estático** pode ser deployado separadamente em Vercel/Netlify e o backend em Render/Railway (conforme roadmap).

---

## Fluxo de Dados Completo

```
Usuário entra em /jogo
  → Verifica sessão Supabase Auth
  → Carrega Three.js (CDN)
  → Carrega scene.glb (Draco decoder)
  → Carrega scene-metadata.json
  → Conecta Socket.IO ao servidor
  → Emite player:join
    → Servidor upsert no Supabase (players)
    → Atribui à sala padrão (ensure_default_room)
    → Broadcast de players:update
  → Game loop 15 ticks/s
    → Teclas WASD movem jogador (colisão local)
    → player:move (pos + rot) via socket
    → Servidor broadcasta para outros (player:moved)
    → Servidor enfileira posição para batch (2s)
  → Jogador chega na porta de uma loja
    → Emite store:enter
    → Servidor busca stores no Supabase
    → Emite store:open com site_url
    → Cliente abre iframe modal
  → Admin altera configuração
    → Admin panel → fetch PUT /api/admin/settings
    → Servidor atualiza Supabase + config local
    → Servidor emite config:update para todos sockets
    → Clientes aplicam nova config em tempo real
```

---

## Lojas Semeadas (Seed Data)

| Slug | Nome | Categoria | Posição (x,z) |
|---|---|---|---|
| cafe | Café BLOKO | alimentacao | -5, -5.5 |
| farmacia | Farmácia BLOKO | saude | 5, -5.5 |
| padaria | Padaria BLOKO | alimentacao | -5, 5.5 |
| barbearia | Barbearia BLOKO | servicos | 5, 5.5 |
| loja1-002 | Loja 1 | outros | -10.87, -5.3 |
| hotel | Hotel BLOKO | servicos | 14.88, -4.41 |
| restaurant | Restaurant BLOKO | alimentacao | 17.87, -4.42 |
| new-building | New Building | outros | 19.56, 5.15 |

## Planos Futuros (Documentados)

- **Personagens Voxel:** Sistema de avatar customizável com partes do corpo, acessórios e gamificação (`VOXEL-ROADMAP.md`)
- **Migração FBX para Animação FSM:** Sistema de máquina de estados finitos para animações (`MIGRACAO-FSM-ANIMACAO.md`, `PLANO-PERSONAGEM-3D.md`)
- **Seleção de Personagens:** Tela de seleção com diferentes modelos/cores (`PLANO-SELECAO-PERSONAGENS.md`)
- **Salas Múltiplas:** Suporte a múltiplas instâncias da quadra
- **Monetização:** Aluguel de lojas, painéis publicitários, itens cosméticos
