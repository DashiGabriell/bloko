<div align="center">

# 🏙️ BLOKO

### Um Bairro Comercial Virtual 3D — Micro-Metaverso Multiplayer em Tempo Real

<br>

![Node Version](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)
![Three.js](https://img.shields.io/badge/three.js-r185-000000?logo=three.js&logoColor=white)
![Socket.IO](https://img.shields.io/badge/socket.io-4.8-010101?logo=socket.io)
![Supabase](https://img.shields.io/badge/supabase-postgresql-3FCF8E?logo=supabase&logoColor=white)
![License](https://img.shields.io/badge/license-ISC-blue)

<br>

> Navegue por uma quadra low-poly, veja outros jogadores em tempo real
> e acesse sites reais de comércios locais através de portais 3D.

</div>

---

## 📋 Sobre

**BLOKO** é um micro-metaverso comercial leve e interativo, construído com Three.js e Node.js. Em uma quadra de cidade low-poly detalhada com ruas, calçadas, árvores, postes e quatro fachadas comerciais (Café, Farmácia, Padaria e Barbearia), os usuários podem:

- **Explorar** o ambiente 3D com movimentação WASD
- **Interagir** com outros jogadores em tempo real (multiplayer sincronizado a 15 ticks/s)
- **Acessar** sites reais de comércios locais através de portais (iframes) nas portas das lojas

O projeto foi desenvolvido para ser extremamente leve e acessível — sem bundlers, sem build steps complexos e com assets comprimidos via Draco (~116 KB).

---

## 🧱 Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| **Runtime** | Node.js >= 18 |
| **Servidor HTTP** | Express 5 |
| **Tempo Real** | Socket.IO 4.8 |
| **3D** | Three.js r185 (carregado via CDN import map) |
| **Banco de Dados** | Supabase (PostgreSQL) |
| **Clients Supabase** | @supabase/supabase-js 2.10 |
| **Compressão GLTF** | @gltf-transform/cli 4.4 (Draco) |
| **Cena Procedural** | Three.js (script próprio em `tools/build-scene.mjs`) |

---

## ✨ Funcionalidades

- **Ambiente 3D Low-Poly** — Quadra completa com 4 lojas, árvores, postes, calçadas e iluminação baked (AO + direcional) nos vértices
- **Movimentação WASD** — Controle suave com lerp, colisão com edifícios e limites do mundo
- **Multiplayer Síncrono** — Jogadores remotos aparecem como cubos coloridos com interpolação de posição
- **16+ Cores de Avatar** — Escolha sua cor ao entrar
- **Portais Comerciais** — Ao se aproximar da porta de uma loja, um iframe abre com o site real do estabelecimento
- **HUD em Tempo Real** — Contador de jogadores online e indicador de controles
- **Cena Otimizada** — .glb único com Draco compression (~116 KB), sem texturas externas
- **Sem Autenticação** — Entre instantaneamente com um apelido

---

## 🚀 Começando

### Pré-requisitos

- Node.js >= 18
- Um projeto [Supabase](https://supabase.com) (local ou hospedado)
- NPM

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

Copie ou edite o arquivo `.env` na raiz do projeto:

```env
SUPABASE_URL="https://<seu-projeto>.supabase.co"
SUPABASE_PUBLISHABLE_KEY="<anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
SUPABASE_PROJECT_ID="<project-id>"
```

> ⚠️ O `.env` está no `.gitignore` — nunca cometa suas chaves. Se você bifurcar este repositório, **substitua as chaves existentes** pelas do seu próprio projeto Supabase.

### 3. Configurar o banco de dados

O schema completo está em `supabase/migrations/20250101000001_initial_schema.sql`.

**Opção A — Supabase CLI (desenvolvimento local):**

```bash
npx supabase start
npx supabase db reset   # aplica migrations + seed
```

**Opção B — Supabase Hospedado:**

Execute o conteúdo do arquivo de migration no SQL Editor do painel Supabase.

O seed (`supabase/seed.sql`) cria:
- Uma sala padrão: **"Quadra Principal"** (máx. 10 jogadores)
- Três lojas de exemplo: Café, Farmácia e Tech

### 4. Iniciar o servidor

```bash
npm start
```

O servidor sobe em `http://localhost:3000`:

```
🏙️  BLOKO - Servidor rodando em http://localhost:3000
📡 Tick rate: 15 tps
🗄️  Supabase: conectado
```

Abra o endereço em duas ou mais abas para ver o multiplayer funcionando.

---

## 📜 Scripts

| Comando | Descrição |
|---|---|
| `npm start` | Inicia o servidor Node.js (porta 3000) |
| `npm run build:scene` | Regenera o cenário 3D proceduralmente e comprime com Draco |
| `npm test` | Placeholder (testes ainda não implementados) |

---

## 📁 Estrutura do Projeto

```
bloko/
├── .env                         # Credenciais Supabase (git-ignorado)
├── server.js                    # Servidor Express + Socket.IO (ponto de entrada)
├── package.json
│
├── public/                      # Frontend (servido estaticamente)
│   ├── index.html               # HTML principal com import map do Three.js
│   ├── style.css                # Estilos do HUD, loading screen
│   ├── js/
│   │   └── main.js              # Cliente Three.js + Socket.IO (~305 linhas)
│   └── assets/
│       └── scene.glb            # Cena 3D comprimida com Draco (~116 KB)
│
├── src/
│   └── lib/
│       └── supabase.js          # Cliente Supabase + funções de acesso a dados
│
├── supabase/                    # Configuração do Supabase
│   ├── config.toml
│   ├── seed.sql                 # Dados iniciais (sala padrão + lojas exemplo)
│   └── migrations/
│       └── 20250101000001_initial_schema.sql
│
└── tools/
    └── build-scene.mjs          # Gerador procedural da cena 3D (Three.js)
```

---

## 🧠 Arquitetura

### Servidor (`server.js`)

- Servidor **Express** servindo arquivos estáticos de `/public`
- **Socket.IO** para comunicação bidirecional em tempo real
- Loop de jogo a **15 ticks/s** — a cada tick (~66 ms) consulta o Supabase e transmite o estado global (`game-state`)
- Eventos Socket.IO:
  - `player:join` — Cria/atualiza jogador no banco, adiciona à sala padrão
  - `player-move` — Atualiza posição/rotação no banco
  - `store:enter` / `store:leave` — Abre/fecha portal iframe da loja
  - `disconnect` — Marca jogador como offline e notifica os demais

### Cliente (`public/js/main.js`)

- **Three.js** via CDN (import map) — sem bundler
- Cena com skybox, neblina, sombras e ACES filmic tone mapping
- Jogador local: cubo azul, movimento WASD com colisão contra bounding boxes dos prédios e limites do mundo
- Jogadores remotos: cubos coloridos com posição interpolada (lerp)
- Cena 3D carregada via GLTFLoader com Draco decoder
- Loop com `requestAnimationFrame` — broadcast de posição a 15 Hz

### Banco de Dados (Supabase / PostgreSQL)

**Tabelas principais:**

- `players` — id, nickname, avatar_color, last_position (jsonb), last_rotation, status (online/offline/idle)
- `stores` — id, name, slug, description, category, site_url, position (jsonb), collision_box (jsonb), is_active
- `rooms` — id, name, max_players, current_players, is_full
- `room_players` — Relação N:N entre salas e jogadores
- `player_visits` — Histórico de visitas às lojas

### Geração da Cena (`tools/build-scene.mjs`)

Script Node.js que gera proceduralmente toda a cena 3D com Three.js:

- **Rua** cinza escuro de 40×8 unidades com marcação central
- **Calçadas** e **meios-fios** em ambos os lados
- **4 edifícios** (Café, Farmácia, Padaria, Barbearia) com detalhes únicos:
  - Café: toldo + xícara na fachada
  - Farmácia: cruz verde
  - Padaria: toldo
  - Barbearia: poste barbeiro
- **4 árvores** low-poly nos cantos
- **4 postes** de iluminação
- **Iluminação baked** nos vértices (AO + directional — sem lightmaps em runtime)
- Saída comprimida com Draco para ~116 KB

---

## 🗺️ Roadmap

| Fase | Descrição | Status |
|---|---|---|
| **F1** | Esqueleto: Socket.IO + Three.js, cubo, WASD, sync 15 tps | ✅ Completo |
| **F2** | Cenário & Identidade: Quadra procedural, 4 fachadas, iluminação baked, Draco | ✅ Completo |
| **F3** | Integração & Portais: .glb em cena, colisão com portas, iframes, botão fechar | ⏳ Pendente |
| **F4** | Mobile, Salas & Deploy: Controles touch (NippleJS), limite de 10 jogadores/sala, deploy em Render/Railway + Vercel/Netlify | ⏳ Pendente |

---

## 🤝 Contribuindo

1. Faça um fork do projeto
2. Crie uma branch (`git checkout -b feature/sua-feature`)
3. Commit suas mudanças (`git commit -m 'feat: adiciona funcionalidade incrível'`)
4. Push para a branch (`git push origin feature/sua-feature`)
5. Abra um Pull Request

---

## 📄 Licença

Distribuído sob licença ISC.

---

<div align="center">
  <sub>Feito com ☕ e Three.js</sub>
</div>
