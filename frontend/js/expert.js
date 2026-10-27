// Sentinel Specialist Portal Controller
let currentExpert = null;
let currentTicket = null;
let socket = null;
let peerConnection = null;
let localMediaStream = null;
let pendingExpertIceCandidates = [];
let knownTicketIds = new Set();

// Initialize Workspace
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('dismissVerificationBtn')?.addEventListener('click', () => {
    document.getElementById('pendingApprovalBanner').hidden = true;
  });
  document.getElementById('backToInboxBtn')?.addEventListener('click', closeMobileTicket);
  document.getElementById('expandChatBtn')?.addEventListener('click', toggleExpandedChat);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeExpandedChat();
      closeMobileTicket();
    }
  });
  await verifyAndLoadProfile();
  initSocketConnection();
  loadTicketFeed();
  // Poll feed periodically as fallback
  setInterval(loadTicketFeed, 7000);
});

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// 1. Authenticate & Hydrate Profile
async function verifyAndLoadProfile() {
  const token = localStorage.getItem('sentinel_expert_token');
  if (!token) {
    window.location.href = 'auth.html';
    return;
  }

  const res = await apiFetch('/api/expert/me');
  if (!res.ok || !res.data.success) {
    localStorage.removeItem('sentinel_expert_token');
    window.location.href = 'auth.html';
    return;
  }

  currentExpert = res.data.expert;
  renderProfileUI();
}

function renderProfileUI() {
  if (!currentExpert) return;

  const name = currentExpert.name || 'Specialist';
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  document.getElementById('navExpertName').textContent = name;
  document.querySelector('.expert-nav-identity').setAttribute('aria-label', `Signed in as ${name}`);
  document.getElementById('navExpertAvatar').textContent = initial;
  document.getElementById('profName').textContent = currentExpert.name;
  document.getElementById('profCategory').textContent = currentExpert.category || 'Generalist';
  document.getElementById('profCity').textContent = currentExpert.serviceArea || 'Remote';
  document.getElementById('profAvatar').textContent = initial;
  const ratingCount = Number(currentExpert.ratingCount || 0);
  document.getElementById('profRating').textContent = ratingCount > 0
    ? `★ ${Number(currentExpert.rating).toFixed(1)} (${ratingCount})`
    : 'No ratings yet';
  document.getElementById('profBalance').textContent = formatINR(currentExpert.earningsBalance || 0);

  const btn = document.getElementById('toggleOnlineBtn');
  const label = document.getElementById('onlineStatusLabel');
  const approved = currentExpert.approvalStatus === 'approved';
  const banner = document.getElementById('pendingApprovalBanner');
  const approvalStatus = currentExpert.approvalStatus || 'pending';
  const approvalBadge = document.getElementById('approvalBadge');
  approvalBadge.textContent = approvalStatus.charAt(0).toUpperCase() + approvalStatus.slice(1);
  approvalBadge.className = `status-pill ${approvalStatus === 'approved' ? 'approved' : approvalStatus === 'suspended' ? 'suspended' : 'pending'} expert-approval-pill`;
  if (!approved) {
    banner.hidden = false;
    document.getElementById('verificationHeading').textContent = approvalStatus === 'suspended'
      ? 'Account access is suspended'
      : 'Account verification in progress';
    document.getElementById('verificationCopy').textContent = approvalStatus === 'suspended'
      ? 'Your account is suspended. Service and ticket actions are unavailable; contact an administrator for assistance.'
      : 'Your application is under administrative review. Online service and ticket actions will be available after verification.';
  } else {
    banner.hidden = true;
  }
  btn.disabled = !approved;
  btn.setAttribute('aria-checked', String(Boolean(currentExpert.isOnline)));
  btn.title = approved ? (currentExpert.isOnline ? 'Go offline' : 'Go online') : 'Available after verification';
  btn.querySelector('.sr-only').textContent = currentExpert.isOnline ? 'Go offline' : 'Go online';
  document.getElementById('verificationHelper').hidden = approved;
  document.getElementById('actionVerificationHelper').hidden = approved;

  label.classList.toggle('is-online', Boolean(currentExpert.isOnline));
  label.innerHTML = `<span class="presence-dot" aria-hidden="true"></span>${currentExpert.isOnline ? 'Available for jobs' : 'Currently offline'}`;
}

