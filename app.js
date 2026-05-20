/* ============================================================
   TimeFlies — app.js
   ============================================================ */

// ── STORE ────────────────────────────────────────────────────
const DB = {
  get users()   { return JSON.parse(localStorage.getItem('tf_users')   || '[]'); },
  get clients() { return JSON.parse(localStorage.getItem('tf_clients') || '[]'); },
  get entries() { return JSON.parse(localStorage.getItem('tf_entries') || '[]'); },
  save(key, val) { localStorage.setItem('tf_' + key, JSON.stringify(val)); },
};

const COLORS = ['#4f6ef7','#e74c8b','#27ae60','#f39c12','#8e44ad','#16a085','#e67e22','#2980b9','#c0392b','#1abc9c'];

let currentUser = null;
let timerInterval = null;
let timerStart = null;
let editingClientId = null;
let tempMatters = [];
let reportData = [];
let timerPopupWin = null;
const timerChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('timeflies-timer') : null;

// ── CLEAR OLD DUMMY DATA (one-time migration) ─────────────────
function clearDummyData() {
  const dummyNames = ['Carlos Mendoza','Ana Reyes','Luis Torres'];
  const users = DB.users.filter(u => !dummyNames.includes(u.name));
  const dummyClientIds = ['c1','c2','c3'];
  const clients = DB.clients.filter(c => !dummyClientIds.includes(c.id));
  const entries = DB.entries.filter(e => !dummyClientIds.includes(e.clientId));
  DB.save('users', users);
  DB.save('clients', clients);
  DB.save('entries', entries);
}

