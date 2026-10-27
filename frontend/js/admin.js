const ADMIN_TOKEN_KEY = 'sentinel_admin_token';

const adminState = {
  experts: [],
  requests: [],
  expertFilter: 'all',
  ticketFilter: 'all'
};

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <div class="toast-progress"></div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

function statusPill(status, label) {
  const value = label || status || 'N/A';
  const normalized = String(status || 'pending').toLowerCase();
  let className = 'neutral';

  if (normalized === 'approved') className = 'approved';
  else if (normalized === 'suspended') className = 'suspended';
  else if (normalized === 'pending') className = 'pending';
  else if (normalized === 'accepted' || normalized === 'in_progress') className = 'accepted';
  else if (normalized === 'resolved') className = 'resolved';

  return `<span class="status-pill ${className}">${escapeHtml(value)}</span>`;
}

function renderExpertsTable() {
  const tbody = document.getElementById('specialistsTableBody');
  if (!tbody) return;

  const rows = adminState.experts.filter((expert) => {
    const matchesFilter = adminState.expertFilter === 'all' || (expert.approvalStatus || 'pending') === adminState.expertFilter;
    const searchText = document.getElementById('expertSearch')?.value.trim().toLowerCase() || '';
    const matchesSearch = !searchText || `${expert.name || ''} ${expert.email || ''}`.toLowerCase().includes(searchText);
    return matchesFilter && matchesSearch;
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><p>No specialists match this filter.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((expert) => {
    const status = expert.approvalStatus || 'pending';
    const isApproved = status === 'approved';
    const isOnline = !!expert.isOnline;
    return `
      <tr>
        <td data-label="Specialist">
          <div class="person-cell">
            <span class="avatar-badge">${escapeHtml((expert.name || 'S').charAt(0).toUpperCase())}</span>
            <div>
              <strong>${escapeHtml(expert.name || 'Unknown')}</strong>
              <small>${escapeHtml(expert.email || 'No email')}</small>
            </div>
          </div>
        </td>
        <td data-label="Category"><span class="category-cell">${escapeHtml(expert.category || 'Not set')}</span></td>
        <td data-label="Phone">${escapeHtml(expert.phone || expert.mobile || 'N/A')}</td>
        <td data-label="Experience">${escapeHtml(expert.experience || 1)} yrs</td>
        <td data-label="Status">${statusPill(status)}</td>
        <td data-label="Online">
          <span class="online-row ${isOnline && isApproved ? 'online' : 'offline'}">
            <span class="presence-dot"></span>${escapeHtml(isOnline && isApproved ? 'Online' : 'Offline')}
          </span>
        </td>
        <td data-label="Actions">
          <div class="action-row">
            <button class="btn btn-primary btn-small" data-action="approve" data-id="${escapeHtml(expert._id)}" type="button">${isApproved ? 'Refresh' : 'Approve'}</button>
            <button class="btn btn-secondary btn-small" data-action="suspend" data-id="${escapeHtml(expert._id)}" type="button">Suspend</button>
            <button class="btn btn-danger btn-small" data-action="delete-expert" data-id="${escapeHtml(expert._id)}" type="button">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderTicketsTable() {
  const tbody = document.getElementById('ticketsTableBody');
  if (!tbody) return;

  const rows = adminState.requests.filter((request) => {
    if (adminState.ticketFilter === 'all') return true;
    const normalized = String(request.status || 'pending').toLowerCase().replace(/\s+/g, '_');
    return normalized === adminState.ticketFilter;
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><p>No tickets match this filter.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((request) => {
    const status = request.status || 'pending';
    const category = request.category || 'Not set';
    const expertName = request.expertId && request.expertId.name ? request.expertId.name : 'Unassigned';
    const date = request.createdAt ? new Date(request.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown';

    return `
      <tr data-id="${escapeHtml(request._id)}" tabindex="0" class="ticket-row" role="button" aria-label="Review ticket ${escapeHtml(request.problem || 'request')}">
        <td data-label="Ticket"><span class="ticket-id">#${escapeHtml(String(request._id || '').slice(-6))}</span></td>
        <td data-label="Problem"><strong>${escapeHtml(request.problem || 'No problem description')}</strong></td>
        <td data-label="Category"><span class="category-cell">${escapeHtml(category)}</span></td>
        <td data-label="Severity">${statusPill(request.severity || 'Medium', request.severity || 'Medium')}</td>
        <td data-label="Status">${statusPill(status)}</td>
        <td data-label="Assigned">${escapeHtml(expertName)}</td>
        <td data-label="Created">${escapeHtml(date)}</td>
        <td data-label="Actions">
          <div class="action-row compact">
            <button class="btn btn-secondary btn-small" data-action="review" data-id="${escapeHtml(request._id)}" type="button">Open</button>
            <button class="btn btn-danger btn-small" data-action="delete-ticket" data-id="${escapeHtml(request._id)}" type="button">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function apiFetch(url, options = {}) {
  const config = {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {})
    }
  };

  const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (adminToken) {
    config.headers.Authorization = `Bearer ${adminToken}`;
  }

  if (options.body && !(options.body instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, config);
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    payload = { success: false, error: 'Invalid server response' };
  }

  return { ok: response.ok, status: response.status, data: payload };
}

function showAdminLoginScreen(message = '') {
  const screen = document.getElementById('adminAuthScreen');
  const main = document.getElementById('adminMainContent');
  const errorBox = document.getElementById('adminLoginError');

  if (screen) screen.style.display = 'flex';
  if (main) main.style.display = 'none';
  if (errorBox) errorBox.textContent = message;
}

function hideAdminLoginScreen() {
  const screen = document.getElementById('adminAuthScreen');
  const main = document.getElementById('adminMainContent');

  if (screen) screen.style.display = 'none';
  if (main) main.style.display = 'block';
}

async function handleAdminLogin(event) {
  event.preventDefault();
  const usernameField = document.getElementById('adminUsername');
  const passwordField = document.getElementById('adminPassword');
  const errorBox = document.getElementById('adminLoginError');

  const payload = {
    username: usernameField?.value || '',
    password: passwordField?.value || ''
  };

  const res = await apiFetch('/admin/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (res.ok && res.data.success) {
    localStorage.setItem(ADMIN_TOKEN_KEY, res.data.token);
    hideAdminLoginScreen();
    await loadAdminData();
    return;
  }

  if (errorBox) {
    errorBox.textContent = res.data?.error || 'Invalid admin credentials.';
  }
}

async function ensureAdminSession() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (!token) {
    showAdminLoginScreen();
    return false;
  }

  const res = await apiFetch('/admin/me');
  if (res.ok && res.data.success) {
    hideAdminLoginScreen();
    return true;
  }

  localStorage.removeItem(ADMIN_TOKEN_KEY);
  showAdminLoginScreen('Session expired. Please sign in again.');
  return false;
}

async function loadAdminData() {
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) refreshBtn.disabled = true;

  const sessionOk = await ensureAdminSession();
  if (!sessionOk) {
    if (refreshBtn) refreshBtn.disabled = false;
    return;
  }

  const [statsRes, expertsRes, requestsRes] = await Promise.all([
    apiFetch('/admin/stats'),
    apiFetch('/admin/experts'),
    apiFetch('/admin/requests')
  ]);

  if (statsRes.status === 401 || expertsRes.status === 401 || requestsRes.status === 401) {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    showAdminLoginScreen('Admin session expired. Please sign in again.');
    if (refreshBtn) refreshBtn.disabled = false;
    return;
  }

  if (statsRes.ok && statsRes.data.success) {
    updateStatCards(statsRes.data.stats || {});
  }

  adminState.experts = expertsRes.ok && expertsRes.data.success ? expertsRes.data.experts || [] : [];
  adminState.requests = requestsRes.ok && requestsRes.data.success ? requestsRes.data.requests || [] : [];

  renderExpertsTable();
  renderTicketsTable();

  if (refreshBtn) refreshBtn.disabled = false;
}

function updateStatCards(stats) {
  const values = {
    statExperts: stats.experts ?? 0,
    statRequests: stats.requests ?? 0,
    statPending: stats.pending ?? 0,
    statMessages: stats.messages ?? 0
  };

  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  });
}