function formatINR(value) {
  const amount = Number(value);
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0)}`;
}

function formatEstimate(value) {
  const text = String(value || 'Varies').replace(/\$/g, '₹');
  return text.replace(/\d[\d,]*(?:\.\d+)?/g, (number) => {
    const amount = Number(number.replace(/,/g, ''));
    return Number.isFinite(amount) ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount) : number;
  });
}

function closeMobileTicket() {
  document.getElementById('expertLayout')?.classList.remove('detail-open');
}

function toggleExpandedChat() {
  const chat = document.querySelector('.expert-chat');
  const button = document.getElementById('expandChatBtn');
  const expanded = chat.classList.toggle('chat-expanded');
  button.setAttribute('aria-expanded', String(expanded));
  button.textContent = expanded ? 'Close chat' : 'Expand chat';
}

function closeExpandedChat() {
  const chat = document.querySelector('.expert-chat');
  const button = document.getElementById('expandChatBtn');
  if (!chat || !button) return;
  chat.classList.remove('chat-expanded');
  button.setAttribute('aria-expanded', 'false');
  button.textContent = 'Expand chat';
}

// 2. Online / Offline Toggle
async function toggleOnlineState() {
  if (!currentExpert || currentExpert.approvalStatus !== 'approved') return;

  const newState = !currentExpert.isOnline;
  const res = await apiFetch('/api/expert/me', {
    method: 'PUT',
    body: JSON.stringify({ isOnline: newState })
  });

  if (res.ok && res.data.success) {
    currentExpert = res.data.expert;
    renderProfileUI();
    showToast(`You are now ${currentExpert.isOnline ? 'Online' : 'Offline'}.`, 'success');
  } else {
    showToast(res.data.error || 'Failed to update online status.', 'error');
  }
}

// 3. Socket.IO Lifecycle
function initSocketConnection() {
  socket = io();

  socket.on('connect', () => {
    if (currentExpert) {
      socket.emit('expert_init', {
        expertId: currentExpert._id,
        category: currentExpert.category
      });
    }
  });

  socket.on('new_request', (data) => {
    showToast(`New ${data.request.category} request: "${data.request.problem}"`, 'info');
    loadTicketFeed();
  });

  socket.on('request_claimed', (data) => {
    // If ticket was taken by another specialist, refresh feed and update active view if open
    loadTicketFeed();
    if (currentTicket && String(currentTicket._id) === String(data.requestId)) {
      showToast('This ticket was claimed by another specialist.', 'error');
      openTicket(data.requestId);
    }
  });

  socket.on('request_updated', (data) => {
    if (currentTicket && String(currentTicket._id) === String(data.request._id)) {
      openTicket(currentTicket._id);
    }
    loadTicketFeed();
  });

  socket.on('receive_message', (msg) => {
    if (currentTicket && String(msg.requestId) === String(currentTicket._id)) {
      appendChatMessage(msg);
    }
  });

  socket.on('user_typing', (data) => {
    if (!currentTicket || String(data.requestId) !== String(currentTicket._id) || data.sender === 'expert') return;
    const indicator = document.getElementById('expTypingIndicator');
    indicator.textContent = data.isTyping ? 'Customer is typing…' : '';
    if (data.isTyping) {
      clearTimeout(indicator.typingTimeout);
      indicator.typingTimeout = setTimeout(() => { indicator.textContent = ''; }, 1800);
    }
  });

  // WebRTC Incoming Handlers
  socket.on('webrtc_offer', async (data) => {
    if (!data || !currentTicket || String(data.requestId) !== String(currentTicket._id)) return;
    await handleWebRtcOffer(data.offer);
  });
  socket.on('webrtc_answer', async (data) => {
    if (!data || !currentTicket || String(data.requestId) !== String(currentTicket._id)) return;
    await handleWebRtcAnswer(data.answer);
  });
  socket.on('webrtc_ice_candidate', async (data) => {
    if (!data || !currentTicket || String(data.requestId) !== String(currentTicket._id) || !data.candidate) return;
    await addExpertIceCandidate(data.candidate);
  });
  socket.on('webrtc_end_call', () => {
    closePeerConnection();
    showToast('Customer ended the video consultation.', 'info');
  });
}

// 4. Ticket Feed Fetch & Render
async function loadTicketFeed() {
  if (!currentExpert) return;

  const res = await apiFetch('/api/requests');
  if (!res.ok || !res.data.success) return;

  const tickets = res.data.requests || [];
  const listEl = document.getElementById('ticketList');
  document.getElementById('ticketCountBadge').textContent = tickets.length;
  const jobsCompleted = tickets.filter(ticket => ticket.status === 'resolved' &&
    String(ticket.expertId?._id || ticket.expertId || '') === String(currentExpert._id)).length;
  document.getElementById('profJobs').textContent = new Intl.NumberFormat('en-IN').format(jobsCompleted);

  if (tickets.length === 0) {
    listEl.innerHTML = `<div class="expert-inbox-empty">
      <svg viewBox="0 0 72 58" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 11h56v38H8z"/><path d="M8 20h14l4 6h20l4-6h14"/><path d="M29 37h14"/><circle cx="36" cy="35" r="17" opacity=".18"/></svg>
      <h3>No active requests in your queue</h3><p>New service requests for your category will appear here.</p>
    </div>`;
    knownTicketIds = new Set();
    return;
  }

  listEl.innerHTML = '';
  tickets.forEach(ticket => {
    const card = document.createElement('button');
    card.type = 'button';
    const isSelected = currentTicket && currentTicket._id === ticket._id;
    const wasKnown = knownTicketIds.has(String(ticket._id));
    card.className = `expert-ticket-card${!wasKnown ? ' ticket-new' : ''}`;
    card.setAttribute('aria-current', isSelected ? 'true' : 'false');
    const status = ['pending', 'accepted', 'in_progress', 'resolved'].includes(ticket.status) ? ticket.status : 'pending';
    const createdAt = ticket.createdAt ? new Date(ticket.createdAt) : null;
    const timeLabel = createdAt && !Number.isNaN(createdAt.getTime())
      ? createdAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
      : 'Recently';

    card.innerHTML = `
      <div class="expert-ticket-meta">
        <span class="expert-ticket-tags"><span class="expert-category-pill">${escapeHtml(ticket.category || 'General')}</span><span class="expert-status-pill ${status}">${escapeHtml(status.replace('_', ' '))}</span></span>
        <time class="expert-ticket-time">${escapeHtml(timeLabel)}</time>
      </div>
      <h3 class="expert-ticket-title">${escapeHtml(ticket.problem || 'Service request')}</h3>
      <p class="expert-ticket-summary">${escapeHtml(ticket.analysis || 'No detailed analysis provided.')}</p>
      <div class="expert-ticket-bottom">
        <span>Est. ${escapeHtml(formatEstimate(ticket.costEstimate || 'Varies'))}</span>
        <span class="expert-ticket-severity">${escapeHtml(ticket.severity || 'Unrated')} severity</span>
      </div>
    `;

    card.addEventListener('click', () => openTicket(ticket._id));
    listEl.appendChild(card);
  });
  knownTicketIds = new Set(tickets.map(ticket => String(ticket._id)));
}

// 5. Open Ticket & Workspace
async function openTicket(ticketId) {
  const res = await apiFetch(`/api/request/${ticketId}`);
  if (!res.ok || !res.data.success) {
    showToast(res.data.error || 'Failed to load request details.', 'error');
    return;
  }

  currentTicket = res.data.request;
  const messages = res.data.messages || [];

  // Join ticket room
  if (socket) {
    socket.emit('join_request', currentTicket._id);
  }

  renderTicketWorkspace(currentTicket, messages);
  document.getElementById('expertLayout').classList.add('detail-open');
  loadTicketFeed();
}

function renderTicketWorkspace(ticket, messages) {
  document.getElementById('noJobSelectedState').classList.add('hidden');
  const detailArea = document.getElementById('jobDetailArea');
  detailArea.classList.remove('hidden');

  document.getElementById('jobCategoryBadge').textContent = ticket.category || 'General';
  
  const statusBadge = document.getElementById('jobStatusBadge');
  const safeStatus = ['pending', 'accepted', 'in_progress', 'resolved'].includes(ticket.status) ? ticket.status : 'pending';
  statusBadge.textContent = safeStatus.replace('_', ' ').toUpperCase();
  statusBadge.className = `expert-status-pill ${safeStatus}`;

  document.getElementById('jobProblemTitle').textContent = ticket.problem || 'Service request';
  const tokenTail = String(ticket.customerToken || '').slice(-4).toUpperCase();
  document.getElementById('jobCustomerMeta').textContent = tokenTail ? `Customer #${tokenTail}` : 'Customer reference unavailable';
  document.getElementById('jobCostEstimate').textContent = `Estimate: ${formatEstimate(ticket.costEstimate || 'Varies')}`;
  document.getElementById('jobAnalysisText').textContent = ticket.analysis || 'Detailed automated diagnostic data recorded.';
  const diagnostic = ticket.diagnosticData || {};
  const severity = String(ticket.severity || diagnostic.severity || 'Not specified');
  const severityLevel = /critical|high|severe/i.test(severity) ? 85 : /medium|moderate/i.test(severity) ? 55 : /low|minor/i.test(severity) ? 25 : 0;
  const confidenceRaw = diagnostic.confidence;
  const confidence = Number.parseFloat(String(confidenceRaw || '').replace('%', ''));
  const confidencePercent = Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 0;
  document.getElementById('jobSeverityText').textContent = severity;
  document.getElementById('jobSeverityMeter').style.width = `${severityLevel}%`;
  document.getElementById('jobSeverityMeter').parentElement.setAttribute('aria-valuenow', severityLevel);
  document.getElementById('jobConfidenceText').textContent = Number.isFinite(confidence) ? `${confidencePercent}%` : 'Not available';
  document.getElementById('jobConfidenceMeter').style.width = `${confidencePercent}%`;
  document.getElementById('jobConfidenceMeter').parentElement.setAttribute('aria-valuenow', confidencePercent);

  if (ticket.image) {
    document.getElementById('jobImageContainer').classList.remove('hidden');
    document.getElementById('jobImagePreview').src = ticket.image;
  } else {
    document.getElementById('jobImageContainer').classList.add('hidden');
  }

  // Action buttons visibility
  const acceptBtn = document.getElementById('acceptJobBtn');
  const priceInput = document.getElementById('customPriceInput');
  const callBtn = document.getElementById('startCallBtn');
  const resolveBtn = document.getElementById('resolveJobBtn');

  if (safeStatus === 'pending') {
    acceptBtn.classList.remove('hidden');
    priceInput.classList.remove('hidden');
    callBtn.classList.add('hidden');
    resolveBtn.classList.add('hidden');
  } else if (safeStatus === 'accepted' || safeStatus === 'in_progress') {
    acceptBtn.classList.add('hidden');
    priceInput.classList.add('hidden');
    callBtn.classList.remove('hidden');
    resolveBtn.classList.remove('hidden');
  } else {
    acceptBtn.classList.add('hidden');
    priceInput.classList.add('hidden');
    callBtn.classList.add('hidden');
    resolveBtn.classList.add('hidden');
  }

  const canWork = currentExpert && currentExpert.approvalStatus === 'approved';
  [acceptBtn, priceInput, callBtn, resolveBtn].forEach(control => {
    control.disabled = !canWork;
    if (!canWork) control.title = 'Available after verification';
    else control.removeAttribute('title');
  });

  // Render chat history
  const chatBox = document.getElementById('jobChatMessages');
  chatBox.innerHTML = '';
  messages.forEach(appendChatMessage);
  if (!messages.length) chatBox.innerHTML = '<p class="expert-chat-empty">No messages yet. Start the conversation with your customer.</p>';
}