// ── UTILS ────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function todayStr() { return new Date().toISOString().slice(0,10); }
function offsetDate(d) {
  const dt = new Date(); dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0,10);
}
function fmtDuration(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}:${String(m).padStart(2,'0')}`;
}
function fmtDate(str) {
  const d = new Date(str + 'T12:00:00');
  return d.toLocaleDateString('es-CL', { day:'2-digit', month:'short', year:'numeric' });
}
function parseDuration(str) {
  const parts = str.split(':');
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  return parseInt(str) || 0;
}
function initials(name) { return name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase(); }
function clientColor(clientId) {
  const c = DB.clients.find(c => c.id === clientId);
  return c ? c.color : '#9ba3be';
}
function clientName(clientId) {
  const c = DB.clients.find(c => c.id === clientId);
  return c ? c.name : '—';
}
function userName(userId) {
  const u = DB.users.find(u => u.id === userId);
  return u ? u.name : '—';
}

function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast' + (type ? ' ' + type : '');
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2800);
}

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  clearDummyData();
  renderLoginScreen();
  bindGlobalEvents();
  initMiniTimerDrag();
  initBroadcastChannel();
});

// ── LOGIN ────────────────────────────────────────────────────
function renderLoginScreen() {
  const grid = document.getElementById('user-grid');
  const footer = document.querySelector('.login-footer');
  grid.innerHTML = '';

  const users = DB.users;
  if (users.length === 0) {
    grid.innerHTML = `
      <div class="login-empty">
        <div class="login-empty-icon">👤</div>
        <p>Aún no hay usuarios creados.</p>
        <p class="login-empty-sub">Crea el primer usuario para comenzar.</p>
      </div>`;
    footer.innerHTML = `<button class="btn-primary btn-create-first" id="btn-new-user">+ Crear primer usuario</button>`;
  } else {
    footer.innerHTML = `<button class="btn-ghost" id="btn-new-user">+ Nuevo usuario</button>`;
    users.forEach(u => {
      const card = document.createElement('div');
      card.className = 'user-card';
      card.innerHTML = `
        <div class="user-avatar" style="background:${u.color}">${initials(u.name)}</div>
        <div class="user-name">${u.name}</div>
        <div class="user-role">${u.role}</div>`;
      card.addEventListener('click', () => loginAs(u));
      grid.appendChild(card);
    });
  }

  // re-bind new user button (DOM was replaced)
  document.getElementById('btn-new-user').addEventListener('click', () => {
    ['new-user-name','new-user-role','new-user-rate'].forEach(id => document.getElementById(id).value = '');
    renderColorPicker();
    openModal('modal-user');
  });
}

function loginAs(user) {
  currentUser = user;
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  renderSidebarUser();
  switchView('dashboard');
  renderDashboard();
}

function renderSidebarUser() {
  document.getElementById('sidebar-user').innerHTML = `
    <div class="user-avatar" style="background:${currentUser.color}">${initials(currentUser.name)}</div>
    <div>
      <div class="user-name">${currentUser.name}</div>
      <div class="user-role">${currentUser.role}</div>
    </div>`;
}

// ── NAV ──────────────────────────────────────────────────────
function switchView(name) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === name);
  });
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  if (name === 'dashboard') renderDashboard();
  if (name === 'entries')   renderEntriesView();
  if (name === 'clients')   renderClientsView();
  if (name === 'reports')   generateReport();
}

// ── DASHBOARD / TIMER ────────────────────────────────────────
function renderDashboard() {
  const today = new Date();
  document.getElementById('today-label').textContent =
    today.toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long' });

  populateClientSelect('timer-client', 'timer-matter', '— Seleccionar cliente —');
  renderTodayEntries();
}

function renderTodayEntries() {
  const list = document.getElementById('today-entries');
  const today = todayStr();
  const entries = DB.entries.filter(e => e.date === today && e.userId === currentUser.id);
  const totalMins = entries.reduce((s, e) => s + e.duration, 0);
  document.getElementById('today-total').textContent = fmtDuration(totalMins) + ' h';

  list.innerHTML = '';
  if (entries.length === 0) {
    const noClients = DB.clients.length === 0;
    list.innerHTML = noClients
      ? `<div class="empty-state">
           Primero agrega un cliente en la sección <strong>Clientes</strong>,
           luego podrás registrar tiempo aquí.
         </div>`
      : '<div class="empty-state">Aún no hay registros hoy. ¡Empieza el timer!</div>';
    return;
  }
  entries.slice().reverse().forEach(e => list.appendChild(buildEntryItem(e)));
}

function buildEntryItem(e) {
  const div = document.createElement('div');
  div.className = 'entry-item';
  div.innerHTML = `
    <div class="entry-client-dot" style="background:${clientColor(e.clientId)}"></div>
    <div class="entry-info">
      <div class="entry-client">${clientName(e.clientId)}</div>
      <div class="entry-desc">${e.desc || '(sin descripción)'}</div>
      ${e.matter ? `<div class="entry-matter">${e.matter}</div>` : ''}
    </div>
    <span class="${e.billable ? 'entry-billable-badge' : 'entry-nb-badge'}">${e.billable ? 'Fact.' : 'No fact.'}</span>
    <div class="entry-duration">${fmtDuration(e.duration)}</div>`;
  div.addEventListener('click', () => openEditEntry(e.id));
  return div;
}

// ── TIMER LOGIC ──────────────────────────────────────────────
function startTimer() {
  timerStart = Date.now();
  timerInterval = setInterval(updateTimerDisplay, 1000);
  document.getElementById('timer-display').classList.add('running');
  document.getElementById('btn-timer-start').classList.add('hidden');
  document.getElementById('btn-timer-stop').classList.remove('hidden');
  showMiniTimer();
  broadcastState();
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  const elapsed = Math.round((Date.now() - timerStart) / 60000);
  timerStart = null;
  document.getElementById('timer-display').textContent = '00:00:00';
  document.getElementById('timer-display').classList.remove('running');
  document.getElementById('btn-timer-start').classList.remove('hidden');
  document.getElementById('btn-timer-stop').classList.add('hidden');
  hideMiniTimer();
  document.title = 'TimeFlies — Control de Horas';
  timerChannel?.postMessage({ type: 'stopped' });
  return elapsed;
}

function updateTimerDisplay() {
  const secs = Math.floor((Date.now() - timerStart) / 1000);
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  document.getElementById('timer-display').textContent = timeStr;
  document.getElementById('mini-timer-time').textContent = timeStr;
  document.title = `⏱ ${timeStr} — TimeFlies`;
  const cid = document.getElementById('timer-client')?.value;
  timerChannel?.postMessage({ type: 'tick', time: timeStr, client: cid ? clientName(cid) : 'Sin cliente', running: true });
}

function broadcastState() {
  const cid = document.getElementById('timer-client')?.value;
  const secs = timerStart ? Math.floor((Date.now() - timerStart) / 1000) : 0;
  const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60;
  const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  timerChannel?.postMessage({ type: 'state', time: timeStr, client: cid ? clientName(cid) : 'Sin cliente', running: !!timerInterval });
}

// ── BROADCAST CHANNEL (recibe comandos del popup) ─────────────
function initBroadcastChannel() {
  if (!timerChannel) return;
  timerChannel.onmessage = ({ data }) => {
    if (data.type === 'request-state') { broadcastState(); return; }

    if (data.type === 'cmd-start' && !timerInterval) {
      startTimer();
    }

    if (data.type === 'cmd-stop' && timerInterval) {
      if (data.desc) document.getElementById('timer-desc').value = data.desc;
      const dur = stopTimer();
      if (dur < 1) { toast('El registro debe ser de al menos 1 minuto', 'error'); return; }
      const clientId = document.getElementById('timer-client').value;
      if (!clientId) { toast('Selecciona un cliente en el timer principal', 'error'); return; }
      const entry = {
        id: uid(), userId: currentUser.id, clientId,
        matter:   document.getElementById('timer-matter').value,
        desc:     data.desc || document.getElementById('timer-desc').value.trim(),
        duration: dur, date: todayStr(),
        billable: document.getElementById('timer-billable').checked,
      };
      const entries = DB.entries; entries.push(entry); DB.save('entries', entries);
      document.getElementById('timer-desc').value = '';
      renderTodayEntries();
      toast(`${fmtDuration(dur)}h registradas ✓`, 'success');
    }

    if (data.type === 'cmd-reset') {
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      timerStart = null;
      document.getElementById('timer-display').textContent = '00:00:00';
      document.getElementById('timer-display').classList.remove('running');
      document.getElementById('btn-timer-start').classList.remove('hidden');
      document.getElementById('btn-timer-stop').classList.add('hidden');
      hideMiniTimer();
      document.title = 'TimeFlies — Control de Horas';
    }
  };
}

// ── POPUP FLOTANTE INDEPENDIENTE ──────────────────────────────
function openTimerPopup() {
  if (timerPopupWin && !timerPopupWin.closed) { timerPopupWin.focus(); return; }
  const w = 300, h = 200;
  const left = Math.max(0, window.screen.width  - w - 24);
  const top  = Math.max(0, window.screen.height - h - 80);
  timerPopupWin = window.open(
    'timer-popup.html', 'timeflies_timer',
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no`
  );
  setTimeout(() => broadcastState(), 600);
}

// ── MINI TIMER ────────────────────────────────────────────────
function showMiniTimer() {
  const mini = document.getElementById('mini-timer');
  const cid = document.getElementById('timer-client').value;
  const cname = cid ? clientName(cid) : 'Sin cliente seleccionado';
  document.getElementById('mini-timer-client').textContent = cname;
  const color = cid ? clientColor(cid) : '#9ba3be';
  document.getElementById('mini-timer-dot').style.background = color;
  mini.classList.remove('hidden');
}

function hideMiniTimer() {
  document.getElementById('mini-timer').classList.add('hidden');
}

