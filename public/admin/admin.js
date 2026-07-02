const API = '/api/admin';
let config = null;
let storeEditId = null;
let roomEditId = null;

// === UI HELPERS ===
function $(sel, ctx = document) { return ctx.querySelector(sel); }
function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

function showToast(msg, type = 'info') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._hide);
  t._hide = setTimeout(() => t.classList.remove('show'), 3000);
}

function formatLabel(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
}

function inputType(key, val) {
  if (typeof val === 'boolean') return 'toggle';
  if (typeof val === 'number') return 'number';
  if (typeof val === 'string' && /^#[0-9a-f]{6}/i.test(val)) return 'color';
  if (typeof val === 'string' && /^https?:\/\//.test(val)) return 'url';
  if (typeof val === 'string' && /^-?\d+\.?\d*$/.test(val)) return 'number';
  return 'text';
}

// === TABS ===
$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    $$('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    const tab = $(`#tab-${btn.dataset.tab}`);
    if (tab) tab.classList.add('active');
    $('#pageTitle').textContent = btn.textContent.trim();
  });
});

// === API ===
async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// === LOAD CONFIG ===
async function loadConfig() {
  try {
    config = await api('GET', '/config');
    renderAll();
    updateServerStatus(true);
    showToast('Configuração carregada', 'success');
  } catch (err) {
    showToast(`Erro ao carregar: ${err.message}`, 'error');
    updateServerStatus(false);
  }
}

async function saveConfig(updates) {
  try {
    const merged = deepMerge(config, updates);
    config = await api('PUT', '/config', updates);
    renderAll();
    showToast('Configuração salva!', 'success');
  } catch (err) {
    showToast(`Erro ao salvar: ${err.message}`, 'error');
  }
}