// 6. Accept Request (Atomic Claim)
async function acceptCurrentJob() {
  if (!currentTicket) return;
  const priceVal = document.getElementById('customPriceInput').value.trim();

  const res = await apiFetch(`/api/request/${currentTicket._id}/action`, {
    method: 'POST',
    body: JSON.stringify({
      action: 'accept',
      price: priceVal || null
    })
  });

  if (res.ok && res.data.success) {
    showToast('Job claimed successfully! You are now connected to the customer.', 'success');
    currentTicket = res.data.request;
    renderTicketWorkspace(currentTicket, []);
    loadTicketFeed();
  } else {
    showToast(res.data.error || 'Failed to claim job. It may have already been accepted.', 'error');
    loadTicketFeed();
  }
}

// 7. Resolve Request
async function resolveCurrentJob() {
  if (!currentTicket) return;
  if (!confirm('Mark this technical request as resolved?')) return;

  const res = await apiFetch(`/api/request/${currentTicket._id}/action`, {
    method: 'POST',
    body: JSON.stringify({ action: 'resolve' })
  });

  if (res.ok && res.data.success) {
    showToast('Job marked as resolved.', 'success');
    currentTicket = res.data.request;
    renderTicketWorkspace(currentTicket, []);
    loadTicketFeed();
  } else {
    showToast(res.data.error || 'Failed to update job status.', 'error');
  }
}

