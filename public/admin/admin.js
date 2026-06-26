const API = '/api/admin';
let config = null;
let storeEditId = null;

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
    $('#statPlayers').textContent = stats.players ?? '?';
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
            <span>ID: ${r.id}</span>
          </div>
          <div class="room-capacity">
            <span>${r.current_players}/${r.max_players}</span>
            <div class="capacity-bar">
              <div class="capacity-fill" style="width:${Math.min(pct, 100)}%"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Erro ao carregar salas:', err);
  }
}

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

function editStore(id) {
  storeEditId = id;
  showToast('Edição via API será implementada em breve', 'info');
}

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
    const result = storeEditId
      ? await api('PUT', `/stores/${storeEditId}`, data)
      : await api('POST', '/stores', data);
    showToast(storeEditId ? 'Loja atualizada!' : 'Loja adicionada!', 'success');
    storeEditId = null;
    e.target.reset();
    loadStores();
    loadDashboardStats();
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
  }
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
}

init();
