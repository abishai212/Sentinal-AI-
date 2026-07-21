/* ─── Admin Dashboard JavaScript ─────────────────────────────────────────── */

// ─── State ──────────────────────────────────────────────────────────────────
let allExperts  = [];
let allRequests = [];
let allMessages = [];
let currentPage = 'dashboard';

// ─── Navigation ─────────────────────────────────────────────────────────────
const navItems = document.querySelectorAll('.nav-item');
const pages    = document.querySelectorAll('.page');

const pageMeta = {
  dashboard: { title: 'Admin Dashboard',   sub: 'System overview and real-time statistics' },
  experts:   { title: 'Expert Management', sub: 'Approve, reject, or remove registered experts' },
  requests:  { title: 'Request Management',sub: 'Resolve, delete, or inspect customer requests' },
  messages:  { title: 'Chat Monitor',      sub: 'Full visibility into all platform conversations' }
};

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const target = item.dataset.page;
    if (!target) return;
    navigateTo(target);
  });
});

function navigateTo(target) {
  currentPage = target;

  // Update sidebar
  navItems.forEach(n => n.classList.toggle('active', n.dataset.page === target));

  // Show/hide pages
  pages.forEach(p => {
    p.classList.toggle('active', p.id === `page-${target}`);
  });

  // Update topbar title
  const meta = pageMeta[target];
  if (meta) {
    document.getElementById('page-title').textContent = meta.title;
    document.getElementById('page-sub').textContent   = meta.sub;
  }

  // Load data for target page
  if (target === 'dashboard') loadDashboard();
  else if (target === 'experts')  renderExpertsTable();
  else if (target === 'requests') renderRequestsTable();
  else if (target === 'messages') renderMessagesFeed();
}

// ─── Refresh Button ──────────────────────────────────────────────────────────
const refreshBtn = document.getElementById('refreshBtn');
refreshBtn.addEventListener('click', () => {
  refreshBtn.classList.add('spinning');
  fetchAll().finally(() => {
    setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
    toast('Data refreshed', 'success');
  });
});

// ─── Toast Notifications ─────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${type === 'success' ? '✅' : '❌'}</span> ${msg}`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── API Fetch Helpers ───────────────────────────────────────────────────────
async function apiFetch(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

async function fetchAll() {
  try {
    const [statsRes, expRes, reqRes, msgRes] = await Promise.all([
      apiFetch('/admin/stats'),
      apiFetch('/admin/experts'),
      apiFetch('/admin/requests'),
      apiFetch('/admin/messages')
    ]);

    if (statsRes.success) updateStatCards(statsRes.stats, reqRes.requests || []);
    allExperts  = expRes.success  ? expRes.experts   : [];
    allRequests = reqRes.success  ? reqRes.requests  : [];
    allMessages = msgRes.success  ? msgRes.messages  : [];

    // Update count badges
    document.getElementById('exp-count').textContent  = allExperts.length;
    document.getElementById('req-count').textContent  = allRequests.length;
    document.getElementById('msg-count').textContent  = allMessages.length;

    // Refresh whichever page is active
    if (currentPage === 'dashboard') loadDashboard();
    else if (currentPage === 'experts')  renderExpertsTable();
    else if (currentPage === 'requests') renderRequestsTable();
    else if (currentPage === 'messages') renderMessagesFeed();

  } catch (err) {
    toast('Could not reach backend. Is MongoDB running?', 'error');
    showDbOfflineState();
  }
}

function showDbOfflineState() {
  const msg = `<tr><td colspan="10" style="text-align:center;padding:50px;color:#6b7280;">
    ⚠️ MongoDB not connected. Start your database to see live data.
  </td></tr>`;
  ['dash-recent-body','dash-experts-body','experts-body','requests-body'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = msg;
  });
  const feed = document.getElementById('messages-feed');
  if (feed) feed.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>MongoDB not connected. Start your database to see live data.</p></div>`;

  ['stat-experts','stat-requests','stat-messages','stat-pending',
   'dash-req-count','dash-exp-count','exp-count','req-count','msg-count'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });
}

// ─── Stat Cards ──────────────────────────────────────────────────────────────
function updateStatCards(stats, requests) {
  document.getElementById('stat-experts').textContent  = stats.experts  ?? 0;
  document.getElementById('stat-requests').textContent = stats.requests ?? 0;
  document.getElementById('stat-messages').textContent = stats.messages ?? 0;
  const pending = Array.isArray(requests) ? requests.filter(r => r.status === 'pending').length : 0;
  document.getElementById('stat-pending').textContent  = pending;
}

// ─── Dashboard Page ──────────────────────────────────────────────────────────
function loadDashboard() {
  // Recent requests (latest 5)
  const reqBody  = document.getElementById('dash-recent-body');
  const reqCount = document.getElementById('dash-req-count');
  reqCount.textContent = allRequests.length;

  if (allRequests.length === 0) {
    reqBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:#6b7280;">No requests yet.</td></tr>`;
  } else {
    reqBody.innerHTML = allRequests.slice(0, 5).map(r => `
      <tr>
        <td class="td-problem">${escHtml(r.problem)}</td>
        <td>${escHtml(r.type || '—')}</td>
        <td>${severityBadge(r.severity)}</td>
        <td>${statusBadge(r.status)}</td>
        <td style="color:#6b7280;font-size:0.82rem;">${fmtDate(r.createdAt)}</td>
      </tr>
    `).join('');
  }

  // Recent experts (latest 5)
  const expBody  = document.getElementById('dash-experts-body');
  const expCount = document.getElementById('dash-exp-count');
  expCount.textContent = allExperts.length;

  if (allExperts.length === 0) {
    expBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:#6b7280;">No experts registered yet.</td></tr>`;
  } else {
    expBody.innerHTML = allExperts.slice(0, 5).map(e => `
      <tr>
        <td class="td-name">${escHtml(e.name)}</td>
        <td>${escHtml(e.skill)}</td>
        <td style="color:#9ca3af;">${escHtml(e.location || '—')}</td>
        <td>${e.isOnline ? '<span class="status-badge badge-online">Online</span>' : '<span class="status-badge badge-offline">Offline</span>'}</td>
        <td>${e.isApproved ? '<span class="status-badge badge-approved">Approved</span>' : '<span class="status-badge badge-rejected">Rejected</span>'}</td>
      </tr>
    `).join('');
  }
}