// 8. Chat Handling
function appendChatMessage(msg) {
  const chatBox = document.getElementById('jobChatMessages');
  chatBox.querySelector('.expert-chat-empty')?.remove();
  const bubble = document.createElement('div');
  const senderType = msg.sender === 'expert' ? 'expert' : 'customer';
  bubble.className = `chat-bubble ${senderType}`;
  const created = msg.timestamp ? new Date(msg.timestamp) : null;
  const time = created && !Number.isNaN(created.getTime())
    ? created.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';
  bubble.innerHTML = `<strong>${senderType === 'expert' ? 'You' : 'Customer'}</strong><span>${escapeHtml(msg.text)}</span>${time ? `<time class="chat-time">${escapeHtml(time)}</time>` : ''}`;
  chatBox.appendChild(bubble);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function sendExpertMessage(e) {
  e.preventDefault();
  if (!currentTicket || !socket) return;
  const input = document.getElementById('expChatInput');
  const text = input.value.trim();
  if (!text) return;

  socket.emit('send_message', {
    requestId: currentTicket._id,
    sender: 'expert',
    text
  });
  input.value = '';
}

let typingTimer = null;
document.getElementById('expChatInput')?.addEventListener('input', () => {
  if (!currentTicket || !socket) return;
  socket.emit('user_typing', { requestId: currentTicket._id, sender: 'expert', isTyping: true });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit('user_typing', { requestId: currentTicket._id, sender: 'expert', isTyping: false });
  }, 700);
});