function initMiniTimerDrag() {
  const mini = document.getElementById('mini-timer');
  const handle = document.getElementById('mini-timer-drag');
  let ox = 0, oy = 0, startX = 0, startY = 0, dragging = false;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    const rect = mini.getBoundingClientRect();
    ox = rect.left; oy = rect.top;
    mini.style.right = 'auto'; mini.style.bottom = 'auto';
    mini.style.left = ox + 'px'; mini.style.top = oy + 'px';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    mini.style.left = Math.max(0, Math.min(window.innerWidth - mini.offsetWidth,  ox + dx)) + 'px';
    mini.style.top  = Math.max(0, Math.min(window.innerHeight - mini.offsetHeight, oy + dy)) + 'px';
  });

  document.addEventListener('mouseup', () => { dragging = false; });

  // Touch support
  handle.addEventListener('touchstart', e => {
    const t = e.touches[0];
    dragging = true; startX = t.clientX; startY = t.clientY;
    const rect = mini.getBoundingClientRect();
    ox = rect.left; oy = rect.top;
    mini.style.right = 'auto'; mini.style.bottom = 'auto';
    mini.style.left = ox + 'px'; mini.style.top = oy + 'px';
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!dragging) return;
    const t = e.touches[0];
    mini.style.left = Math.max(0, Math.min(window.innerWidth - mini.offsetWidth,  ox + (t.clientX - startX))) + 'px';
    mini.style.top  = Math.max(0, Math.min(window.innerHeight - mini.offsetHeight, oy + (t.clientY - startY))) + 'px';
  }, { passive: true });

  document.addEventListener('touchend', () => { dragging = false; });
}

// ── ENTRIES VIEW ─────────────────────────────────────────────
function renderEntriesView() {
  // init date filters
  const from = document.getElementById('filter-date-from');
  const to   = document.getElementById('filter-date-to');
  if (!from.value) { from.value = offsetDate(-30); to.value = todayStr(); }

  populateClientFilter('filter-client');
  applyEntriesFilter();
}