// ─── Experts Table ───────────────────────────────────────────────────────────
function renderExpertsTable() {
  const tbody = document.getElementById('experts-body');
  document.getElementById('exp-count').textContent = allExperts.length;

  if (allExperts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="empty-icon">👥</div><p>No experts registered yet.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = allExperts.map((e, i) => `
    <tr id="exp-row-${e._id}">
      <td style="color:#6b7280;">${i + 1}</td>
      <td class="td-name">${escHtml(e.name)}</td>
      <td class="td-mono">${escHtml(e.email)}</td>
      <td class="td-mono">${escHtml(e.mobile)}</td>
      <td>
        <span class="status-badge" style="background:rgba(99,102,241,0.1);color:#818cf8;border:1px solid rgba(99,102,241,0.25);">
          ${escHtml(e.skill)}
        </span>
      </td>
      <td style="text-align:center;">${e.experience ?? '—'}yr</td>
      <td style="color:#9ca3af;">${escHtml(e.location || '—')}</td>
      <td>${e.isOnline ? '<span class="status-badge badge-online">Online</span>' : '<span class="status-badge badge-offline">Offline</span>'}</td>
      <td id="exp-approved-${e._id}">
        ${e.isApproved
          ? '<span class="status-badge badge-approved">Approved</span>'
          : '<span class="status-badge badge-rejected">Rejected</span>'}
      </td>
      <td>
        <div class="actions">
          <button class="act-btn ${e.isApproved ? 'btn-reject' : 'btn-approve'}"
            id="exp-toggle-${e._id}"
            onclick="toggleApproveExpert('${e._id}', ${e.isApproved})">
            ${e.isApproved ? 'Revoke' : 'Approve'}
          </button>
          <button class="act-btn btn-delete" onclick="deleteExpert('${e._id}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function toggleApproveExpert(id, currentApproved) {
  try {
    const res = await apiFetch(`/admin/expert/${id}/approve`, 'POST');
    if (res.success) {
      const idx = allExperts.findIndex(e => e._id === id);
      if (idx !== -1) allExperts[idx].isApproved = res.expert.isApproved;
      renderExpertsTable();
      toast(`Expert ${res.expert.isApproved ? 'approved' : 'rejected'} successfully`, 'success');
    }
  } catch (err) { toast('Action failed', 'error'); }
}

async function deleteExpert(id) {
  if (!confirm('Delete this expert? This cannot be undone.')) return;
  try {
    const res = await apiFetch(`/admin/expert/${id}`, 'DELETE');
    if (res.success) {
      allExperts = allExperts.filter(e => e._id !== id);
      document.getElementById('exp-count').textContent = allExperts.length;
      document.getElementById('stat-experts').textContent = allExperts.length;
      renderExpertsTable();
      toast('Expert removed', 'success');
    }
  } catch (err) { toast('Delete failed', 'error'); }
}

// ─── Requests Table ──────────────────────────────────────────────────────────
function renderRequestsTable() {
  const tbody = document.getElementById('requests-body');
  document.getElementById('req-count').textContent = allRequests.length;

  if (allRequests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📋</div><p>No requests submitted yet.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = allRequests.map((r, i) => `
    <tr id="req-row-${r._id}">
      <td style="color:#6b7280;">${i + 1}</td>
      <td class="td-problem" title="${escHtml(r.problem)}">${escHtml(r.problem)}</td>
      <td>
        <span class="status-badge" style="background:rgba(255,255,255,0.05);color:#9ca3af;border:1px solid rgba(255,255,255,0.1);">
          ${escHtml(r.type || 'Unknown')}
        </span>
      </td>
      <td>${severityBadge(r.severity)}</td>
      <td>${r.expertId ? `<span style="color:#818cf8;font-weight:600;">${escHtml(r.expertId.name)}</span><br><span style="font-size:0.75rem;color:#6b7280;">${escHtml(r.expertId.skill)}</span>` : '<span style="color:#6b7280;">Unassigned</span>'}</td>
      <td style="color:#9ca3af;">${escHtml(r.customPrice || r.costEstimate || '—')}</td>
      <td id="req-status-${r._id}">${statusBadge(r.status)}</td>
      <td style="color:#6b7280;font-size:0.82rem;white-space:nowrap;">${fmtDate(r.createdAt)}</td>
      <td>
        <div class="actions">
          ${r.status !== 'resolved' ? `<button class="act-btn btn-resolve" onclick="resolveRequest('${r._id}')">Resolve</button>` : ''}
          <button class="act-btn btn-delete" onclick="deleteRequest('${r._id}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function resolveRequest(id) {
  try {
    const res = await apiFetch(`/admin/request/${id}/resolve`, 'POST');
    if (res.success) {
      const idx = allRequests.findIndex(r => r._id === id);
      if (idx !== -1) allRequests[idx].status = 'resolved';
      renderRequestsTable();
      // Update dashboard pending count
      document.getElementById('stat-pending').textContent =
        allRequests.filter(r => r.status === 'pending').length;
      toast('Request marked as resolved', 'success');
    }
  } catch (err) { toast('Action failed', 'error'); }
}

async function deleteRequest(id) {
  if (!confirm('Delete this request and all associated messages?')) return;
  try {
    const res = await apiFetch(`/admin/request/${id}`, 'DELETE');
    if (res.success) {
      allRequests = allRequests.filter(r => r._id !== id);
      allMessages = allMessages.filter(m => m.requestId?._id !== id && m.requestId !== id);
      document.getElementById('req-count').textContent = allRequests.length;
      document.getElementById('stat-requests').textContent = allRequests.length;
      renderRequestsTable();
      toast('Request deleted', 'success');
    }
  } catch (err) { toast('Delete failed', 'error'); }
}

// ─── Messages Feed ───────────────────────────────────────────────────────────
function renderMessagesFeed() {
  const feed = document.getElementById('messages-feed');
  document.getElementById('msg-count').textContent = allMessages.length;

  if (allMessages.length === 0) {
    feed.innerHTML = `<div class="empty-state"><div class="empty-icon">💬</div><p>No messages exchanged yet.</p></div>`;
    return;
  }

  feed.innerHTML = allMessages.map(m => {
    const sender = m.sender || 'unknown';
    const reqProblem = m.requestId?.problem || 'Unknown Request';
    const time = fmtTime(m.timestamp);
    const avatar = sender === 'customer' ? '🧑‍💻' : '🔧';
    return `
      <div class="msg-item">
        <div class="msg-avatar ${sender}">${avatar}</div>
        <div class="msg-body">
          <div class="msg-meta">
            <span class="msg-sender ${sender}">${sender}</span>
            <span class="msg-req">📋 ${escHtml(reqProblem.substring(0,40))}${reqProblem.length > 40 ? '...' : ''}</span>
            <span class="msg-time">${time}</span>
          </div>
          <div class="msg-text">${escHtml(m.text)}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ─── Badge Helpers ───────────────────────────────────────────────────────────
function statusBadge(status) {
  const map = {
    pending:  'badge-pending',
    accepted: 'badge-accepted',
    resolved: 'badge-resolved'
  };
  const cls = map[status] || 'badge-pending';
  return `<span class="status-badge ${cls}">${escHtml(status || 'unknown')}</span>`;
}

function severityBadge(severity) {
  if (!severity) return '<span style="color:#6b7280;">—</span>';
  const s = severity.toLowerCase();
  const cls = s === 'high' ? 'badge-offline' : s === 'medium' ? 'badge-pending' : 'badge-online';
  return `<span class="status-badge ${cls}">${escHtml(severity)}</span>`;
}

// ─── Utility Formatting ──────────────────────────────────────────────────────
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function fmtTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ─── Boot ────────────────────────────────────────────────────────────────────
fetchAll();

// Auto-refresh every 30 seconds
setInterval(() => {
  fetchAll();
}, 30000);