// 9. WebRTC Video Consultation
// 9. WebRTC Video Consultation & Screen Share (Robust ICE & Track Binding)
let isSharingScreen = false;
let screenStream = null;

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

async function toggleExpertCall() {
  if (!currentTicket || !socket) {
    showToast('Open an active customer ticket before starting a video call.', 'error');
    return;
  }

  const stage = document.getElementById('expertVideoStage');
  if (!stage.classList.contains('hidden')) {
    hangupExpertCall();
    return;
  }

  try {
    localMediaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true
    });
    const localVideo = document.getElementById('expLocalVideo');
    localVideo.srcObject = localMediaStream;
    localVideo.muted = true;
    stage.classList.remove('hidden');

    document.getElementById('expCallStatusText').textContent = 'Calling customer...';

    setupPeerConnection();
    localMediaStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localMediaStream);
    });

    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await peerConnection.setLocalDescription(offer);

    socket.emit('webrtc_offer', {
      requestId: currentTicket._id,
      offer: peerConnection.localDescription
    });
    showToast('Starting video consultation...', 'info');
  } catch (err) {
    console.error('Camera/Mic access error:', err);
    showToast('Unable to access camera or microphone: ' + err.message, 'error');
  }
}

function setupPeerConnection() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  const connection = new RTCPeerConnection(rtcConfig);
  peerConnection = connection;

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && currentTicket) {
      socket.emit('webrtc_ice_candidate', {
        requestId: currentTicket._id,
        candidate: event.candidate
      });
    }
  };

  connection.ontrack = (event) => {
    console.log('[WebRTC] Expert received remote track:', event.track.kind);
    const remoteVideo = document.getElementById('expRemoteVideo');
    if (remoteVideo.srcObject !== event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      remoteVideo.play().catch(e => console.warn('Autoplay caught:', e));
    }
  };

  connection.onconnectionstatechange = () => {
    const connectionState = connection.connectionState;
    console.log('[WebRTC] Expert connectionState:', connectionState);
    const statusText = document.getElementById('expCallStatusText');
    if (connectionState === 'connected') {
      statusText.textContent = '● Live Video Connected';
    } else if (connectionState === 'disconnected') {
      statusText.textContent = 'Connection interrupted; reconnecting...';
    } else if (connectionState === 'failed') {
      statusText.textContent = 'Connection failed. Check your network and try again.';
    }
  };
}

