require('dotenv').config();
const crypto = require('crypto');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { spawn } = require('child_process');

const configManager = require('./config/project-config');

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception:', err.message);
  console.error(err.stack);
});

const {
  upsertPlayer,
  updatePlayerPosition,
  setPlayerOffline,
  getOnlinePlayers,
  getActiveStores,
  getDefaultRoom,
  addPlayerToRoom,
  removePlayerFromRoom,
  resetAllPlayersOffline,
} = require('./src/lib/supabase');

const app = express();
const server = http.createServer(app);

const cfg = configManager.getConfig();

const io = new Server(server, {
  cors: {
    origin: cfg.network.corsOrigin || process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || cfg.network.serverPort || 3000;
const TICK_INTERVAL = 1000 / cfg.network.tickRate;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// ADMIN DASHBOARD
// ============================================================
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// === CONFIG API ===
app.get('/api/admin/config', (req, res) => {
  res.json(configManager.getConfig());
});

app.put('/api/admin/config', (req, res) => {
  const success = configManager.saveConfig(req.body);
  if (success) {
    const newCfg = configManager.getConfig();
    io.emit('config:update', newCfg);
    res.json(newCfg);
  } else {
    res.status(500).json({ error: 'Falha ao salvar configuração' });
  }
});

app.post('/api/admin/config/reset', (req, res) => {
  const success = configManager.resetConfig();
  if (success) {
    const defaults = configManager.getConfig();
    io.emit('config:update', defaults);
    res.json(defaults);
  } else {
    res.status(500).json({ error: 'Falha ao resetar configuração' });
  }
});

// === STATS API ===
app.get('/api/admin/stats', async (req, res) => {
  try {
    const { supabaseAdmin } = require('./src/lib/supabase');
    const { count: players } = await supabaseAdmin.from('players').select('*', { count: 'exact', head: true }).eq('status', 'online');
    const { count: rooms } = await supabaseAdmin.from('rooms').select('*', { count: 'exact', head: true });
    const { count: stores } = await supabaseAdmin.from('stores').select('*', { count: 'exact', head: true });
    res.json({ players, rooms, stores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === ROOMS API ===
app.get('/api/admin/rooms', async (req, res) => {
  try {
    const { supabaseAdmin } = require('./src/lib/supabase');
    const { data } = await supabaseAdmin.from('rooms').select('*').order('created_at', { ascending: false });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === STORES API ===
app.get('/api/admin/stores', async (req, res) => {
  try {
    const { supabaseAdmin } = require('./src/lib/supabase');
    const { data } = await supabaseAdmin.from('stores').select('*').order('name');
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/stores', async (req, res) => {
  try {
    const { supabaseAdmin } = require('./src/lib/supabase');
    const { data, error } = await supabaseAdmin.from('stores').insert(req.body).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/stores/:id', async (req, res) => {
  try {
    const { supabaseAdmin } = require('./src/lib/supabase');
    const { data, error } = await supabaseAdmin.from('stores').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/stores/:id', async (req, res) => {
  try {
    const { supabaseAdmin } = require('./src/lib/supabase');
    const { error } = await supabaseAdmin.from('stores').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === BUILD API ===
app.post('/api/admin/build', (req, res) => {
  const buildProcess = spawn('node', ['tools/build-scene.mjs'], {
    cwd: __dirname,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';

  buildProcess.stdout.on('data', (data) => {
    output += data.toString();
  });

  buildProcess.stderr.on('data', (data) => {
    output += data.toString();
  });

  buildProcess.on('close', (code) => {
    if (code === 0) {
      res.json({ success: true, output });
    } else {
      res.status(500).json({ success: false, output, error: `Código de saída: ${code}` });
    }
  });

  buildProcess.on('error', (err) => {
    res.status(500).json({ success: false, error: err.message });
  });
});

app.get('/api/admin/build/status', (req, res) => {
  const fs = require('fs');
  const scenePath = path.join(__dirname, 'public', 'assets', 'scene.glb');
  try {
    if (fs.existsSync(scenePath)) {
      const stat = fs.statSync(scenePath);
      res.json({
        exists: true,
        sizeKB: (stat.size / 1024).toFixed(1),
        modifiedAt: stat.mtime,
      });
    } else {
      res.json({ exists: false });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    players: playerIdToSocket.size,
    tickRate: configManager.getConfig().network.tickRate,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// SOCKET.IO
// ============================================================
const playerSockets = new Map();
const socketToPlayerId = new Map();
const playerIdToSocket = new Map();

function applyConfigToSocket(socket) {
  try {
    const cfg = configManager.getConfig();
    socket.emit('server:config', {
      environment: cfg.environment,
      features: cfg.features,
      debug: cfg.debug,
      network: { tickRate: cfg.network.tickRate },
    });
  } catch (err) {
    console.error('Erro ao enviar config para socket:', err.message);
  }
}

io.on('connection', (socket) => {
  console.log(`Jogador conectado: ${socket.id}`);

  let destroyed = false;

  socket.once('disconnect', () => { destroyed = true; });

  applyConfigToSocket(socket);

  socket.on('player:join', async (data) => {
    try {
      if (!configManager.getConfig().features.multiplayer) {
        socket.emit('error', { message: 'Multiplayer desativado' });
        return;
      }

      const playerId = crypto.randomUUID();
      socketToPlayerId.set(socket.id, playerId);
      playerIdToSocket.set(playerId, socket.id);

      const nickname = data?.nickname || `Jogador-${socket.id.slice(0, 5)}`;
      const avatarColor = data?.avatarColor || '#4F46E5';

      const player = await upsertPlayer(playerId, {
        nickname,
        avatar_color: avatarColor,
        status: 'online',
        last_position: { x: 0, y: 0.5, z: 0 },
        last_rotation: 0,
      });

      if (!player) {
        socketToPlayerId.delete(socket.id);
        playerIdToSocket.delete(playerId);
        return;
      }

      playerSockets.set(socket.id, playerId);

      const roomId = await getDefaultRoom();
      if (roomId) {
        await addPlayerToRoom(roomId, playerId);
        socket.join(roomId);
        socket.emit('room:joined', { roomId });
      }

      socket.emit('current-players', [{
        id: socket.id,
        nickname: player.nickname,
        avatarColor: player.avatar_color,
        x: player.last_position?.x || 0,
        y: player.last_position?.y || 0.5,
        z: player.last_position?.z || 0,
        rotation: player.last_rotation || 0,
        status: player.status,
      }]);
      socket.broadcast.emit('player:joined', { ...player, id: socket.id });
    } catch (err) {
      console.error(`Erro em player:join (${socket.id}):`, err.message);
    }
  });

  socket.on('player-move', async (data) => {
    try {
      if (!data || !configManager.getConfig().features.multiplayer) return;

      const playerId = socketToPlayerId.get(socket.id);
      if (!playerId) return;

      await updatePlayerPosition(playerId, {
        x: data.x || 0,
        y: data.y || 0.5,
        z: data.z || 0,
      }, data.rotation || 0);
    } catch (err) {
      console.error(`Erro em player-move (${socket.id}):`, err.message);
    }
  });

  socket.on('store:enter', async (data) => {
    try {
      const cfg = configManager.getConfig();
      if (!cfg.features.iframePortals) {
        socket.emit('store:closed');
        return;
      }

      const storeId = data?.storeId;
      if (!storeId) return;

      const { supabaseAdmin } = require('./src/lib/supabase');
      const { data: store, error } = await supabaseAdmin
        .from('stores')
        .select('id, name, site_url, logo_url, category')
        .eq('id', storeId)
        .single();

      if (!error && store) {
        socket.emit('store:open', store);
      }
    } catch (err) {
      console.error(`Erro em store:enter (${socket.id}):`, err.message);
    }
  });

  socket.on('store:leave', () => {
    socket.emit('store:closed');
  });

  socket.on('disconnect', async () => {
    if (destroyed) return;
    destroyed = true;

    try {
      console.log(`Jogador desconectado: ${socket.id}`);

      const playerId = socketToPlayerId.get(socket.id);

      if (playerId) {
        const { supabaseAdmin } = require('./src/lib/supabase');

        await setPlayerOffline(playerId);

        const { data: roomPlayers } = await supabaseAdmin
          .from('room_players')
          .select('room_id')
          .eq('player_id', playerId);

        if (roomPlayers) {
          for (const rp of roomPlayers) {
            await removePlayerFromRoom(rp.room_id, playerId);
          }
        }

        socketToPlayerId.delete(socket.id);
        playerIdToSocket.delete(playerId);
      }

      playerSockets.delete(socket.id);
      io.emit('player-disconnected', socket.id);
    } catch (err) {
      console.error(`Erro em disconnect (${socket.id}):`, err.message);
    }
  });
});

let gameTickTimer = null;

function startGameLoop() {
  if (gameTickTimer) clearInterval(gameTickTimer);

  const interval = 1000 / configManager.getConfig().network.tickRate;

  gameTickTimer = setInterval(async () => {
    try {
      const cfg = configManager.getConfig();
      if (!cfg.features.multiplayer) return;

      const onlinePlayers = await getOnlinePlayers();
      const connectedSocketIds = io.sockets.sockets;
      for (const [pid, sid] of playerIdToSocket) {
        if (!connectedSocketIds.has(sid)) {
          playerIdToSocket.delete(pid);
          socketToPlayerId.delete(sid);
        }
      }
      const snapshot = onlinePlayers
        .filter((p) => {
          const sid = playerIdToSocket.get(p.id);
          return sid && connectedSocketIds.has(sid);
        })
        .map((p) => {
          const socketId = playerIdToSocket.get(p.id);
          return {
            id: socketId,
            nickname: p.nickname,
            avatarColor: p.avatar_color,
            x: p.last_position?.x || 0,
            y: p.last_position?.y || 0.5,
            z: p.last_position?.z || 0,
            rotation: p.last_rotation || 0,
            status: p.status,
          };
        });
      io.emit('game-state', snapshot);
    } catch (err) {
      console.error('Erro no tick de estado:', err.message);
    }
  }, interval);
}

startGameLoop();

// Watch for config changes to restart game loop if tick rate changes
let lastTickRate = configManager.getConfig().network.tickRate;
setInterval(() => {
  const fresh = configManager.getConfig().network.tickRate;
  if (gameTickTimer && fresh !== lastTickRate) {
    lastTickRate = fresh;
    console.log(`[Config] Tick rate alterado para ${fresh} tps - reiniciando game loop`);
    startGameLoop();
  }
}, 3000);

server.listen(PORT, async () => {
  const finalCfg = configManager.getConfig();
  console.log(`🏙️  BLOKO - Servidor rodando em http://localhost:${PORT}`);
  console.log(`📡 Tick rate: ${finalCfg.network.tickRate} tps`);
  console.log(`🗄️  Supabase: ${process.env.SUPABASE_URL ? 'conectado' : 'sem .env'}`);
  console.log(`🛠️  Admin: http://localhost:${PORT}/admin`);

  await resetAllPlayersOffline();
});
