import { createClient } from '@supabase/supabase-js';
import https from 'https';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️  SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos no .env');
}

const keepAliveAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 30000 });

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    fetch: (url, opts) => fetch(url, { ...opts, agent: keepAliveAgent }),
  },
});

const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function getPlayerById(playerId) {
  const { data, error } = await supabaseAdmin
    .from('players')
    .select('*')
    .eq('id', playerId)
    .single();

  if (error) return null;
  return data;
}

async function upsertPlayer(playerId, data) {
  const { data: player, error } = await supabaseAdmin
    .from('players')
    .upsert({
      id: playerId,
      ...data,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('Erro ao upsert player:', error);
    return null;
  }
  return player;
}

async function retry(fn, maxRetries = 3, baseDelay = 200) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      const delay = baseDelay * Math.pow(2, i);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

const positionQueue = new Map();
const FLUSH_INTERVAL_MS = 2000;
let flushTimer = null;

function startFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(flushPendingPositions, FLUSH_INTERVAL_MS);
  if (flushTimer.unref) flushTimer.unref();
}

async function flushPendingPositions() {
  if (positionQueue.size === 0) return;

  const entries = [...positionQueue.entries()];
  positionQueue.clear();

  for (const [playerId, { position, rotation }] of entries) {
    try {
      await retry(async () => {
        const { error } = await supabaseAdmin
          .from('players')
          .update({
            last_position: position,
            last_rotation: rotation,
            status: 'online',
            last_seen_at: new Date().toISOString(),
          })
          .eq('id', playerId);

        if (error) throw error;
      });
    } catch (err) {
      console.error('Erro ao atualizar posição (após retries):', err);
    }
  }
}

async function flushPlayerPosition(playerId) {
  const entry = positionQueue.get(playerId);
  if (!entry) return;

  positionQueue.delete(playerId);

  try {
    await retry(async () => {
      const { error } = await supabaseAdmin
        .from('players')
        .update({
          last_position: entry.position,
          last_rotation: entry.rotation,
          status: 'online',
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', playerId);

      if (error) throw error;
    });
  } catch (err) {
    console.error('Erro ao atualizar posição (flush manual):', err);
  }
}

async function updatePlayerPosition(playerId, position, rotation) {
  startFlushTimer();
  positionQueue.set(playerId, { position, rotation });
}

async function setPlayerOffline(playerId) {
  const { error } = await supabaseAdmin
    .from('players')
    .update({
      status: 'offline',
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', playerId);

  if (error) console.error('Erro ao setar player offline:', error);
}

async function getOnlinePlayers() {
  const { data, error } = await supabaseAdmin
    .from('players')
    .select('id, nickname, avatar_color, last_position, last_rotation, status')
    .eq('status', 'online');

  if (error) return [];
  return data || [];
}

async function getActiveStores() {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .select('*')
    .eq('is_active', true);

  if (error) return [];
  return data || [];
}

async function getDefaultRoom() {
  const { data, error } = await supabaseAdmin.rpc('ensure_default_room');

  if (error) {
    console.error('Erro ao obter sala padrão:', error);
    return null;
  }
  return data;
}

async function addPlayerToRoom(roomId, playerId) {
  const { error } = await supabaseAdmin
    .from('room_players')
    .insert({ room_id: roomId, player_id: playerId });

  if (error) console.error('Erro ao adicionar player na sala:', error);
}

async function removePlayerFromRoom(roomId, playerId) {
  const { error } = await supabaseAdmin
    .from('room_players')
    .delete()
    .eq('room_id', roomId)
    .eq('player_id', playerId);

  if (error) console.error('Erro ao remover player da sala:', error);
}

async function resetAllPlayersOffline() {
  const { error } = await supabaseAdmin
    .from('players')
    .update({ status: 'offline' })
    .eq('status', 'online');

  if (error) {
    console.error('Erro ao resetar jogadores online:', error);
  } else {
    console.log('🔄 Jogadores órfãos resetados para offline');
  }
}

export {
  supabaseAdmin,
  supabaseAnon,
  getPlayerById,
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
};