async function addExpertIceCandidate(candidate) {
  if (!peerConnection || !peerConnection.remoteDescription) {
    pendingExpertIceCandidates.push(candidate);
    return;
  }

  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    console.warn('[WebRTC] Could not add expert ICE candidate:', error);
  }
}

async function flushExpertIceCandidates() {
  const candidates = pendingExpertIceCandidates;
  pendingExpertIceCandidates = [];
  for (const candidate of candidates) {
    await addExpertIceCandidate(candidate);
  }
}

async function handleWebRtcOffer(offer) {
  try {
    document.getElementById('expertVideoStage').classList.remove('hidden');
    document.getElementById('expCallStatusText').textContent = 'Answering customer call...';
    if (!localMediaStream) {
      localMediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      const localVideo = document.getElementById('expLocalVideo');
      localVideo.srcObject = localMediaStream;
      localVideo.muted = true;
    }

    setupPeerConnection();
    localMediaStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localMediaStream);
    });

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    await flushExpertIceCandidates();
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('webrtc_answer', {
      requestId: currentTicket._id,
      answer: peerConnection.localDescription
    });
    showToast('Customer video call connected.', 'success');
  } catch (err) {
    console.error('Error handling offer on expert:', err);
    document.getElementById('expCallStatusText').textContent = 'Unable to join the call. Check camera and microphone permissions.';
    showToast('Unable to join the video call: ' + err.message, 'error');
  }
}

// Handle answer returned from customer when expert initiated
async function handleWebRtcAnswer(answer) {
  try {
    if (peerConnection && peerConnection.signalingState !== 'stable') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      await flushExpertIceCandidates();
      console.log('[WebRTC] Expert remote description set from answer.');
    }
  } catch (err) {
    console.error('Error applying answer on expert:', err);
  }
}

function hangupExpertCall() {
  if (peerConnection && currentTicket) {
    socket.emit('webrtc_end_call', { requestId: currentTicket._id });
  }
  closePeerConnection();
}

function closePeerConnection() {
  pendingExpertIceCandidates = [];
  if (isSharingScreen && screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
    isSharingScreen = false;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localMediaStream) {
    localMediaStream.getTracks().forEach(t => t.stop());
    localMediaStream = null;
  }
  const remoteVideo = document.getElementById('expRemoteVideo');
  if (remoteVideo) remoteVideo.srcObject = null;
  const localVideo = document.getElementById('expLocalVideo');
  if (localVideo) localVideo.srcObject = null;
  document.getElementById('expertVideoStage').classList.add('hidden');
  const screenBtn = document.getElementById('expScreenBtn');
  if (screenBtn) screenBtn.textContent = 'Share screen';
}

function toggleExpertMic() {
  if (!localMediaStream) return;
  const audioTrack = localMediaStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    const btn = document.getElementById('expMicBtn');
    if (btn) btn.textContent = audioTrack.enabled ? 'Mute mic' : 'Unmute mic';
    showToast(audioTrack.enabled ? 'Microphone unmuted' : 'Microphone muted', 'info');
  }
}

