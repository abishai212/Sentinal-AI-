// Expert Dashboard Logic - Socket.io Integrated
let currentExpert = null;
let feedInterval = null;
let openRequestId = null;
let unreadCount = 0;

const socket = io();
const alertSound = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');

// Socket room management & notifications
socket.on('connect', () => {
  if (currentExpert) {
    socket.emit('expert_login', { expertId: currentExpert._id, skill: currentExpert.skill });
  }
  if (openRequestId) {
    socket.emit('join_request', openRequestId);
  }
});

const showToast = (msg, type = 'info') => {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️')}</span> ${msg}`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4500);
};

// DOM Elements for Prominent Alerts
const liveAlertModal = document.getElementById('liveAlertModal');
const alertProblem = document.getElementById('alertProblem');
const alertAnalysis = document.getElementById('alertAnalysis');
const alertOpenBtn = document.getElementById('alertOpenBtn');
const alertCloseBtn = document.getElementById('alertCloseBtn');
let pendingAlertRequest = null;

if (alertCloseBtn) {
  alertCloseBtn.addEventListener('click', () => {
    liveAlertModal.classList.add('hidden');
    liveAlertModal.style.display = 'none';
    pendingAlertRequest = null;
  });
}

if (alertOpenBtn) {
  alertOpenBtn.addEventListener('click', () => {
    liveAlertModal.classList.add('hidden');
    liveAlertModal.style.display = 'none';
    if (pendingAlertRequest) {
      openRequestAction(pendingAlertRequest);
      pendingAlertRequest = null;
    }
  });
}

socket.on('new_request', (data) => {
  if (currentExpert) {
    alertSound.play().catch(e => {});
    showToast(`🔔 New Task Assigned: "${data.request.problem}"`, 'success');
    pollFeed();
    
    // Display popup modal
    pendingAlertRequest = data.request;
    alertProblem.textContent = data.request.problem;
    alertAnalysis.textContent = data.request.analysis || 'A.I. has diagnosed an issue. Please review details.';
    liveAlertModal.classList.remove('hidden');
    liveAlertModal.style.display = 'flex';
  }
});

socket.on('new_request_available', (data) => {
  if (currentExpert) {
    const relevantTypes = mapSkillToTypes(currentExpert.skill);
    if (relevantTypes && !relevantTypes.includes(data.request.type) && data.request.type !== 'Unknown') {
      return; 
    }
    alertSound.play().catch(e => {});
    showToast(`📢 New Ticket Available: "${data.request.problem}"`, 'info');
    pollFeed();
    
    // Display popup modal
    pendingAlertRequest = data.request;
    alertProblem.textContent = data.request.problem;
    alertAnalysis.textContent = data.request.analysis || 'A.I. has diagnosed an issue. Please review details.';
    liveAlertModal.classList.remove('hidden');
    liveAlertModal.style.display = 'flex';
  }
});

// DOM Elements
const registerModal = document.getElementById('registerModal');
const registerBtn = document.getElementById('registerBtn');
const regName = document.getElementById('regName');
const regEmail = document.getElementById('regEmail');
const regMobile = document.getElementById('regMobile');
const regLocation = document.getElementById('regLocation');
const regExperience = document.getElementById('regExperience');
const regSkill = document.getElementById('regSkill');
const expertFeed = document.getElementById('expertFeed');

const actionModal = document.getElementById('actionModal');
const closeActionModalBtn = document.getElementById('closeActionModalBtn');
const reqDetailContent = document.getElementById('reqDetailContent');
const expChatHistory = document.getElementById('expChatHistory');
const expTypingIndicator = document.getElementById('expTypingIndicator');
const expChatInput = document.getElementById('expChatInput');
const expSendBtn = document.getElementById('expSendBtn');
const offerPriceInput = document.getElementById('offerPrice');
const acceptReqBtn = document.getElementById('acceptReqBtn');
const resolveReqBtn = document.getElementById('resolveReqBtn');
const notifBadge = document.getElementById('notifBadge');
const expertStatusToggle = document.getElementById('expertStatusToggle');

// Login/Register Toggle Logic
let isLoginMode = false;
const toggleToLogin = document.getElementById('toggleToLogin');
const toggleToRegister = document.getElementById('toggleToRegister');
const modalTitle = document.getElementById('modalTitle');
const modalDesc = document.getElementById('modalDesc');