function applyEntriesFilter() {
  const from    = document.getElementById('filter-date-from').value;
  const to      = document.getElementById('filter-date-to').value;
  const clientId = document.getElementById('filter-client').value;

  let entries = DB.entries.filter(e => {
    const inDate   = (!from || e.date >= from) && (!to || e.date <= to);
    const inClient = !clientId || e.clientId === clientId;
    return inDate && inClient;
  }).sort((a,b) => b.date.localeCompare(a.date));

  const tbody = document.getElementById('entries-tbody');
  tbody.innerHTML = '';
  const empty = document.getElementById('entries-empty');

  if (entries.length === 0) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  entries.forEach(e => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(e.date)}</td>
      <td>${userName(e.userId)}</td>
      <td><span style="display:flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:${clientColor(e.clientId)};flex-shrink:0;display:inline-block"></span>
        ${clientName(e.clientId)}
      </span></td>
      <td>${e.matter || '—'}</td>
      <td>${e.desc || '—'}</td>
      <td><strong>${fmtDuration(e.duration)}</strong></td>
      <td><span class="${e.billable ? 'entry-billable-badge' : 'entry-nb-badge'}">${e.billable ? 'Sí' : 'No'}</span></td>
      <td><button class="btn-icon" title="Editar">✏️</button></td>`;
    tr.querySelector('.btn-icon').addEventListener('click', () => openEditEntry(e.id));
    tbody.appendChild(tr);
  });
}

// ── CLIENTS VIEW ─────────────────────────────────────────────
function renderClientsView() {
  const grid = document.getElementById('clients-grid');
  grid.innerHTML = '';
  const clients = DB.clients;

  if (clients.length === 0) {
    grid.innerHTML = `
      <div class="onboarding-empty">
        <div class="onboarding-icon">👥</div>
        <h3>Agrega tu primer cliente</h3>
        <p>Los clientes te permiten organizar tus registros de tiempo y generar reportes de facturación.</p>
        <button class="btn-primary" onclick="openNewClient()">+ Agregar cliente</button>
      </div>`;
    return;
  }

  clients.forEach(c => {
    const entries = DB.entries.filter(e => e.clientId === c.id);
    const totalMins = entries.reduce((s,e) => s + e.duration, 0);
    const billableMins = entries.filter(e => e.billable).reduce((s,e) => s + e.duration, 0);
    const card = document.createElement('div');
    card.className = 'client-card';
    card.innerHTML = `
      <div class="client-card-header">
        <div class="client-avatar" style="background:${c.color}">${initials(c.name)}</div>
        <div>
          <div class="client-card-name">${c.name}</div>
          <div class="client-card-contact">${c.contact || ''}</div>
        </div>
      </div>
      <div class="client-card-stats">
        <div class="client-stat"><strong>${fmtDuration(totalMins)}h</strong>Total</div>
        <div class="client-stat"><strong>${fmtDuration(billableMins)}h</strong>Facturable</div>
        <div class="client-stat"><strong>$${c.rate || 0}/h</strong>Tarifa</div>
      </div>
      ${c.matters?.length ? `<div class="client-matters">${c.matters.map(m => `<span class="matter-tag">${m}</span>`).join('')}</div>` : ''}`;
    card.addEventListener('click', () => openEditClient(c.id));
    grid.appendChild(card);
  });
}

// ── REPORTS ──────────────────────────────────────────────────
function generateReport() {
  const period = document.getElementById('report-period').value;
  const userId = document.getElementById('report-user').value;
  populateUserFilter('report-user', userId);

  let from, to;
  const now = new Date();
  if (period === 'week') {
    const day = now.getDay() || 7;
    const mon = new Date(now); mon.setDate(now.getDate() - day + 1);
    from = mon.toISOString().slice(0,10); to = todayStr();
  } else if (period === 'month') {
    from = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    to = todayStr();
  } else if (period === 'quarter') {
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth()/3)*3, 1);
    from = qStart.toISOString().slice(0,10); to = todayStr();
  } else {
    from = document.getElementById('report-from').value || offsetDate(-30);
    to   = document.getElementById('report-to').value   || todayStr();
  }

  let entries = DB.entries.filter(e =>
    e.date >= from && e.date <= to &&
    (!userId || e.userId === userId)
  );

  reportData = entries;

  // KPIs
  const totalMins   = entries.reduce((s,e) => s + e.duration, 0);
  const billMins    = entries.filter(e => e.billable).reduce((s,e) => s + e.duration, 0);
  const clients     = [...new Set(entries.map(e => e.clientId))];
  const revenue     = entries.filter(e => e.billable).reduce((s,e) => {
    const c = DB.clients.find(c => c.id === e.clientId);
    return s + (e.duration / 60) * (c?.rate || 0);
  }, 0);

  document.getElementById('kpi-grid').innerHTML = `
    <div class="kpi-card accent"><div class="kpi-label">Horas totales</div><div class="kpi-value">${fmtDuration(totalMins)}</div><div class="kpi-sub">horas</div></div>
    <div class="kpi-card"><div class="kpi-label">Horas facturables</div><div class="kpi-value">${fmtDuration(billMins)}</div><div class="kpi-sub">${totalMins ? Math.round(billMins/totalMins*100) : 0}% del total</div></div>
    <div class="kpi-card"><div class="kpi-label">Clientes activos</div><div class="kpi-value">${clients.length}</div><div class="kpi-sub">en el período</div></div>
    <div class="kpi-card"><div class="kpi-label">Ingresos est.</div><div class="kpi-value">$${Math.round(revenue).toLocaleString('es-CL')}</div><div class="kpi-sub">USD facturables</div></div>
    <div class="kpi-card"><div class="kpi-label">Registros</div><div class="kpi-value">${entries.length}</div><div class="kpi-sub">entradas</div></div>`;

  // Chart: by client
  const byClient = {};
  entries.forEach(e => { byClient[e.clientId] = (byClient[e.clientId] || 0) + e.duration; });
  const maxC = Math.max(...Object.values(byClient), 1);
  const chartC = document.getElementById('chart-clients');
  chartC.innerHTML = '';
  Object.entries(byClient).sort((a,b)=>b[1]-a[1]).slice(0,6).forEach(([cid, mins]) => {
    const pct = Math.round(mins/maxC*100);
    const color = clientColor(cid);
    chartC.innerHTML += `<div class="bar-row">
      <div class="bar-label" title="${clientName(cid)}">${clientName(cid)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <div class="bar-val">${fmtDuration(mins)}h</div>
    </div>`;
  });
  if (!Object.keys(byClient).length) chartC.innerHTML = '<div class="empty-state" style="padding:20px">Sin datos</div>';

  // Chart: by day
  const byDay = {};
  entries.forEach(e => { byDay[e.date] = (byDay[e.date] || 0) + e.duration; });
  const days = Object.keys(byDay).sort().slice(-14);
  const maxD = Math.max(...days.map(d => byDay[d]), 1);
  const chartD = document.getElementById('chart-days');
  chartD.innerHTML = '';
  days.forEach(d => {
    const pct = Math.round(byDay[d]/maxD*100);
    chartD.innerHTML += `<div class="bar-row">
      <div class="bar-label">${fmtDate(d)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:var(--primary)"></div></div>
      <div class="bar-val">${fmtDuration(byDay[d])}h</div>
    </div>`;
  });
  if (!days.length) chartD.innerHTML = '<div class="empty-state" style="padding:20px">Sin datos</div>';

  // Report table: by client + matter
  const byClientMatter = {};
  entries.forEach(e => {
    const key = `${e.clientId}__${e.matter || ''}`;
    if (!byClientMatter[key]) byClientMatter[key] = { clientId: e.clientId, matter: e.matter, totalMins: 0, billMins: 0 };
    byClientMatter[key].totalMins += e.duration;
    if (e.billable) byClientMatter[key].billMins += e.duration;
  });
  const tbody = document.getElementById('report-tbody');
  tbody.innerHTML = '';
  Object.values(byClientMatter).sort((a,b) => b.totalMins - a.totalMins).forEach(row => {
    const c    = DB.clients.find(c => c.id === row.clientId);
    const rate = c?.rate || 0;
    const total = (row.billMins / 60) * rate;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span style="display:flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:${clientColor(row.clientId)};display:inline-block"></span>
        ${clientName(row.clientId)}
      </span></td>
      <td>${row.matter || '—'}</td>
      <td><strong>${fmtDuration(row.totalMins)}h</strong></td>
      <td>${fmtDuration(row.billMins)}h</td>
      <td>$${rate}/h</td>
      <td><strong>$${Math.round(total).toLocaleString('es-CL')}</strong></td>`;
    tbody.appendChild(tr);
  });
}

// ── MODALS ───────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function openNewClient() {
  editingClientId = null;
  tempMatters = [];
  document.getElementById('modal-client-title').textContent = 'Nuevo Cliente';
  ['client-name','client-contact','client-email','client-rate'].forEach(id => document.getElementById(id).value = '');
  renderTempMatters();
  openModal('modal-client');
}

function openEditClient(id) {
  editingClientId = id;
  const c = DB.clients.find(c => c.id === id);
  if (!c) return;
  document.getElementById('modal-client-title').textContent = 'Editar Cliente';
  document.getElementById('client-name').value    = c.name;
  document.getElementById('client-contact').value = c.contact || '';
  document.getElementById('client-email').value   = c.email || '';
  document.getElementById('client-rate').value    = c.rate || '';
  tempMatters = [...(c.matters || [])];
  renderTempMatters();
  openModal('modal-client');
}

function saveClient() {
  const name = document.getElementById('client-name').value.trim();
  if (!name) { toast('El nombre es requerido', 'error'); return; }
  const clients = DB.clients;
  const data = {
    name,
    contact: document.getElementById('client-contact').value.trim(),
    email:   document.getElementById('client-email').value.trim(),
    rate:    parseFloat(document.getElementById('client-rate').value) || 0,
    matters: [...tempMatters],
    color:   COLORS[clients.length % COLORS.length],
  };
  if (editingClientId) {
    const idx = clients.findIndex(c => c.id === editingClientId);
    clients[idx] = { ...clients[idx], ...data };
  } else {
    clients.push({ id: uid(), ...data });
  }
  DB.save('clients', clients);
  closeModal('modal-client');
  renderClientsView();
  toast('Cliente guardado ✓', 'success');
}