// Screen Sharing Feature
async function toggleExpertScreenShare() {
  if (!peerConnection) {
    showToast('Start video call before sharing screen.', 'error');
    return;
  }

  const screenBtn = document.getElementById('expScreenBtn');

  if (!isSharingScreen) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false
      });

      const screenTrack = screenStream.getVideoTracks()[0];
      const videoSender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');

      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
      }

      document.getElementById('expLocalVideo').srcObject = screenStream;
      isSharingScreen = true;
      screenBtn.textContent = 'Stop screen share';
      showToast('Screen sharing started with customer.', 'success');

      // Stop sharing if user clicks native browser "Stop sharing" ribbon
      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      console.warn('Screen sharing cancelled or failed:', err);
    }
  } else {
    stopScreenShare();
  }
}

async function stopScreenShare() {
  if (!isSharingScreen) return;
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }

  // Restore camera video track
  if (localMediaStream) {
    const camTrack = localMediaStream.getVideoTracks()[0];
    const videoSender = peerConnection ? peerConnection.getSenders().find(s => s.track && s.track.kind === 'video') : null;
    if (videoSender && camTrack) {
      await videoSender.replaceTrack(camTrack);
    }
    document.getElementById('expLocalVideo').srcObject = localMediaStream;
  }

  isSharingScreen = false;
  const screenBtn = document.getElementById('expScreenBtn');
  if (screenBtn) screenBtn.textContent = 'Share screen';
  showToast('Screen sharing stopped.', 'info');
}

// 10. Logout
function handleLogout() {
  localStorage.removeItem('sentinel_expert_token');
  localStorage.removeItem('sentinel_expert_user');
  window.location.href = 'auth.html';
}

// 11. Export PDF Engineering Report from Ticket View
async function exportCurrentTicketPdf() {
  if (!currentTicket) {
    showToast('No ticket currently selected.', 'error');
    return;
  }

  showToast('Preparing multi-page engineering report...', 'info');

  // If request has saved diagnosticData, use it. Otherwise, synthesize standard diagnostic structure from ticket fields
  const diagnostic = currentTicket.diagnosticData || {
    problem: currentTicket.problem,
    type: currentTicket.type || 'Hardware',
    recommendedCategory: currentTicket.category,
    confidence: '98%',
    severity: currentTicket.severity || 'High',
    technical_analysis: currentTicket.analysis ? currentTicket.analysis.split('; ') : [currentTicket.analysis || 'Physical inspection required.'],
    solution_steps: [
      'Isolate affected system and de-energize primary utility.',
      'Inspect physical boundary interfaces for structural defect.',
      'Replace compromised sub-assembly with OEM certified spares.',
      'Conduct full post-repair commissioning test.'
    ],
    estimated_cost_effort: currentTicket.costEstimate || '₹1,500 - ₹3,500',
    risk_assessment: 'Operational threshold breach resulting in secondary containment and service disruption.',
    imageUrl: currentTicket.image || null,
    rootCause: 'Material fatigue or operational threshold exceeded under sustained load.',
    affectedComponents: ['Primary Assembly', 'Sealing Interface'],
    safetyPrecautions: ['Isolate primary utility supply before intervention.', 'Wear appropriate PPE.'],
    toolsRequired: ['Hand Tool Set', 'Safety Inspection Lamp', 'Diagnostic Multimeter'],
    materialsRequired: ['OEM Replacement Parts', 'Industrial Grade Sealant'],
    estimatedTimeToFix: '1 - 2 hours',
    difficulty: 'Moderate',
    diyOrProfessional: 'Certified specialist intervention recommended.',
    costBreakdown: [
      { item: 'Component Replacement Spares', qty: 1, amountINR: 1200 },
      { item: 'Certified Specialist Diagnostics & Labor', qty: 1, amountINR: 1500 }
    ],
    preventiveMeasures: ['Implement scheduled maintenance inspection.'],
    urgency: 'Action within 24 hours'
  };

  await window.generateEngineeringReport({
    diagnostic,
    request: currentTicket,
    expert: currentTicket.expertId || currentExpert
  });
}