if (toggleToLogin) {
  toggleToLogin.addEventListener('click', () => {
    isLoginMode = true;
    modalTitle.textContent = "Expert Login";
    modalDesc.textContent = "Please enter your registered Email Address to enter the portal.";
    regName.style.display = 'none';
    regMobile.style.display = 'none';
    regLocation.style.display = 'none';
    regExperience.style.display = 'none';
    regSkill.style.display = 'none';
    registerBtn.textContent = "Login";
    toggleToLogin.classList.add('hidden');
    toggleToRegister.classList.remove('hidden');
  });
}

if (toggleToRegister) {
  toggleToRegister.addEventListener('click', () => {
    isLoginMode = false;
    modalTitle.textContent = "Expert Registration";
    modalDesc.textContent = "Please register your full profile to enter the system. SMS alerts will be sent to your mobile.";
    regName.style.display = 'block';
    regMobile.style.display = 'block';
    regLocation.style.display = 'block';
    regExperience.style.display = 'block';
    regSkill.style.display = 'block';
    registerBtn.textContent = "Enter Portal";
    toggleToLogin.classList.remove('hidden');
    toggleToRegister.classList.add('hidden');
  });
}

registerBtn.addEventListener('click', async () => {
  if (isLoginMode) {
    const email = regEmail.value.trim();
    if (!email) {
      alert("Please enter your registered Email Address");
      return;
    }
    
    try {
      const res = await fetch('/api/expert/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (data.success) {
        currentExpert = data.expert;
        localStorage.setItem('sentinal_expert', JSON.stringify(currentExpert));
        registerModal.style.display = 'none';
        expertStatusToggle.classList.remove('hidden');
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.classList.remove('hidden');
        startFeedPolling();
        socket.emit('expert_login', { expertId: currentExpert._id, skill: currentExpert.skill });
        showToast("✅ Logged in successfully!", "success");
      } else {
        alert("❌ Login error: " + data.error);
      }
    } catch(err) { alert("❌ Connection failed or Server error."); }
  } else {
    const payload = {
      name: regName.value.trim(),
      email: regEmail.value.trim(),
      mobile: regMobile.value.trim(),
      location: regLocation.value.trim(),
      experience: regExperience.value,
      skill: regSkill.value
    };

    if (!payload.name || !payload.email || !payload.mobile) { 
      alert("Please fill required fields (Name, Email, Mobile)"); return; 
    }
    
    try {
      const res = await fetch('/api/expert/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        currentExpert = data.expert;
        localStorage.setItem('sentinal_expert', JSON.stringify(currentExpert));
        registerModal.style.display = 'none';
        expertStatusToggle.classList.remove('hidden');
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.classList.remove('hidden');
        startFeedPolling();
        socket.emit('expert_login', { expertId: currentExpert._id, skill: currentExpert.skill });
        showToast("✅ Registered successfully!", "success");
      } else {
        alert("❌ Registration error: " + data.error);
      }
    } catch(err) { alert("❌ Connection failed or Server error."); }
  }
});

expertStatusToggle.addEventListener('click', () => {
  if (!currentExpert) return;
  currentExpert.isOnline = !currentExpert.isOnline;
  expertStatusToggle.textContent = currentExpert.isOnline ? 'Online' : 'Offline';
  expertStatusToggle.style.background = currentExpert.isOnline ? '#4CAF50' : '#f44336';
  
  socket.emit('expert_status_change', {
    expertId: currentExpert._id,
    isOnline: currentExpert.isOnline
  });
});

// We keep feed polling because new tickets might just arrive passively, but we could also broadcast them. We'll poll every 5s for simplicity for feed.
const startFeedPolling = () => {
  pollFeed();
  feedInterval = setInterval(pollFeed, 5000);
};

const pollFeed = async () => {
  if (!currentExpert) return;
  try {
    const res = await fetch('/api/requests');
    const data = await res.json();
    if (data.success) renderFeed(data.requests);
  } catch (err) {}
};

const mapSkillToTypes = (skill) => {
  if (skill === 'Software Developer') return ['Software', 'Software System'];
  if (skill === 'Cybersecurity') return ['Cybersecurity'];
  if (skill === 'Mobile Technician') return ['Hardware', 'Hardware / biological'];
  if (skill === 'All') return null; 
  return ['Hardware', 'Hardware / biological']; 
};

