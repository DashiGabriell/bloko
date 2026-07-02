import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

import configManager from './config/project-config.js';
import {
  supabaseAdmin,
  upsertPlayer,
  updatePlayerPosition,
  flushPlayerPosition,
  setPlayerOffline,
  getOnlinePlayers,
  getActiveStores,
  getDefaultRoom,
  addPlayerToRoom,
  removePlayerFromRoom,
  resetAllPlayersOffline,
} from './src/lib/supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  console.error(err.stack);
});

const app = express();
const server = http.createServer(app);

const cfg = configManager.getConfig();

const io = new Server(server, {
  cors: {
    origin: cfg.network.corsOrigin || process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

const PORT = process.env.PORT || cfg.network.serverPort || 3000;

app.use(express.json());

// ============================================================
// AUTH CONFIG
// ============================================================
app.get('/api/auth/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  });
});

// ============================================================
// DB HEALTH CHECK
// ============================================================
app.get('/api/health/db', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('stores').select('id', { count: 'exact', head: true });
    if (error) throw error;
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message, timestamp: new Date().toISOString() });
  }
});

// ============================================================
// PAGES
// ============================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use('/jogo', express.static(path.join(__dirname, 'public', 'jogo')));
app.get('/jogo', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'jogo', 'index.html'));
});

app.use('/configuracoes', express.static(path.join(__dirname, 'public', 'configuracoes')));
app.get('/configuracoes', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'configuracoes', 'index.html'));
});

// ============================================================
// ADMIN DASHBOARD
// ============================================================
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// === SETTINGS API (DB-backed config) ===
app.get('/api/admin/config', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_all_settings');
    if (error) throw error;
    const settings = data || {};
    const fullConfig = configManager.getConfig();
    const merged = { ...fullConfig, ...settings };
    res.json(merged);
  } catch (err) {
    console.error('[Settings] Erro ao ler configuração do banco:', err.message);
    res.json(configManager.getConfig());
  }
});

app.put('/api/admin/config', async (req, res) => {
  try {
    const updates = req.body;
    const sections = ['features', 'environment', 'network', 'rooms', 'debug', 'build', 'admin'];

    for (const section of sections) {
      if (updates[section]) {
        const { data: existing } = await supabaseAdmin
          .from('settings')
          .select('value')
          .eq('section', section)
          .single();

        const mergedValue = existing?.value
          ? { ...existing.value, ...updates[section] }
          : updates[section];

        await supabaseAdmin
          .from('settings')
          .upsert(
            { section, value: mergedValue },
            { onConflict: 'section' }
          );
      }
    }

    configManager.saveConfig(updates);

    const { data: freshSettings, error } = await supabaseAdmin.rpc('get_all_settings');
    if (error) throw error;
    const fullConfig = configManager.getConfig();
    const merged = { ...fullConfig, ...(freshSettings || {}) };

    io.emit('config:update', merged);
    res.json(merged);
  } catch (err) {
    console.error('[Settings] Erro ao salvar configuração:', err.message);
    res.status(500).json({ error: 'Falha ao salvar configuração' });
  }
});

app.post('/api/admin/config/reset', async (req, res) => {
  try {
    const defaults = configManager.getDefaults();
    const sections = ['features', 'environment', 'network', 'rooms', 'debug', 'build', 'admin'];

    for (const section of sections) {
      if (defaults[section]) {
        await supabaseAdmin.rpc('upsert_setting', {
          p_section: section,
          p_value: defaults[section],
        });
      }
    }

    configManager.resetConfig();
    io.emit('config:update', defaults);
    res.json(defaults);
  } catch (err) {
    console.error('[Settings] Erro ao resetar configuração:', err.message);
    res.status(500).json({ error: 'Falha ao resetar configuração' });
  }
});

// === STATS API ===
app.get('/api/admin/stats', async (req, res) => {
  try {
    const { count: players } = await supabaseAdmin.from('players').select('*', { count: 'exact', head: true }).eq('status', 'online');
    const { count: rooms } = await supabaseAdmin.from('rooms').select('*', { count: 'exact', head: true });
    const { count: stores } = await supabaseAdmin.from('stores').select('*', { count: 'exact', head: true });
    const { count: totalPlayers } = await supabaseAdmin.from('players').select('*', { count: 'exact', head: true });
    res.json({ players, rooms, stores, totalPlayers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === PLAYERS API ===
app.get('/api/admin/players', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('players')
      .select('id, nickname, avatar_color, status, last_position, last_seen_at, created_at')
      .order('last_seen_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/players/:id', async (req, res) => {
  try {
    const { error: rpErr } = await supabaseAdmin.from('room_players').delete().eq('player_id', req.params.id);
    if (rpErr) console.warn('Aviso ao limpar room_players:', rpErr.message);

    const { error: pvErr } = await supabaseAdmin.from('player_visits').delete().eq('player_id', req.params.id);
    if (pvErr) console.warn('Aviso ao limpar player_visits:', pvErr.message);

    const { error } = await supabaseAdmin.from('players').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === ROOMS API ===
app.get('/api/admin/rooms', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('rooms').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/rooms', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('rooms').insert({
      name: req.body.name || 'Nova Sala',
      max_players: req.body.max_players || 10,
      current_players: 0,
      is_full: false,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/rooms/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('rooms').update({
      name: req.body.name,
      max_players: req.body.max_players,
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/rooms/:id', async (req, res) => {
  try {
    const { error: rpErr } = await supabaseAdmin.from('room_players').delete().eq('room_id', req.params.id);
    if (rpErr) console.warn('Aviso ao limpar room_players:', rpErr.message);

    const { error } = await supabaseAdmin.from('rooms').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === STORES API ===
app.get('/api/admin/stores', async (req, res) => {
  try {
    const { data } = await supabaseAdmin.from('stores').select('*').order('name');
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/stores', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('stores').insert(req.body).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/stores/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('stores').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/stores/:id', async (req, res) => {
  try {
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
// AUTH MIDDLEWARE
// ============================================================
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  const token = authHeader.slice(7);
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) throw error || new Error('Usuário não encontrado');
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// ============================================================
// ME
// ============================================================
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
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

async function applyConfigToSocket(socket) {
  try {
    let cfg;
    try {
      const { data } = await supabaseAdmin.rpc('get_all_settings');
      const fullConfig = configManager.getConfig();
      cfg = { ...fullConfig, ...(data || {}) };
    } catch {
      cfg = configManager.getConfig();
    }
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
        last_position: { x: 0, y: 0, z: 0 },
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
        y: player.last_position?.y ?? 0,
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
        y: data.y ?? 0,
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

      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId);

      let query = supabaseAdmin
        .from('stores')
        .select('id, name, site_url, logo_url, category');

      if (isUUID) {
        query = query.eq('id', storeId);
      } else {
        query = query.eq('slug', storeId);
      }

      const { data: store, error } = await query.single();

      if (!error && store) {
        socket.emit('store:open', store);
      } else {
        socket.emit('store:closed');
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
        await flushPlayerPosition(playerId);
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
            y: p.last_position?.y ?? 0,
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
  console.log(`BLOKO - Servidor rodando em http://localhost:${PORT}`);
  console.log(`Tick rate: ${finalCfg.network.tickRate} tps`);
  console.log(`Supabase: ${process.env.SUPABASE_URL ? 'conectado' : 'sem .env'}`);
  console.log(`Admin: http://localhost:${PORT}/admin`);

  await resetAllPlayersOffline();
});