function renderTempMatters() {
  const list = document.getElementById('matters-list');
  list.innerHTML = '';
  tempMatters.forEach((m, i) => {
    const div = document.createElement('div');
    div.className = 'matter-item';
    div.innerHTML = `<span>${m}</span><button class="btn-icon" data-i="${i}">🗑</button>`;
    div.querySelector('.btn-icon').addEventListener('click', () => { tempMatters.splice(i,1); renderTempMatters(); });
    list.appendChild(div);
  });
}

function openManualEntry() {
  document.getElementById('manual-date').value = todayStr();
  document.getElementById('manual-duration').value = '';
  document.getElementById('manual-desc').value = '';
  document.getElementById('manual-billable').checked = true;
  populateClientSelect('manual-client', 'manual-matter', '— Seleccionar cliente —');
  openModal('modal-manual');
}

function saveManualEntry() {
  const dur = parseDuration(document.getElementById('manual-duration').value);
  if (!dur) { toast('Ingrese una duración válida (ej: 1:30)', 'error'); return; }
  const clientId = document.getElementById('manual-client').value;
  if (!clientId) { toast('Seleccione un cliente', 'error'); return; }
  const entry = {
    id: uid(),
    userId:   currentUser.id,
    clientId,
    matter:   document.getElementById('manual-matter').value,
    desc:     document.getElementById('manual-desc').value.trim(),
    duration: dur,
    date:     document.getElementById('manual-date').value,
    billable: document.getElementById('manual-billable').checked,
  };
  const entries = DB.entries;
  entries.push(entry);
  DB.save('entries', entries);
  closeModal('modal-manual');
  renderTodayEntries();
  toast('Registro guardado ✓', 'success');
}

function openEditEntry(id) {
  const e = DB.entries.find(e => e.id === id);
  if (!e) return;
  document.getElementById('edit-entry-id').value      = e.id;
  document.getElementById('edit-date').value          = e.date;
  document.getElementById('edit-duration').value      = fmtDuration(e.duration);
  document.getElementById('edit-desc').value          = e.desc || '';
  document.getElementById('edit-billable').checked    = e.billable;
  populateClientSelect('edit-client', 'edit-matter', '— Sin cliente —');
  document.getElementById('edit-client').value = e.clientId;
  updateMatterSelect('edit-client', 'edit-matter');
  document.getElementById('edit-matter').value = e.matter || '';
  openModal('modal-edit-entry');
}

function updateEntry() {
  const id  = document.getElementById('edit-entry-id').value;
  const dur = parseDuration(document.getElementById('edit-duration').value);
  if (!dur) { toast('Duración inválida', 'error'); return; }
  const entries = DB.entries;
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return;
  entries[idx] = {
    ...entries[idx],
    clientId: document.getElementById('edit-client').value,
    matter:   document.getElementById('edit-matter').value,
    desc:     document.getElementById('edit-desc').value.trim(),
    duration: dur,
    date:     document.getElementById('edit-date').value,
    billable: document.getElementById('edit-billable').checked,
  };
  DB.save('entries', entries);
  closeModal('modal-edit-entry');
  renderTodayEntries();
  applyEntriesFilter();
  toast('Registro actualizado ✓', 'success');
}

function deleteEntry() {
  const id = document.getElementById('edit-entry-id').value;
  const entries = DB.entries.filter(e => e.id !== id);
  DB.save('entries', entries);
  closeModal('modal-edit-entry');
  renderTodayEntries();
  applyEntriesFilter();
  toast('Registro eliminado');
}

// ── SELECT HELPERS ────────────────────────────────────────────
function populateClientSelect(clientSelId, matterSelId, placeholder) {
  const sel = document.getElementById(clientSelId);
  const prev = sel.value;
  sel.innerHTML = `<option value="">${placeholder}</option>`;
  DB.clients.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.name;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
  updateMatterSelect(clientSelId, matterSelId);
  sel.onchange = () => updateMatterSelect(clientSelId, matterSelId);
}

function updateMatterSelect(clientSelId, matterSelId) {
  const cid = document.getElementById(clientSelId).value;
  const sel = document.getElementById(matterSelId);
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Asunto / Expediente —</option>';
  if (cid) {
    const c = DB.clients.find(c => c.id === cid);
    (c?.matters || []).forEach(m => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m;
      sel.appendChild(opt);
    });
  }
  if (prev) sel.value = prev;
}

function populateClientFilter(selId) {
  const sel = document.getElementById(selId);
  const prev = sel.value;
  sel.innerHTML = '<option value="">Todos los clientes</option>';
  DB.clients.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.name;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
}

function populateUserFilter(selId, currentVal) {
  const sel = document.getElementById(selId);
  sel.innerHTML = '<option value="">Todos los usuarios</option>';
  DB.users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id; opt.textContent = u.name;
    sel.appendChild(opt);
  });
  if (currentVal) sel.value = currentVal;
}

// ── COLOR PICKER ─────────────────────────────────────────────
function renderColorPicker() {
  const picker = document.getElementById('user-color-picker');
  picker.innerHTML = '';
  COLORS.forEach((c, i) => {
    const s = document.createElement('div');
    s.className = 'color-swatch' + (i === 0 ? ' selected' : '');
    s.style.background = c;
    s.dataset.color = c;
    s.addEventListener('click', () => {
      picker.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('selected'));
      s.classList.add('selected');
    });
    picker.appendChild(s);
  });
}

// ── NEW USER ─────────────────────────────────────────────────
function saveNewUser() {
  const name = document.getElementById('new-user-name').value.trim();
  if (!name) { toast('El nombre es requerido', 'error'); return; }
  const color = document.querySelector('#user-color-picker .color-swatch.selected')?.dataset.color || COLORS[0];
  const user = {
    id:   uid(),
    name,
    role: document.getElementById('new-user-role').value.trim() || 'Abogado/a',
    rate: parseFloat(document.getElementById('new-user-rate').value) || 0,
    color,
  };
  const users = DB.users;
  users.push(user);
  DB.save('users', users);
  closeModal('modal-user');
  renderLoginScreen();
  toast('Usuario creado ✓', 'success');
}