const renderFeed = (requests) => {
  expertFeed.innerHTML = '';
  const relevantTypes = mapSkillToTypes(currentExpert.skill);
  const filtered = relevantTypes 
    ? requests.filter(r => relevantTypes.includes(r.type) || r.type === 'Unknown')
    : requests;

  if (filtered.length === 0) { expertFeed.innerHTML = '<p style="color:#aaa;">No relevant requests pending.</p>'; return; }

  filtered.forEach(req => {
    const card = document.createElement('div');
    card.className = 'card req-card';
    card.innerHTML = `
      <div class="badge ${req.status === 'accepted' ? 'success' : (req.status === 'resolved' ? '' : 'high')}">${req.status.toUpperCase()}</div>
      <h3>${req.problem}</h3>
      <p style="font-size: 0.9em; margin: 10px 0;">${req.analysis ? req.analysis.substring(0, 100) : ''}...</p>
      <div class="req-meta">
        Est. Cost: ${req.costEstimate} <br>
        Severity: ${req.severity} <br>
        <em>${new Date(req.createdAt).toLocaleTimeString()}</em>
      </div>
    `;
    card.addEventListener('click', () => openRequestAction(req));
    expertFeed.appendChild(card);
  });
};

const openRequestAction = async (req) => {
  openRequestId = req._id;
  actionModal.classList.remove('hidden');
  actionModal.style.display = 'flex';
  
  // Reset Notifs
  unreadCount = 0;
  notifBadge.classList.add('hidden');
  notifBadge.textContent = '0';

  // Join sockets room
  socket.emit('join_request', openRequestId);

  // Fetch full history
  try {
    const res = await fetch(`/api/request/${openRequestId}`);
    const data = await res.json();
    if (data.success) {
      updateActionModalUI(data.request, data.messages);
    }
  } catch(err) {}
};

const updateActionModalUI = (req, messages = []) => {
  let imgHtml = req.image ? `<img src="${req.image}" style="max-height: 200px; border-radius: 8px; margin-bottom: 10px; display: block;">` : '';

  reqDetailContent.innerHTML = `
    ${imgHtml}
    <h4 style="margin-bottom: 5px;">${req.problem} <span class="badge" style="font-size: 0.8em">${req.status}</span></h4>
    <p><strong>A.I. Analysis:</strong> ${req.analysis}</p>
    <p><strong>Estimated Cost:</strong> ${req.customPrice || req.costEstimate}</p>
  `;

  const controls = document.getElementById('expertActionControls');
  if (req.status === 'pending') {
    acceptReqBtn.classList.remove('hidden');
    offerPriceInput.classList.remove('hidden');
    resolveReqBtn.classList.add('hidden');
  } else if (req.status === 'accepted') {
    if (req.expertId._id === currentExpert._id || req.expertId === currentExpert._id) {
      acceptReqBtn.classList.add('hidden');
      offerPriceInput.classList.add('hidden');
      resolveReqBtn.classList.remove('hidden');
    } else {
      controls.innerHTML = '<em>Request accepted by another expert.</em>';
    }
  } else if (req.status === 'resolved') {
      controls.innerHTML = '<em style="color: #4CAF50;">Request Resolved.</em>';
  }

  expChatHistory.innerHTML = '';
  messages.forEach(msg => appendMessage(msg));
};

const appendMessage = (msg) => {
  if (!msg || !msg._id) return;
  // Check duplicate
  if (expChatHistory.querySelector(`[data-msg-id="${msg._id}"]`)) return;

  const div = document.createElement('div');
  div.className = `chat-msg ${msg.sender === 'expert' ? 'sys' : 'user'}-msg`;
  div.setAttribute('data-msg-id', msg._id);
  
  const time = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  div.innerHTML = `<strong>${msg.sender}:</strong> ${msg.text} <span style="font-size: 0.7em; opacity: 0.7; float: right; margin-top: 5px;">${time}</span>`;
  expChatHistory.appendChild(div);
  expChatHistory.scrollTop = expChatHistory.scrollHeight;
};