async function handleExpertAction(expertId, action) {
  if (action === 'delete-expert') {
    const expert = adminState.experts.find((item) => item._id === expertId);
    const targetName = expert?.name || 'this specialist';
    const confirmed = window.confirm(`Delete ${targetName}? This action cannot be undone.`);
    if (!confirmed) return;

    const res = await apiFetch(`/admin/expert/${expertId}`, { method: 'DELETE' });
    if (res.ok && res.data.success) {
      showToast('Specialist deleted.', 'success');
      await loadAdminData();
    } else {
      showToast(res.data?.error || 'Failed to delete specialist.', 'error');
    }
    return;
  }

  const endpoint = action === 'approve' ? `/admin/expert/${expertId}/approve` : `/admin/expert/${expertId}/suspend`;
  const res = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({}) });

  if (res.ok && res.data.success) {
    showToast(action === 'approve' ? 'Specialist approved.' : 'Specialist suspended.', 'success');
    await loadAdminData();
  } else {
    showToast(res.data?.error || 'Failed to update specialist status.', 'error');
  }
}

async function handleTicketAction(action, ticketId) {
  if (action === 'delete-ticket') {
    const confirmed = window.confirm('Delete this ticket and its messages?');
    if (!confirmed) return;

    const res = await apiFetch(`/admin/request/${ticketId}`, { method: 'DELETE' });
    if (res.ok && res.data.success) {
      showToast('Ticket deleted.', 'success');
      await loadAdminData();
    } else {
      showToast(res.data?.error || 'Failed to delete ticket.', 'error');
    }
    return;
  }

  if (action === 'review') {
    const res = await apiFetch(`/api/request/${ticketId}`);
    if (!res.ok || !res.data?.success) {
      showToast(res.data?.error || 'Unable to open ticket.', 'error');
      return;
    }

    const request = res.data.request || {};
    const messages = res.data.messages || [];

    document.getElementById('drawerTitle').textContent = `Request #${String(request._id || '').slice(-6)}`;
    document.getElementById('drawerProblem').textContent = request.problem || 'No problem description';
    document.getElementById('drawerSummary').textContent = request.analysis || 'No diagnosis summary available.';
    document.getElementById('drawerCategory').textContent = request.category || 'Not set';
    document.getElementById('drawerSeverity').textContent = request.severity || 'Medium';
    document.getElementById('drawerCustomer').textContent = request.customerName || 'Verified customer';
    document.getElementById('drawerExpert').textContent = request.expertId && request.expertId.name ? request.expertId.name : 'Unassigned';
    document.getElementById('drawerEscrow').textContent = request.paymentStatus || 'unpaid';

    const drawerStatus = document.getElementById('drawerStatus');
    drawerStatus.textContent = request.status || 'pending';
    drawerStatus.className = `status-pill ${request.status === 'resolved' ? 'resolved' : request.status === 'accepted' || request.status === 'in_progress' ? 'accepted' : request.status === 'suspended' ? 'suspended' : 'pending'}`;

    const image = document.getElementById('drawerImage');
    const noImage = document.getElementById('drawerNoImage');
    if (request.image) {
      image.src = request.image;
      image.classList.remove('hidden');
      noImage.classList.add('hidden');
    } else {
      image.classList.add('hidden');
      image.removeAttribute('src');
      noImage.classList.remove('hidden');
    }

    const transcript = document.getElementById('drawerMessages');
    transcript.innerHTML = messages.length
      ? messages.map((message) => `
        <div class="message-bubble ${message.sender === 'customer' ? 'customer' : 'expert'}">
          <strong>${escapeHtml(message.sender || 'Unknown')}</strong>
          <span>${escapeHtml(message.text || '')}</span>
        </div>
      `).join('')
      : '<p class="muted-text">No chat messages yet.</p>';

    document.getElementById('ticketDrawer').classList.remove('hidden');
  }
}