// ── PDF EXPORT ────────────────────────────────────────────────
function exportPDF() {
  if (!reportData.length) { toast('Genera un reporte primero', 'error'); return; }

  const periodLabel = document.getElementById('report-period').options[document.getElementById('report-period').selectedIndex].text;
  const userFilter  = document.getElementById('report-user');
  const userLabel   = userFilter.value ? userFilter.options[userFilter.selectedIndex].text : 'Todos los usuarios';

  // Agrupa por cliente+asunto
  const grouped = {};
  reportData.forEach(e => {
    const key = `${e.clientId}__${e.matter || ''}`;
    if (!grouped[key]) grouped[key] = { clientId: e.clientId, matter: e.matter, totalMins: 0, billMins: 0, entries: [] };
    grouped[key].totalMins += e.duration;
    if (e.billable) grouped[key].billMins += e.duration;
    grouped[key].entries.push(e);
  });

  const totalMins  = reportData.reduce((s,e) => s+e.duration, 0);
  const billMins   = reportData.filter(e=>e.billable).reduce((s,e)=>s+e.duration, 0);
  const revenue    = reportData.filter(e=>e.billable).reduce((s,e)=>{
    const c = DB.clients.find(c=>c.id===e.clientId);
    return s + (e.duration/60)*(c?.rate||0);
  }, 0);

  const html = `
  <!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <style>
    @page { margin: 18mm 15mm; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1d2e; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #4f6ef7; padding-bottom:12px; margin-bottom:16px; }
    .logo { font-size:20px; font-weight:700; color:#4f6ef7; }
    .meta { text-align:right; color:#5a607a; font-size:10px; }
    .kpis { display:flex; gap:16px; margin-bottom:20px; }
    .kpi { flex:1; background:#f5f6fa; border-radius:8px; padding:10px 14px; }
    .kpi-label { font-size:9px; text-transform:uppercase; letter-spacing:.5px; color:#9ba3be; font-weight:600; }
    .kpi-value { font-size:20px; font-weight:700; color:#1a1d2e; margin-top:2px; }
    .kpi-accent { background:#4f6ef7; }
    .kpi-accent .kpi-label, .kpi-accent .kpi-value { color:#fff; }
    h3 { font-size:12px; color:#5a607a; text-transform:uppercase; letter-spacing:.5px; margin:16px 0 8px; border-top:1px solid #e2e5f1; padding-top:12px; }
    table { width:100%; border-collapse:collapse; font-size:10px; }
    th { background:#f5f6fa; padding:8px 10px; text-align:left; font-size:9px; text-transform:uppercase; letter-spacing:.4px; color:#9ba3be; border-bottom:1px solid #e2e5f1; }
    td { padding:8px 10px; border-bottom:1px solid #f0f2f8; vertical-align:top; }
    tr:last-child td { border-bottom:none; }
    .badge { display:inline-block; padding:2px 7px; border-radius:20px; font-size:9px; font-weight:600; }
    .badge-yes { background:#eef1fe; color:#4f6ef7; }
    .badge-no  { background:#f0f0f0; color:#9ba3be; }
    .total-row td { font-weight:700; background:#f5f6fa; }
    .footer { margin-top:24px; text-align:center; font-size:9px; color:#9ba3be; border-top:1px solid #e2e5f1; padding-top:10px; }
  </style></head><body>
  <div class="header">
    <div>
      <div class="logo">⏱ TimeFlies</div>
      <div style="font-size:10px;color:#9ba3be;margin-top:3px">Reporte de horas trabajadas</div>
    </div>
    <div class="meta">
      <div><strong>Período:</strong> ${periodLabel}</div>
      <div><strong>Usuario:</strong> ${userLabel}</div>
      <div><strong>Generado:</strong> ${new Date().toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'})}</div>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi kpi-accent"><div class="kpi-label">Horas totales</div><div class="kpi-value">${fmtDuration(totalMins)}h</div></div>
    <div class="kpi"><div class="kpi-label">Horas facturables</div><div class="kpi-value">${fmtDuration(billMins)}h</div></div>
    <div class="kpi"><div class="kpi-label">Clientes activos</div><div class="kpi-value">${[...new Set(reportData.map(e=>e.clientId))].length}</div></div>
    <div class="kpi"><div class="kpi-label">Ingresos estimados</div><div class="kpi-value">$${Math.round(revenue).toLocaleString('es-CL')}</div></div>
  </div>

  <h3>Detalle por cliente y asunto</h3>
  <table>
    <thead><tr><th>Cliente</th><th>Asunto</th><th>Horas total</th><th>Facturable</th><th>Tarifa</th><th>Total USD</th></tr></thead>
    <tbody>
    ${Object.values(grouped).sort((a,b)=>b.totalMins-a.totalMins).map(row=>{
      const c = DB.clients.find(c=>c.id===row.clientId);
      const rate = c?.rate||0;
      const total = (row.billMins/60)*rate;
      return `<tr>
        <td><strong>${clientName(row.clientId)}</strong></td>
        <td>${row.matter||'—'}</td>
        <td><strong>${fmtDuration(row.totalMins)}h</strong></td>
        <td>${fmtDuration(row.billMins)}h</td>
        <td>$${rate}/h</td>
        <td><strong>$${Math.round(total).toLocaleString('es-CL')}</strong></td>
      </tr>`;
    }).join('')}
    <tr class="total-row">
      <td colspan="2">TOTAL</td>
      <td>${fmtDuration(totalMins)}h</td>
      <td>${fmtDuration(billMins)}h</td>
      <td>—</td>
      <td>$${Math.round(revenue).toLocaleString('es-CL')}</td>
    </tr>
    </tbody>
  </table>

  <h3>Registro detallado</h3>
  <table>
    <thead><tr><th>Fecha</th><th>Usuario</th><th>Cliente</th><th>Asunto</th><th>Descripción</th><th>Duración</th><th>Fact.</th></tr></thead>
    <tbody>
    ${reportData.sort((a,b)=>a.date.localeCompare(b.date)).map(e=>`<tr>
      <td>${fmtDate(e.date)}</td>
      <td>${userName(e.userId)}</td>
      <td>${clientName(e.clientId)}</td>
      <td>${e.matter||'—'}</td>
      <td>${e.desc||'—'}</td>
      <td>${fmtDuration(e.duration)}h</td>
      <td><span class="badge ${e.billable?'badge-yes':'badge-no'}">${e.billable?'Sí':'No'}</span></td>
    </tr>`).join('')}
    </tbody>
  </table>

  <div class="footer">TimeFlies — Generado el ${new Date().toLocaleDateString('es-CL')} — Documento confidencial</div>
  </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
  toast('PDF abierto para imprimir ✓', 'success');
}

// ── WORD EXPORT ───────────────────────────────────────────────
function exportWord() {
  if (!reportData.length) { toast('Genera un reporte primero', 'error'); return; }

  const periodLabel = document.getElementById('report-period').options[document.getElementById('report-period').selectedIndex].text;
  const userFilter  = document.getElementById('report-user');
  const userLabel   = userFilter.value ? userFilter.options[userFilter.selectedIndex].text : 'Todos los usuarios';

  const totalMins = reportData.reduce((s,e)=>s+e.duration,0);
  const billMins  = reportData.filter(e=>e.billable).reduce((s,e)=>s+e.duration,0);
  const revenue   = reportData.filter(e=>e.billable).reduce((s,e)=>{
    const c = DB.clients.find(c=>c.id===e.clientId);
    return s + (e.duration/60)*(c?.rate||0);
  }, 0);

  const grouped = {};
  reportData.forEach(e => {
    const key = `${e.clientId}__${e.matter||''}`;
    if (!grouped[key]) grouped[key] = { clientId: e.clientId, matter: e.matter, totalMins: 0, billMins: 0 };
    grouped[key].totalMins += e.duration;
    if (e.billable) grouped[key].billMins += e.duration;
  });

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:w="urn:schemas-microsoft-com:office:word"
    xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="UTF-8"/>
  <xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml>
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1a1d2e; margin: 2cm; }
    h1 { font-size: 18pt; color: #4f6ef7; border-bottom: 2pt solid #4f6ef7; padding-bottom: 6pt; }
    h2 { font-size: 12pt; color: #5a607a; margin-top: 18pt; border-bottom: 1pt solid #e2e5f1; padding-bottom: 4pt; }
    p  { margin: 3pt 0; font-size: 10pt; color: #5a607a; }
    .kpi-row { display: flex; gap: 16pt; margin: 12pt 0; }
    .kpi { flex: 1; background: #f5f6fa; padding: 8pt 12pt; border-radius: 6pt; }
    .kpi b { font-size: 18pt; display: block; color: #1a1d2e; }
    .kpi span { font-size: 8pt; text-transform: uppercase; color: #9ba3be; letter-spacing: .5pt; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 8pt; }
    th { background: #4f6ef7; color: white; padding: 7pt 10pt; text-align: left; font-size: 9pt; }
    td { padding: 6pt 10pt; border-bottom: 1pt solid #e2e5f1; }
    .total-row td { font-weight: bold; background: #f5f6fa; }
    .footer { margin-top: 24pt; text-align: center; font-size: 8pt; color: #9ba3be; border-top: 1pt solid #e2e5f1; padding-top: 8pt; }
  </style></head><body>

  <h1>⏱ TimeFlies — Reporte de Horas</h1>
  <p><b>Período:</b> ${periodLabel} &nbsp;&nbsp; <b>Usuario:</b> ${userLabel} &nbsp;&nbsp; <b>Fecha:</b> ${new Date().toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'})}</p>

  <div class="kpi-row">
    <div class="kpi"><span>Horas totales</span><b>${fmtDuration(totalMins)}h</b></div>
    <div class="kpi"><span>Horas facturables</span><b>${fmtDuration(billMins)}h</b></div>
    <div class="kpi"><span>Clientes activos</span><b>${[...new Set(reportData.map(e=>e.clientId))].length}</b></div>
    <div class="kpi"><span>Ingresos estimados</span><b>$${Math.round(revenue).toLocaleString('es-CL')}</b></div>
  </div>

  <h2>Resumen por cliente y asunto</h2>
  <table>
    <thead><tr><th>Cliente</th><th>Asunto</th><th>Horas total</th><th>Horas fact.</th><th>Tarifa</th><th>Total USD</th></tr></thead>
    <tbody>
    ${Object.values(grouped).sort((a,b)=>b.totalMins-a.totalMins).map(row=>{
      const c = DB.clients.find(c=>c.id===row.clientId);
      const rate = c?.rate||0;
      return `<tr>
        <td><b>${clientName(row.clientId)}</b></td>
        <td>${row.matter||'—'}</td>
        <td>${fmtDuration(row.totalMins)}h</td>
        <td>${fmtDuration(row.billMins)}h</td>
        <td>$${rate}/h</td>
        <td><b>$${Math.round((row.billMins/60)*rate).toLocaleString('es-CL')}</b></td>
      </tr>`;
    }).join('')}
    <tr class="total-row"><td colspan="2">TOTAL</td><td>${fmtDuration(totalMins)}h</td><td>${fmtDuration(billMins)}h</td><td>—</td><td>$${Math.round(revenue).toLocaleString('es-CL')}</td></tr>
    </tbody>
  </table>

  <h2>Registro detallado</h2>
  <table>
    <thead><tr><th>Fecha</th><th>Usuario</th><th>Cliente</th><th>Asunto</th><th>Descripción</th><th>Duración</th><th>Facturable</th></tr></thead>
    <tbody>
    ${reportData.sort((a,b)=>a.date.localeCompare(b.date)).map(e=>`<tr>
      <td>${fmtDate(e.date)}</td>
      <td>${userName(e.userId)}</td>
      <td>${clientName(e.clientId)}</td>
      <td>${e.matter||'—'}</td>
      <td>${e.desc||'—'}</td>
      <td>${fmtDuration(e.duration)}h</td>
      <td>${e.billable?'Sí':'No'}</td>
    </tr>`).join('')}
    </tbody>
  </table>

  <div class="footer">TimeFlies · Generado el ${new Date().toLocaleDateString('es-CL')} · Documento confidencial</div>
  </body></html>`;

  const blob = new Blob(['﻿' + html], { type: 'application/msword;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `reporte_timeflies_${todayStr()}.doc`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Word descargado ✓', 'success');
}

// ── CSV EXPORT ────────────────────────────────────────────────
function exportCSV() {
  if (!reportData.length) { toast('Genera un reporte primero', 'error'); return; }
  const header = ['Fecha','Usuario','Cliente','Asunto','Descripción','Duración (min)','Facturable'];
  const rows = reportData.map(e => [
    e.date, userName(e.userId), clientName(e.clientId),
    e.matter || '', (e.desc || '').replace(/,/g,' '), e.duration, e.billable ? 'Sí' : 'No'
  ]);
  const csv = [header, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `reporte_timeflies_${todayStr()}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast('CSV descargado ✓', 'success');
}

// ── GLOBAL EVENTS ─────────────────────────────────────────────
function bindGlobalEvents() {
  // Nav
  document.querySelectorAll('.nav-item').forEach(el =>
    el.addEventListener('click', e => { e.preventDefault(); switchView(el.dataset.view); })
  );

  // Logout
  document.getElementById('btn-logout').addEventListener('click', () => {
    currentUser = null;
    stopTimer();
    document.getElementById('app-screen').classList.remove('active');
    document.getElementById('login-screen').classList.add('active');
  });

  // Timer
  document.getElementById('btn-timer-start').addEventListener('click', () => startTimer());
  document.getElementById('btn-timer-stop').addEventListener('click', () => {
    const dur = stopTimer();
    if (dur < 1) { toast('El registro debe ser de al menos 1 minuto', 'error'); return; }
    const clientId = document.getElementById('timer-client').value;
    if (!clientId) { toast('Selecciona un cliente antes de guardar', 'error'); return; }
    const entry = {
      id: uid(), userId: currentUser.id, clientId,
      matter:   document.getElementById('timer-matter').value,
      desc:     document.getElementById('timer-desc').value.trim(),
      duration: dur, date: todayStr(),
      billable: document.getElementById('timer-billable').checked,
    };
    const entries = DB.entries; entries.push(entry); DB.save('entries', entries);
    document.getElementById('timer-desc').value = '';
    renderTodayEntries();
    toast(`${fmtDuration(dur)}h registradas ✓`, 'success');
  });

  // Mini timer
  document.getElementById('mini-btn-expand').addEventListener('click', () => {
    switchView('dashboard');
    document.querySelectorAll('.nav-item').forEach(el =>
      el.classList.toggle('active', el.dataset.view === 'dashboard'));
  });
  document.getElementById('mini-btn-stop').addEventListener('click', () => {
    const dur = stopTimer();
    if (dur < 1) { toast('El registro debe ser de al menos 1 minuto', 'error'); return; }
    const clientId = document.getElementById('timer-client').value;
    if (!clientId) { toast('Selecciona un cliente antes de guardar', 'error'); return; }
    const entry = {
      id: uid(), userId: currentUser.id, clientId,
      matter:   document.getElementById('timer-matter').value,
      desc:     document.getElementById('timer-desc').value.trim(),
      duration: dur, date: todayStr(),
      billable: document.getElementById('timer-billable').checked,
    };
    const entries = DB.entries; entries.push(entry); DB.save('entries', entries);
    document.getElementById('timer-desc').value = '';
    renderTodayEntries();
    toast(`${fmtDuration(dur)}h registradas ✓`, 'success');
  });

  // Manual entry
  document.getElementById('btn-manual-entry').addEventListener('click', openManualEntry);
  document.getElementById('btn-save-manual').addEventListener('click', saveManualEntry);

  // Edit entry
  document.getElementById('btn-update-entry').addEventListener('click', updateEntry);
  document.getElementById('btn-delete-entry').addEventListener('click', deleteEntry);

  // Clients
  document.getElementById('btn-new-client').addEventListener('click', openNewClient);
  document.getElementById('btn-save-client').addEventListener('click', saveClient);
  document.getElementById('btn-add-matter').addEventListener('click', () => {
    const inp = document.getElementById('new-matter-input');
    const val = inp.value.trim();
    if (val) { tempMatters.push(val); inp.value = ''; renderTempMatters(); }
  });
  document.getElementById('new-matter-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-add-matter').click();
  });

  document.getElementById('btn-save-user').addEventListener('click', saveNewUser);

  // Entries filter
  document.getElementById('btn-apply-filter').addEventListener('click', applyEntriesFilter);

  // Reports
  document.getElementById('btn-open-popup').addEventListener('click', openTimerPopup);
  document.getElementById('btn-generate-report').addEventListener('click', generateReport);
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
  document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);
  document.getElementById('btn-export-word').addEventListener('click', exportWord);
  document.getElementById('report-period').addEventListener('change', function() {
    const custom = this.value === 'custom';
    document.getElementById('report-from').classList.toggle('hidden', !custom);
    document.getElementById('report-to').classList.toggle('hidden', !custom);
  });

  // Close modals via data-close
  document.querySelectorAll('[data-close]').forEach(btn =>
    btn.addEventListener('click', () => closeModal(btn.dataset.close))
  );
  document.querySelectorAll('.modal-overlay').forEach(overlay =>
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); })
  );
}