// WebSocket Listeners
socket.on('receive_message', (msg) => {
  if (msg.requestId === openRequestId) {
    appendMessage(msg);
    expTypingIndicator.textContent = '';
    if (msg.sender === 'customer') alertSound.play().catch(e => {});
  } else if (msg.sender === 'customer') {
    unreadCount++;
    notifBadge.classList.remove('hidden');
    notifBadge.textContent = unreadCount;
    alertSound.play().catch(e => {});
    showToast(`💬 New message from customer: "${msg.text.substring(0, 30)}..."`, 'info');
    pollFeed();
  }
});

socket.on('user_typing', (data) => {
  if (data.requestId === openRequestId && data.sender === 'customer') {
    expTypingIndicator.textContent = 'Customer is typing...';
    clearTimeout(window.typingTimeout);
    window.typingTimeout = setTimeout(() => expTypingIndicator.textContent = '', 2000);
  }
});

socket.on('request_updated', (data) => {
    if (data.request._id === openRequestId) {
        // Soft refresh without wiping messages
        fetch(`/api/request/${openRequestId}`).then(r => r.json()).then(res => {
            if(res.success) updateActionModalUI(res.request, res.messages);
        });
    }
});

closeActionModalBtn.addEventListener('click', () => {
  actionModal.classList.add('hidden');
  actionModal.style.display = 'none';
  openRequestId = null;
});

acceptReqBtn.addEventListener('click', async () => {
  if (!openRequestId) return;
  const price = offerPriceInput.value.trim();
  await fetch(`/api/request/${openRequestId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'accept', expertId: currentExpert._id, price: price })
  });
});

resolveReqBtn.addEventListener('click', async () => {
  if (!openRequestId) return;
  await fetch(`/api/request/${openRequestId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'resolve', expertId: currentExpert._id })
  });
});

// Chat Output
expSendBtn.addEventListener('click', () => {
  const text = expChatInput.value.trim();
  if (!text || !openRequestId) return;
  expChatInput.value = '';
  
  socket.emit('send_message', {
    requestId: openRequestId,
    sender: 'expert',
    text: text
  });
});

expChatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') expSendBtn.click();
  else socket.emit('user_typing', { requestId: openRequestId, sender: 'expert' });
});

// Auto-login stored session
window.addEventListener('DOMContentLoaded', async () => {
  const saved = localStorage.getItem('sentinal_expert');
  const logoutBtn = document.getElementById('logoutBtn');
  if (saved) {
    try {
      const savedExpert = JSON.parse(saved);
      const res = await fetch(`/api/expert/${savedExpert._id}`);
      const data = await res.json();
      if (data.success) {
        currentExpert = data.expert;
        localStorage.setItem('sentinal_expert', JSON.stringify(currentExpert));
        registerModal.style.display = 'none';
        expertStatusToggle.classList.remove('hidden');
        if (logoutBtn) logoutBtn.classList.remove('hidden');
        expertStatusToggle.textContent = currentExpert.isOnline ? 'Online' : 'Offline';
        expertStatusToggle.style.background = currentExpert.isOnline ? '#4CAF50' : '#f44336';
        startFeedPolling();
        if (socket.connected) {
          socket.emit('expert_login', { expertId: currentExpert._id, skill: currentExpert.skill });
        }
      } else {
        localStorage.removeItem('sentinal_expert');
        showRegistrationForm();
      }
    } catch (err) {
      console.error('Session validation error:', err);
      currentExpert = JSON.parse(saved);
      registerModal.style.display = 'none';
      expertStatusToggle.classList.remove('hidden');
      if (logoutBtn) logoutBtn.classList.remove('hidden');
      startFeedPolling();
    }
  } else {
    showRegistrationForm();
  }
});

function showRegistrationForm() {
  registerModal.style.display = 'flex';
  expertStatusToggle.classList.add('hidden');
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.classList.add('hidden');
  expertFeed.innerHTML = '';
}

// Logout handler
document.getElementById('logoutBtn').addEventListener('click', () => {
  if (confirm("Are you sure you want to logout?")) {
    if (currentExpert) {
      socket.emit('expert_status_change', {
        expertId: currentExpert._id,
        isOnline: false
      });
    }
    localStorage.removeItem('sentinal_expert');
    currentExpert = null;
    if (feedInterval) clearInterval(feedInterval);
    registerModal.style.display = 'flex';
    expertStatusToggle.classList.add('hidden');
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    expertFeed.innerHTML = '';
  }
});