function deepMerge(target, source) {
  const result = JSON.parse(JSON.stringify(target));
  for (const key in source) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// === RENDER ALL ===
function renderAll() {
  if (!config) return;
  renderConfigPreview();
  renderFeatures();
  renderEnvironment();
  renderNetwork();
  renderRoomsConfig();
  renderDebug();
  renderBuild();
  loadDashboardStats();
  loadPlayers();
}

// === CONFIG PREVIEW ===
function renderConfigPreview() {
  $('#configPreview').textContent = JSON.stringify(config, null, 2);
}

// === FEATURES TOGGLE ===
function renderFeatures() {
  const container = $('#featuresContainer');
  container.innerHTML = '';
  for (const [key, val] of Object.entries(config.features)) {
    const item = document.createElement('div');
    item.className = 'toggle-item';
    item.innerHTML = `
      <span class="toggle-label">${formatLabel(key)}</span>
      <label class="toggle-switch">
        <input type="checkbox" ${val ? 'checked' : ''} data-section="features" data-key="${key}">
        <span class="toggle-slider"></span>
      </label>
    `;
    container.appendChild(item);
  }
  container.querySelectorAll('input[type="checkbox"]').forEach(el => {
    el.addEventListener('change', () => {
      const section = el.dataset.section;
      const key = el.dataset.key;
      saveConfig({ [section]: { [key]: el.checked } });
    });
  });
}

// === ENVIRONMENT ===
function renderEnvironment() {
  renderFormGroup('environmentContainer', config.environment, 'environment');
}

function renderNetwork() {
  renderFormGroup('networkContainer', config.network, 'network');
}

function renderRoomsConfig() {
  renderFormGroup('roomsContainer', config.rooms, 'rooms');
}

function renderDebug() {
  const container = $('#debugContainer');
  container.innerHTML = '';
  for (const [key, val] of Object.entries(config.debug)) {
    if (typeof val === 'boolean') {
      const item = document.createElement('div');
      item.className = 'toggle-item';
      item.innerHTML = `
        <span class="toggle-label">${formatLabel(key)}</span>
        <label class="toggle-switch">
          <input type="checkbox" ${val ? 'checked' : ''} data-section="debug" data-key="${key}">
          <span class="toggle-slider"></span>
        </label>
      `;
      container.appendChild(item);
      item.querySelector('input').addEventListener('change', function () {
        saveConfig({ debug: { [this.dataset.key]: this.checked } });
      });
    } else {
      renderFormGroup('debugContainer', { [key]: val }, 'debug', true);
    }
  }
}

function renderBuild() {
  renderFormGroup('buildContainer', config.build, 'build');
}

// === FORM GROUP RENDERER ===
function renderFormGroup(containerId, data, section, append = false) {
  const container = $(`#${containerId}`);
  if (!append) container.innerHTML = '';

  for (const [key, val] of Object.entries(data)) {
    if (typeof val === 'boolean') continue;
    if (typeof val === 'object' && !Array.isArray(val)) {
      const subSection = document.createElement('div');
      subSection.className = 'form-group';
      subSection.innerHTML = `<label style="font-weight:600;color:var(--accent);margin-top:8px">${formatLabel(key)}</label>`;
      container.appendChild(subSection);
      for (const [sk, sv] of Object.entries(val)) {
        createFormField(container, section, `${key}.${sk}`, sv);
      }
      continue;
    }
    createFormField(container, section, key, val);
  }
}

function createFormField(container, section, key, val) {
  const group = document.createElement('div');
  group.className = 'form-group';
  const type = inputType(key, val);
  const label = formatLabel(key.split('.').pop());

  if (type === 'toggle') return;

  group.innerHTML = `<label for="${section}-${key}">${label}</label>`;

  if (type === 'color') {
    const input = document.createElement('input');
    input.type = 'color';
    input.id = `${section}-${key}`;
    input.value = val;
    input.addEventListener('change', () => {
      const update = buildNestedUpdate(section, key, input.value);
      saveConfig(update);
    });
    group.appendChild(input);
  } else {
    const input = document.createElement('input');
    input.type = type;
    input.id = `${section}-${key}`;
    input.value = val;
    input.step = type === 'number' && String(val).includes('.') ? '0.1' : '1';
    input.addEventListener('change', () => {
      let newVal = input.value;
      if (type === 'number') newVal = input.value.includes('.') ? parseFloat(input.value) : parseInt(input.value);
      const update = buildNestedUpdate(section, key, newVal);
      saveConfig(update);
    });
    group.appendChild(input);
  }

  container.appendChild(group);
}

function buildNestedUpdate(section, key, value) {
  const keys = key.split('.');
  if (keys.length === 1) return { [section]: { [key]: value } };
  return { [section]: { [keys[0]]: { [keys[1]]: value } } };
}

// === DASHBOARD STATS ===
async function loadDashboardStats() {
  try {
    const stats = await api('GET', '/stats');
    const totalP = stats.totalPlayers ?? '?';
    const onlineP = stats.players ?? '?';
    $('#statPlayers').innerHTML = `${onlineP}<span style="font-size:14px;opacity:0.5">/${totalP}</span>`;
    $('#statRooms').textContent = stats.rooms ?? '?';
    $('#statStores').textContent = stats.stores ?? '?';
    $('#statTickRate').textContent = config?.network?.tickRate ?? '?';
  } catch (err) {
    console.error('Erro ao carregar stats:', err);
  }
}

// === SERVER STATUS ===
function updateServerStatus(online) {
  const status = $('#serverStatus');
  const dot = status.querySelector('.status-dot');
  const text = status.querySelector('.status-text');
  if (online) {
    dot.className = 'status-dot online';
    text.textContent = 'Conectado ao servidor';
  } else {
    dot.className = 'status-dot offline';
    text.textContent = 'Desconectado';
  }
}

// === RESET CONFIG ===
$('#resetBtn').addEventListener('click', async () => {
  if (!confirm('Tem certeza que deseja resetar todas as configurações para os padrões?')) return;
  try {
    config = await api('POST', '/config/reset');
    renderAll();
    showToast('Configuração resetada para padrões!', 'success');
  } catch (err) {
    showToast(`Erro ao resetar: ${err.message}`, 'error');
  }
});

// === REFRESH BUTTON ===
$('#refreshBtn').addEventListener('click', () => {
  loadConfig();
  loadRooms();
  loadStores();
  loadPlayers();
  loadDashboardStats();
});

// === ROOMS ===
async function loadRooms() {
  try {
    const rooms = await api('GET', '/rooms');
    const container = $('#roomsList');
    if (!rooms || rooms.length === 0) {
      container.innerHTML = '<p class="empty-state">Nenhuma sala encontrada.</p>';
      return;
    }
    container.innerHTML = rooms.map(r => {
      const pct = r.current_players / r.max_players * 100;
      return `
        <div class="room-card">
          <div class="room-info">
            <h4>${r.name}</h4>
            <span>ID: ${r.id.slice(0, 8)}...</span>
          </div>
          <div class="room-capacity">
            <span>${r.current_players}/${r.max_players}</span>
            <div class="capacity-bar">
              <div class="capacity-fill" style="width:${Math.min(pct, 100)}%"></div>
            </div>
          </div>
          <div class="store-actions">
            <button class="btn btn-sm btn-outline" onclick="editRoom('${r.id}', '${r.name.replace(/'/g, "\\'")}', ${r.max_players})">Editar</button>
            <button class="btn btn-sm btn-danger" onclick="deleteRoom('${r.id}')">Excluir</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Erro ao carregar salas:', err);
  }
}

function editRoom(id, name, maxPlayers) {
  roomEditId = id;
  const form = $('#roomForm');
  form.name.value = name;
  form.max_players.value = maxPlayers;
  $('#roomFormTitle').textContent = 'Editar Sala';
  $('#roomFormBtn').textContent = 'Salvar Alterações';
  $('#roomCancelBtn').style.display = 'inline-block';
}

function cancelRoomEdit() {
  roomEditId = null;
  $('#roomForm').reset();
  $('#roomFormTitle').textContent = 'Nova Sala';
  $('#roomFormBtn').textContent = 'Adicionar Sala';
  $('#roomCancelBtn').style.display = 'none';
}

async function deleteRoom(id) {
  if (!confirm('Excluir esta sala? Jogadores nela serão removidos.')) return;
  try {
    await api('DELETE', `/rooms/${id}`);
    showToast('Sala excluída!', 'success');
    loadRooms();
    loadDashboardStats();
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
  }
}

$('#roomCancelBtn').addEventListener('click', cancelRoomEdit);

$('#roomForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = {
    name: fd.get('name'),
    max_players: parseInt(fd.get('max_players')) || 10,
  };
  try {
    if (roomEditId) {
      await api('PUT', `/rooms/${roomEditId}`, data);
      showToast('Sala atualizada!', 'success');
    } else {
      await api('POST', '/rooms', data);
      showToast('Sala criada!', 'success');
    }
    cancelRoomEdit();
    loadRooms();
    loadDashboardStats();
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
  }
});

// === STORES ===
async function loadStores() {
  try {
    const stores = await api('GET', '/stores');
    const container = $('#storesContainer');
    if (!stores || stores.length === 0) {
      container.innerHTML = '<p class="empty-state">Nenhuma loja cadastrada.</p>';
      return;
    }
    const t = document.createElement('table');
    t.className = 'stores-table';
    t.innerHTML = `
      <thead>
        <tr>
          <th>Nome</th>
          <th>Slug</th>
          <th>Categoria</th>
          <th>URL</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${stores.map(s => `
          <tr>
            <td><strong>${s.name}</strong></td>
            <td><span class="badge">${s.slug}</span></td>
            <td>${formatLabel(s.category)}</td>
            <td><a href="${s.site_url}" target="_blank" style="color:var(--accent);font-size:12px">${s.site_url}</a></td>
            <td><span class="store-status ${s.is_active ? 'active' : 'inactive'}">${s.is_active ? 'Ativo' : 'Inativo'}</span></td>
            <td>
              <div class="store-actions">
                <button class="btn btn-sm btn-outline" onclick="editStore('${s.id}')">Editar</button>
                <button class="btn btn-sm btn-danger" onclick="deleteStore('${s.id}')">Excluir</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    `;
    container.innerHTML = '';
    container.appendChild(t);
  } catch (err) {
    console.error('Erro ao carregar lojas:', err);
  }
}

async function deleteStore(id) {
  if (!confirm('Excluir esta loja?')) return;
  try {
    await api('DELETE', `/stores/${id}`);
    showToast('Loja excluída!', 'success');
    loadStores();
    loadDashboardStats();
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
  }
}

async function editStore(id) {
  try {
    const stores = await api('GET', '/stores');
    const store = stores.find(s => s.id === id);
    if (!store) { showToast('Loja não encontrada', 'error'); return; }

    storeEditId = id;
    const form = $('#storeForm');
    form.name.value = store.name;
    form.slug.value = store.slug;
    form.category.value = store.category;
    form.site_url.value = store.site_url;
    form.pos_x.value = store.position?.x || 0;
    form.pos_z.value = store.position?.z || 0;
    form.is_active.value = store.is_active ? 'true' : 'false';
    $('#storeFormTitle').textContent = 'Editar Loja';
    $('#storeFormBtn').textContent = 'Salvar Alterações';
    $('#storeCancelBtn').style.display = 'inline-block';
    form.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
  }
}

function cancelStoreEdit() {
  storeEditId = null;
  $('#storeForm').reset();
  $('#storeFormTitle').textContent = 'Nova Loja';
  $('#storeFormBtn').textContent = 'Adicionar Loja';
  $('#storeCancelBtn').style.display = 'none';
}

$('#storeCancelBtn').addEventListener('click', cancelStoreEdit);

$('#storeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = {
    name: fd.get('name'),
    slug: fd.get('slug'),
    category: fd.get('category'),
    site_url: fd.get('site_url'),
    is_active: fd.get('is_active') === 'true',
    position: {
      x: parseFloat(fd.get('pos_x')),
      y: 0,
      z: parseFloat(fd.get('pos_z')),
    },
    collision_box: { width: 2, depth: 2, height: 3 },
  };
  try {
    if (storeEditId) {
      await api('PUT', `/stores/${storeEditId}`, data);
      showToast('Loja atualizada!', 'success');
    } else {
      await api('POST', '/stores', data);
      showToast('Loja adicionada!', 'success');
    }
    cancelStoreEdit();
    loadStores();
    loadDashboardStats();
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
  }
});

// === PLAYERS ===
let allPlayers = [];
let selectedPlayerIds = new Set();
let currentPlayerFilter = 'all';

function formatPlayerDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min atrás`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h atrás`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d atrás`;
  return d.toLocaleString('pt-BR');
}

function getPlayerStatusInfo(p) {
  if (p.status === 'online') {
    return { label: 'Online', className: 'active' };
  }
  const diffMin = Math.floor((new Date() - new Date(p.last_seen_at || p.created_at)) / 60000);
  if (diffMin < 5) return { label: 'Ausente', className: 'connecting' };
  return { label: 'Offline', className: 'inactive' };
}

function updateBatchActions() {
  const bar = $('#playersBatchBar');
  const countEl = $('#selectedCount');
  const deleteBtn = $('#batchDeleteBtn');
  if (!bar || !countEl || !deleteBtn) return;
  const count = selectedPlayerIds.size;
  if (count > 0) {
    bar.classList.remove('hidden');
    countEl.textContent = `${count} selecionado(s)`;
    deleteBtn.disabled = false;
  } else {
    bar.classList.add('hidden');
    deleteBtn.disabled = true;
  }
}

function togglePlayerSelection(id, checked) {
  if (checked) {
    selectedPlayerIds.add(id);
  } else {
    selectedPlayerIds.delete(id);
  }
  const row = $(`#player-row-${id}`);
  if (row) {
    row.classList.toggle('selected', checked);
    row.querySelector('.player-checkbox').checked = checked;
  }
  updateBatchActions();
}

function toggleAllPlayers(checked) {
  const visibleRows = $$('#playersContainer tbody tr');
  for (const row of visibleRows) {
    const cb = row.querySelector('.player-checkbox');
    if (cb) {
      cb.checked = checked;
      if (checked) {
        selectedPlayerIds.add(cb.dataset.playerId);
      } else {
        selectedPlayerIds.delete(cb.dataset.playerId);
      }
      row.classList.toggle('selected', checked);
    }
  }
  updateBatchActions();
}

function filterPlayers(filter) {
  currentPlayerFilter = filter;
  $$('.players-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === filter));
  renderPlayerTable();
}

function renderPlayerTable() {
  const container = $('#playersContainer');
  if (!container) return;

  const filtered = allPlayers.filter(p => {
    if (currentPlayerFilter === 'online') return p.status === 'online';
    if (currentPlayerFilter === 'offline') return p.status !== 'online';
    return true;
  });

  if (filtered.length === 0) {
    const msg = currentPlayerFilter === 'online' ? 'Nenhum jogador online no momento.' :
                currentPlayerFilter === 'offline' ? 'Nenhum jogador no histórico.' :
                'Nenhum jogador registrado.';
    container.innerHTML = `<p class="empty-state">${msg}</p>`;
    return;
  }

  const allChecked = filtered.every(p => selectedPlayerIds.has(p.id));

  const t = document.createElement('table');
  t.className = 'stores-table';
  t.innerHTML = `
    <thead>
      <tr>
        <th style="width:32px">
          <input type="checkbox" class="player-checkbox" id="selectAllCb" ${allChecked && filtered.length > 0 ? 'checked' : ''} onchange="toggleAllPlayers(this.checked)">
        </th>
        <th>Jogador</th>
        <th>Status</th>
        <th>Última Atividade</th>
        <th>Posição</th>
        <th style="width:100px">Ações</th>
      </tr>
    </thead>
    <tbody>
      ${filtered.map(p => {
        const statusInfo = getPlayerStatusInfo(p);
        const checked = selectedPlayerIds.has(p.id);
        return `
          <tr id="player-row-${p.id}" class="player-row-selectable ${checked ? 'selected' : ''}" onclick="handlePlayerRowClick(event, '${p.id}')">
            <td>
              <input type="checkbox" class="player-checkbox" data-player-id="${p.id}" ${checked ? 'checked' : ''} onchange="event.stopPropagation(); togglePlayerSelection('${p.id}', this.checked)">
            </td>
            <td>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="width:10px;height:10px;border-radius:50%;background:${p.avatar_color};display:inline-block;flex-shrink:0"></span>
                <strong>${escHtml(p.nickname)}</strong>
              </div>
            </td>
            <td><span class="store-status ${statusInfo.className}">${statusInfo.label}</span></td>
            <td style="font-size:12px;color:var(--text-muted)">${formatPlayerDate(p.last_seen_at)}</td>
            <td>
              ${p.last_position ? `<span class="player-position">${formatPosition(p.last_position)}</span>` : '<span class="player-position">-</span>'}
            </td>
            <td>
              <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deletePlayer('${p.id}')">Excluir</button>
            </td>
          </tr>
        `;
      }).join('')}
    </tbody>
  `;
  container.innerHTML = '';
  container.appendChild(t);
  updateBatchActions();
}

function handlePlayerRowClick(event, id) {
  if (event.target.type === 'checkbox') return;
  const cb = document.querySelector(`#player-row-${id} .player-checkbox`);
  if (cb) {
    cb.checked = !cb.checked;
    togglePlayerSelection(id, cb.checked);
  }
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatPosition(pos) {
  if (typeof pos === 'string') {
    try { pos = JSON.parse(pos); } catch { return pos; }
  }
  if (pos && typeof pos === 'object') {
    const x = pos.x ?? 0;
    const z = pos.z ?? 0;
    return `${Number(x).toFixed(1)}, ${Number(z).toFixed(1)}`;
  }
  return String(pos);
}

async function loadPlayers() {
  try {
    const players = await api('GET', '/players');
    allPlayers = players || [];
    selectedPlayerIds.clear();
    renderPlayerTable();
  } catch (err) {
    console.error('Erro ao carregar jogadores:', err);
    const container = $('#playersContainer');
    if (container) container.innerHTML = '<p class="empty-state">Erro ao carregar jogadores.</p>';
  }
}

async function deletePlayer(id) {
  if (!confirm('Excluir este jogador? Isso removerá suas sessões e visitas.')) return;
  try {
    await api('DELETE', `/players/${id}`);
    selectedPlayerIds.delete(id);
    showToast('Jogador excluído!', 'success');
    loadPlayers();
    loadDashboardStats();
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
  }
}

async function deleteSelectedPlayers() {
  const ids = [...selectedPlayerIds];
  if (ids.length === 0) return;
  if (!confirm(`Excluir ${ids.length} jogador(es)? Isso removerá suas sessões e visitas.`)) return;
  let success = 0;
  let fail = 0;
  for (const id of ids) {
    try {
      await api('DELETE', `/players/${id}`);
      success++;
    } catch {
      fail++;
    }
  }
  selectedPlayerIds.clear();
  showToast(`${success} jogador(es) excluído(s)${fail > 0 ? `, ${fail} falha(s)` : ''}!`, fail > 0 ? 'error' : 'success');
  loadPlayers();
  loadDashboardStats();
}

// === EVENT BINDING FOR PLAYERS ===
document.addEventListener('click', (e) => {
  const playersTab = e.target.closest('.players-tab');
  if (playersTab) {
    filterPlayers(playersTab.dataset.filter);
  }
});

$('#batchDeleteBtn')?.addEventListener('click', deleteSelectedPlayers);
$('#batchClearBtn')?.addEventListener('click', () => {
  selectedPlayerIds.clear();
  renderPlayerTable();
});

// === BUILD ===
$('#buildSceneBtn').addEventListener('click', async () => {
  const output = $('#buildOutput');
  output.textContent = 'Iniciando build da cena...\n';
  try {
    const result = await api('POST', '/build');
    output.textContent += `\n${result.output || 'Build concluído!'}`;
    showToast('Cena reconstruída com sucesso!', 'success');
  } catch (err) {
    output.textContent += `\nERRO: ${err.message}`;
    showToast(`Erro no build: ${err.message}`, 'error');
  }
});

$('#buildStatusBtn').addEventListener('click', async () => {
  const output = $('#buildOutput');
  try {
    const result = await api('GET', '/build/status');
    output.textContent = JSON.stringify(result, null, 2);
  } catch (err) {
    output.textContent = `Erro: ${err.message}`;
  }
});

// === LOGS ===
$('#clearLogsBtn').addEventListener('click', () => {
  $('#serverLogs').textContent = 'Logs limpos.';
});

// === AUTO REFRESH ===
let refreshTimer = null;

function startAutoRefresh() {
  stopAutoRefresh();
  if (config?.admin?.autoRefresh && config?.admin?.refreshInterval > 0) {
    refreshTimer = setInterval(() => {
      loadDashboardStats();
      const activeTab = $('.nav-btn.active');
      if (activeTab) {
        const tab = activeTab.dataset.tab;
        if (tab === 'rooms') loadRooms();
        if (tab === 'stores') loadStores();
        if (tab === 'players') loadPlayers();
        if (tab === 'dashboard') loadDashboardStats();
      }
    }, config.admin.refreshInterval);
  }
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

// === INIT ===
async function init() {
  await loadConfig();
  startAutoRefresh();
  loadRooms();
  loadStores();
  loadPlayers();
}

init();