function bindInteractions() {
  document.querySelectorAll('.admin-nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.tab;
      document.querySelectorAll('.admin-nav-item').forEach((item) => item.classList.toggle('active', item === button));
      document.querySelectorAll('.admin-panel').forEach((panel) => {
        const show = panel.dataset.panel === target;
        panel.classList.toggle('hidden', !show);
        panel.classList.toggle('active', show);
      });
    });
  });

  document.getElementById('refreshBtn')?.addEventListener('click', loadAdminData);
  document.getElementById('refreshExpertsBtn')?.addEventListener('click', loadAdminData);
  document.getElementById('refreshTicketsBtn')?.addEventListener('click', loadAdminData);

  document.getElementById('expertSearch')?.addEventListener('input', renderExpertsTable);

  document.querySelectorAll('[data-expert-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      adminState.expertFilter = button.dataset.expertFilter || 'all';
      document.querySelectorAll('[data-expert-filter]').forEach((item) => item.classList.toggle('active', item === button));
      renderExpertsTable();
    });
  });

  document.querySelectorAll('[data-ticket-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      adminState.ticketFilter = button.dataset.ticketFilter || 'all';
      document.querySelectorAll('[data-ticket-filter]').forEach((item) => item.classList.toggle('active', item === button));
      renderTicketsTable();
    });
  });

  document.addEventListener('click', (event) => {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;

    const action = actionTarget.dataset.action;
    const id = actionTarget.dataset.id;

    if (action === 'approve' || action === 'suspend' || action === 'delete-expert') {
      handleExpertAction(id, action);
      return;
    }

    if (action === 'review' || action === 'delete-ticket') {
      handleTicketAction(action, id);
    }
  });

  document.querySelector('#closeDrawerBtn')?.addEventListener('click', () => {
    document.getElementById('ticketDrawer').classList.add('hidden');
  });

  document.querySelector('#closeModalBtn')?.addEventListener('click', () => {
    document.getElementById('confirmModal')?.classList.add('hidden');
  });

  document.querySelector('#cancelModalBtn')?.addEventListener('click', () => {
    document.getElementById('confirmModal')?.classList.add('hidden');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.getElementById('ticketDrawer')?.classList.add('hidden');
      document.getElementById('confirmModal')?.classList.add('hidden');
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  bindInteractions();
  const loginForm = document.getElementById('adminLoginForm');
  loginForm?.addEventListener('submit', handleAdminLogin);

  const isAuthenticated = await ensureAdminSession();
  if (isAuthenticated) {
    await loadAdminData();
  }
});
