// Sentinel Customer Dashboard & Consultation Controller
let globalDiagnosticData = null;
let currentRequestId = null;
let currentCustomerToken = null;
let currentAssignedExpert = null;
let activeRequestObj = null;

let socket = null;
let peerConnection = null;
let localMediaStream = null;
let pendingCustomerIceCandidates = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initCustomerSocket();
  setupInputHandlers();
  restoreActiveCustomerSession();
});

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// 1. Socket Lifecycle & WebRTC
function initCustomerSocket() {
  socket = io();

  socket.on('request_updated', (data) => {
    if (activeRequestObj && data.request && data.request._id === activeRequestObj._id) {
      activeRequestObj = data.request;
      if (data.expert) currentAssignedExpert = data.expert;
      updateConsultationUI(activeRequestObj);
      showToast(`Request status updated: ${data.request.status.toUpperCase()}`, 'info');
    }
  });

  socket.on('receive_message', (msg) => {
    if (activeRequestObj && msg.requestId === activeRequestObj._id) {
      appendMarketplaceMessage(msg);
    }
  });

  // WebRTC Signals
  socket.on('webrtc_offer', async (data) => {
    if (!data || !activeRequestObj || String(data.requestId) !== String(activeRequestObj._id)) return;
    await handleIncomingWebRtcOffer(data.offer);
  });
  socket.on('webrtc_answer', async (data) => {
    if (!data || !activeRequestObj || String(data.requestId) !== String(activeRequestObj._id)) return;
    if (peerConnection && data.answer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      await flushCustomerIceCandidates();
    }
  });
  socket.on('webrtc_ice_candidate', async (data) => {
    if (!data || !activeRequestObj || String(data.requestId) !== String(activeRequestObj._id) || !data.candidate) return;
    await addCustomerIceCandidate(data.candidate);
  });
  socket.on('webrtc_end_call', () => {
    closeCustomerCall();
    showToast('Specialist ended the video call.', 'info');
  });
}

// 2. Setup Input Handlers (Drag & Drop, Camera Upload, Analysis)
function setupInputHandlers() {
  const imageInput = document.getElementById('imageInput');
  const imgPreviewContainer = document.getElementById('imagePreviewContainer');
  const imgPreview = document.getElementById('imagePreview');
  const uploadDropzone = document.getElementById('uploadDropzone');
  const clearImageBtn = document.getElementById('clearImageBtn');

  imageInput.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        imgPreview.src = e.target.result;
        imgPreviewContainer.classList.remove('hidden');
        uploadDropzone.classList.add('hidden');
      };
      reader.readAsDataURL(file);
    }
  });

  clearImageBtn.addEventListener('click', () => {
    imageInput.value = '';
    imgPreview.src = '';
    imgPreviewContainer.classList.add('hidden');
    uploadDropzone.classList.remove('hidden');
  });

  document.getElementById('analyzeBtn').addEventListener('click', runDiagnostics);
  document.getElementById('requestExpertBtn').addEventListener('click', requestSpecialistDispatch);
  document.getElementById('closeModalBtn').addEventListener('click', () => {
    document.getElementById('expertModal').classList.add('hidden');
  });

  // Chat Q&A
  document.getElementById('chatSendBtn').addEventListener('click', () => {
    const text = document.getElementById('chatInput').value.trim();
    if (text) sendAiChat(text);
  });
  document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const text = e.target.value.trim();
      if (text) sendAiChat(text);
    }
  });
  document.getElementById('questionSelect')?.addEventListener('change', (e) => {
    if (e.target.value) {
      sendAiChat(e.target.value);
      e.target.selectedIndex = 0;
    }
  });

  // Direct Specialist Chat Bar
  document.getElementById('mpSendBtn').addEventListener('click', sendMarketplaceMsg);
  document.getElementById('mpChatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMarketplaceMsg();
  });

  // PDF Export
  document.getElementById('downloadPdfBtn').addEventListener('click', exportPdfReport);
}

// 3. Run Universal Diagnostics with Staged Progress Indicator
async function runDiagnostics() {
  const textVal = document.getElementById('textInput').value.trim();
  const fileVal = document.getElementById('imageInput').files[0];
  const errorMsg = document.getElementById('errorMsg');

  if (!textVal && !fileVal) {
    errorMsg.classList.remove('hidden');
    return;
  }
  errorMsg.classList.add('hidden');

  resetCustomerRequestPanel();
  // Step Tracker
  setStepProgress(2);

  document.getElementById('resultCard').classList.add('hidden');
  const hud = document.getElementById('loadingHUD');
  hud.classList.remove('hidden');

  const titleEl = document.getElementById('loadingStageTitle');
  const percentEl = document.getElementById('loadingPercentText');
  const barEl = document.getElementById('loadingProgressBar');

  // Staged progress indicators: "Reading input", "Identifying fault", "Estimating cost", "Preparing report"
  const stages = [
    { title: "Reading intake parameters...", pct: 25 },
    { title: "Identifying fault signatures...", pct: 50 },
    { title: "Estimating cost & material requirements...", pct: 75 },
    { title: "Preparing certified engineering report...", pct: 95 }
  ];

  let currentStage = 0;
  titleEl.textContent = stages[0].title;
  percentEl.textContent = `${stages[0].pct}%`;
  barEl.style.width = `${stages[0].pct}%`;

  const stageInterval = setInterval(() => {
    currentStage++;
    if (currentStage < stages.length) {
      titleEl.textContent = stages[currentStage].title;
      percentEl.textContent = `${stages[currentStage].pct}%`;
      barEl.style.width = `${stages[currentStage].pct}%`;
    }
  }, 220);

  const formData = new FormData();
  if (fileVal) formData.append('imageInput', fileVal);
  if (textVal) formData.append('textInput', textVal);

  try {
    const res = await apiFetch('/analyze', {
      method: 'POST',
      body: formData
    });

    if (res.ok && res.data.success) {
      renderDiagnosticCard(res.data.data);
    } else {
      showToast('Unable to complete the diagnosis. Check the image or description and retry.', 'error');
    }
  } catch (error) {
    showToast('Unable to reach the diagnosis service. Please retry.', 'error');
  } finally {
    clearInterval(stageInterval);
    hud.classList.add('hidden');
  }
}

function resetCustomerRequestPanel() {
  currentRequestId = null;
  activeRequestObj = null;
  currentAssignedExpert = null;
  document.getElementById('sideTicketId').textContent = 'No ticket yet';
  document.getElementById('sideOpenConsultationBtn').classList.add('hidden');
  document.getElementById('sideExpertCard').classList.add('hidden');
  document.getElementById('sideEscrowStatus').textContent = 'UNPAID';
  document.getElementById('sideEscrowStatus').className = 'status-chip chip-pending';
  document.getElementById('sideEscrowDesc').textContent = 'No ticket yet.';
  document.getElementById('escrowCard').classList.add('hidden');
  document.getElementById('escrowStatusBadge').textContent = 'UNPAID';
  document.getElementById('escrowStatusBadge').className = 'status-chip chip-pending';
  document.getElementById('escrowDescription').textContent = 'No ticket yet.';
  document.getElementById('depositEscrowBtn').classList.remove('hidden');
  document.getElementById('releaseEscrowBtn').classList.add('hidden');
}

function renderDiagnosticCard(data) {
  const evidence = [
    data.problem,
    data.rootCause,
    data.analysis,
    data.technical_analysis,
    data.affectedComponents,
    data.safetyPrecautions,
    data.toolsRequired,
    data.materialsRequired
  ].flat().filter(Boolean).join(' ');
  const recommendedCategory = data.recommendedCategory || data.category || detectCategoryFromProblem(evidence, data.type || data.domain);
  data.recommendedCategory = recommendedCategory;
  globalDiagnosticData = data;
  const card = document.getElementById('resultCard');
  card.classList.remove('hidden');

  document.getElementById('resProblem').textContent = data.title || data.problem;
  const isAiResult = data.aiSource === 'gemini';
  const sourceBadge = document.getElementById('resAiSource');
  sourceBadge.textContent = isAiResult ? 'Analyzed by AI' : 'Offline estimate';
  document.getElementById('resConfidenceLabel').textContent = isAiResult ? 'Confidence' : 'Estimated confidence (offline)';
  const existingRetry = document.getElementById('resAiRetryControls');
  if (existingRetry) existingRetry.remove();
  if (!isAiResult) {
    const reasons = {
      temporarily_busy: 'AI temporarily busy',
      configuration_error: 'AI key not configured or invalid (admin)',
      quota_exhausted: 'AI quota reached',
      no_connection: 'No connection to AI service'
    };
    const controls = document.createElement('div');
    controls.id = 'resAiRetryControls';
    const reason = document.createElement('p');
    reason.textContent = reasons[data.aiError] || 'No connection to AI service';
    const retryButton = document.createElement('button');
    retryButton.className = 'btn btn-secondary btn-small';
    retryButton.type = 'button';
    retryButton.textContent = 'Re-run with AI';
    retryButton.addEventListener('click', runDiagnostics);
    controls.append(reason, retryButton);
    sourceBadge.insertAdjacentElement('afterend', controls);
  }
  document.getElementById('resRootCauseText').textContent = data.rootCause || 'Operating threshold exceeded under operational stress.';
  document.getElementById('resRecommendedCategory').textContent = recommendedCategory || 'Specialist';
  const needsMoreEvidence = recommendedCategory === 'Not determined';
  const dispatchButton = document.getElementById('requestExpertBtn');
  const actionNote = document.getElementById('diagnosisActionNote');
  dispatchButton.disabled = needsMoreEvidence;
  dispatchButton.title = needsMoreEvidence ? 'A specialist cannot be safely matched until the issue is identified.' : '';
  actionNote.classList.toggle('hidden', !needsMoreEvidence);
  actionNote.textContent = needsMoreEvidence
    ? 'A specialist cannot be matched reliably yet. Add a text description or retry with a clearer photo.'
    : '';

  // Severity Level & Severity Meter Band Settling in 500ms
  const severity = String(data.severity || 'Medium').toUpperCase();
  const sevTitle = document.getElementById('resSeverityTitle');
  const sevBand = document.getElementById('severityBand');

  sevTitle.textContent = `${severity} SEVERITY`;
  if (severity === 'CRITICAL' || severity === 'HIGH') {
    sevBand.style.backgroundColor = 'var(--status-danger-subtle)';
    sevBand.style.borderLeftColor = 'var(--status-danger)';
  } else if (severity === 'LOW') {
    sevBand.style.backgroundColor = 'var(--status-resolved-subtle)';
    sevBand.style.borderLeftColor = 'var(--status-resolved)';
  } else {
    sevBand.style.backgroundColor = 'var(--status-pending-subtle)';
    sevBand.style.borderLeftColor = 'var(--status-pending)';
  }

  // 7. Animated Confidence Bar (fills from 0 to value in 600ms)
  const confFill = document.getElementById('confidenceBarFill');
  const parsedConfidence = Number.parseInt(String(data.confidence ?? 0).replace(/[^0-9]/g, ''), 10);
  const confNum = Number.isFinite(parsedConfidence) ? Math.min(100, Math.max(0, parsedConfidence)) : 0;
  confFill.style.width = '0%';
  setTimeout(() => {
    confFill.style.width = `${confNum}%`;
  }, 50);

  // Key numbers count-up once over 600ms
  const confEl = document.getElementById('resConfidence');
  if (window.animateValue) {
    window.animateValue(confEl, 0, confNum, 600, '', '%');
  } else {
    confEl.textContent = `${confNum}%`;
  }

  // Cost Estimate
  document.getElementById('resCostEstimate').textContent = data.estimated_cost_effort || '₹1,500 - ₹3,500';
  document.getElementById('resUrgency').textContent = data.urgency || 'Fix within 24h';
  document.getElementById('resDifficulty').textContent = data.difficulty || 'Moderate';

  const renderList = (id, items) => {
    const el = document.getElementById(id);
    el.innerHTML = '';
    (items || []).forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      el.appendChild(li);
    });
  };

  const observations = [...(data.technical_analysis || [])];
  if (data.extractedText) observations.unshift(`Visible text: ${data.extractedText}`);
  renderList('resDocs', observations);
  renderList('resSteps', data.solution_steps);

  if (data.type === 'Software' || data.type === 'Cybersecurity') {
    document.getElementById('softwareCodeGrid').classList.remove('hidden');
    document.getElementById('resFixedCode').textContent = data.correctedCodeSnippet || data.fixed_code || '// Bounded execution checks deployed.';
  } else {
    document.getElementById('softwareCodeGrid').classList.add('hidden');
  }

  // Populate Inquiries
  pushAiChat(`Diagnosis ready: Fault "${data.problem}" classified at ${data.severity} severity. Check remediation steps or dispatch a specialist.`, 'system');
}

// 4. Request Specialist Dispatch (POST /api/customer/request)
async function requestSpecialistDispatch() {
  if (!globalDiagnosticData) return;

  setStepProgress(2);

  // Generate or retrieve persistent customer token
  let token = localStorage.getItem('sentinel_customer_token');
  if (!token) {
    token = `cust_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('sentinel_customer_token', token);
  }
  currentCustomerToken = token;

  const payload = {
    problem: globalDiagnosticData.problem,
    type: globalDiagnosticData.type,
    category: globalDiagnosticData.recommendedCategory,
    severity: globalDiagnosticData.severity,
    analysis: (globalDiagnosticData.technical_analysis || []).join('; '),
    image: globalDiagnosticData.imageUrl || null,
    costEstimate: globalDiagnosticData.estimated_cost_effort || '₹1,500 - ₹3,500',
    customerToken: token,
    customerName: 'Verified Customer',
    diagnosticData: globalDiagnosticData
  };

  openConsultationModal();
  document.getElementById('reqStatus').textContent = 'Submitting request and notifying certified specialists...';

  const res = await apiFetch('/api/customer/request', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (res.ok && res.data.success) {
    activeRequestObj = res.data.request;
    currentAssignedExpert = res.data.assignedExpert;
    currentRequestId = activeRequestObj._id;

    socket.emit('join_request', currentRequestId);
    updateConsultationUI(activeRequestObj);
    showToast('Request submitted to specialist network.', 'success');
  } else {
    document.getElementById('reqStatus').textContent = `Submission failed: ${res.data.error || 'Server error'}`;
    showToast(res.data.error || 'Failed to submit request.', 'error');
  }
}

// 5. Consultation & Escrow Modal Manager
function openConsultationModal() {
  openModal('expertModal');
}

function viewActiveRequestModal() {
  if (activeRequestObj) {
    openConsultationModal();
    updateConsultationUI(activeRequestObj);
  }
}

function updateCustomerRequestEntryPoints(req) {
  const banner = document.getElementById('restoredRequestBanner');
  const openButton = document.getElementById('sideOpenConsultationBtn');
  const status = String(req.status || 'pending').toLowerCase();
  const hasAcceptedConsultation = status === 'accepted' || status === 'in_progress';
  const progressStep = status === 'resolved' ? 4 : hasAcceptedConsultation ? 3 : 2;

  banner.classList.toggle('hidden', hasAcceptedConsultation || status === 'resolved');
  openButton.classList.toggle('hidden', !hasAcceptedConsultation);
  document.getElementById('sideTicketId').textContent = `Ticket #${String(req._id).slice(-6)} • ${status.replace('_', ' ').toUpperCase()}`;
  document.getElementById('restoredProblemTitle').textContent = `${req.problem} (${status.toUpperCase()})`;
  setStepProgress(progressStep);
}

function updateConsultationUI(req) {
  updateCustomerRequestEntryPoints(req);
  document.getElementById('modalReqTitle').textContent = req.problem;
  document.getElementById('modalReqSub').textContent = `Ticket #${req._id.slice(-6)} • Category: ${req.category}`;
  document.getElementById('reqCategoryPill').textContent = req.category;

  const badge = document.getElementById('reqStatusBadge');
  badge.textContent = req.status.toUpperCase();
  badge.className = `badge ${req.status === 'resolved' ? 'badge-resolved' : (req.status === 'accepted' ? 'badge-accepted' : 'badge-pending')}`;

  const expertCard = document.getElementById('expertInfoSection');
  const escrowCard = document.getElementById('escrowCard');
  const chatWindow = document.getElementById('marketplaceChat');
  const reviewPanel = document.getElementById('reviewPanel');
  const statusText = document.getElementById('reqStatus');

  if (req.status === 'pending') {
    statusText.textContent = `⏳ Sent to active ${req.category}s. Waiting for a specialist to claim the ticket...`;
    expertCard.classList.add('hidden');
    escrowCard.classList.add('hidden');
    chatWindow.classList.add('hidden');
    reviewPanel.classList.add('hidden');
  } else if (req.status === 'accepted' || req.status === 'in_progress') {
    setStepProgress(3);
    expertCard.classList.remove('hidden');
    escrowCard.classList.remove('hidden');
    chatWindow.classList.remove('hidden');
    reviewPanel.classList.add('hidden');

    const exp = req.expertId || currentAssignedExpert;
    if (exp) {
      document.getElementById('expName').textContent = exp.name || 'Verified Specialist';
      document.getElementById('expSkills').textContent = `${exp.category} • ${exp.serviceArea || 'Certified'}`;
      document.getElementById('expRating').textContent = `★ ${Number(exp.rating || 5).toFixed(1)}`;
      document.getElementById('expQuotePrice').textContent = req.customPrice ? `Quote: ${req.customPrice}` : 'Standard Rate: $50';
      statusText.textContent = `✅ Connected with ${exp.name}. You can chat or start a video consultation.`;
    }

    // Escrow Status
    const escBadge = document.getElementById('escrowStatusBadge');
    escBadge.textContent = req.paymentStatus ? req.paymentStatus.toUpperCase() : 'UNPAID';
    escBadge.className = `badge ${req.paymentStatus === 'released' ? 'badge-resolved' : (req.paymentStatus === 'escrow_held' ? 'badge-accepted' : 'badge-pending')}`;

    const depositBtn = document.getElementById('depositEscrowBtn');
    const releaseBtn = document.getElementById('releaseEscrowBtn');

    if (req.paymentStatus === 'escrow_held') {
      depositBtn.classList.add('hidden');
      releaseBtn.classList.remove('hidden');
      document.getElementById('escrowDescription').textContent = 'Funds ($50.00) are securely locked in Sentinel Escrow. Release payment when the issue is resolved.';
      document.getElementById('custCallBtn').classList.remove('hidden');
    } else if (req.paymentStatus === 'released') {
      depositBtn.classList.add('hidden');
      releaseBtn.classList.add('hidden');
      document.getElementById('escrowDescription').textContent = 'Payment has been verified and released to the specialist.';
    } else {
      depositBtn.classList.remove('hidden');
      releaseBtn.classList.add('hidden');
    }
  } else if (req.status === 'resolved') {
    setStepProgress(4);
    statusText.textContent = '🎉 This service ticket has been resolved.';
    reviewPanel.classList.remove('hidden');
    document.getElementById('custCallBtn').classList.add('hidden');
  }
}

// 6. Escrow Payment Actions
async function depositEscrow() {
  if (!activeRequestObj) return;

  const res = await apiFetch(`/api/request/${activeRequestObj._id}/pay`, {
    method: 'POST',
    body: JSON.stringify({ amount: 50 })
  });

  if (res.ok && res.data.success) {
    showToast('Escrow deposit secured ($50.00 held). Invoice generated.', 'success');
    activeRequestObj = res.data.request;
    updateConsultationUI(activeRequestObj);
  } else {
    showToast(res.data.error || 'Escrow deposit failed.', 'error');
  }
}

async function releaseEscrow() {
  if (!activeRequestObj) return;
  if (!confirm('Confirm releasing the $50 escrow payment to the specialist?')) return;

  const res = await apiFetch(`/api/request/${activeRequestObj._id}/release-payment`, {
    method: 'POST'
  });

  if (res.ok && res.data.success) {
    showToast('Payment released to specialist. Job marked resolved.', 'success');
    activeRequestObj = res.data.request;
    updateConsultationUI(activeRequestObj);
  } else {
    showToast(res.data.error || 'Failed to release payment.', 'error');
  }
}

async function submitReview() {
  if (!activeRequestObj) return;
  const rating = document.getElementById('ratingScore').value;
  const comment = document.getElementById('reviewComment').value.trim();

  const res = await apiFetch(`/api/request/${activeRequestObj._id}/rate`, {
    method: 'POST',
    body: JSON.stringify({ rating, comment, customerName: 'Customer' })
  });

  if (res.ok && res.data.success) {
    showToast('Thank you! Your rating has been recorded.', 'success');
    document.getElementById('reviewPanel').classList.add('hidden');
  } else {
    showToast(res.data.error || 'Failed to submit rating.', 'error');
  }
}

// 7. Direct Specialist Chat
function sendMarketplaceMsg() {
  const input = document.getElementById('mpChatInput');
  const text = input.value.trim();
  if (!text || !activeRequestObj || !socket) return;

  socket.emit('send_message', {
    requestId: activeRequestObj._id,
    sender: 'customer',
    text
  });
  input.value = '';
}

function appendMarketplaceMessage(msg) {
  const box = document.getElementById('mpChatHistory');
  const bubble = document.createElement('div');
  const senderType = msg.sender === 'customer' ? 'customer' : 'expert';
  bubble.className = `chat-bubble ${senderType}`;
  bubble.innerHTML = `<strong>${senderType === 'customer' ? 'You' : 'Specialist'}:</strong> ${escapeHtml(msg.text)}`;
  box.appendChild(bubble);
  box.scrollTop = box.scrollHeight;
}

// 8. Session Restoration across Page Reloads
async function restoreActiveCustomerSession() {
  const token = localStorage.getItem('sentinel_customer_token');
  if (!token) return;

  const res = await apiFetch(`/api/customer/active-request?token=${token}`);
  if (res.ok && res.data.success && res.data.request) {
    activeRequestObj = res.data.request;
    currentAssignedExpert = res.data.request.expertId;
    currentRequestId = activeRequestObj._id;

    socket.emit('join_request', currentRequestId);

    updateCustomerRequestEntryPoints(activeRequestObj);

    // Prepopulate chat messages
    const box = document.getElementById('mpChatHistory');
    box.innerHTML = '';
    (res.data.messages || []).forEach(appendMarketplaceMessage);
  }
}

// 9. WebRTC Video Calling & Screen Sharing (Customer side)
let custSharingScreen = false;
let custScreenStream = null;

const rtcConfigCust = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

async function startCustomerCall() {
  if (!activeRequestObj || !socket) {
    showToast('An active specialist request is required to start a video call.', 'error');
    return;
  }

  const stage = document.getElementById('custVideoStage');
  if (!stage.classList.contains('hidden')) {
    hangupCustomerCall();
    return;
  }

  try {
    localMediaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true
    });
    const localVideo = document.getElementById('custLocalVideo');
    localVideo.srcObject = localMediaStream;
    localVideo.muted = true;
    stage.classList.remove('hidden');

    document.getElementById('custCallStatusText').textContent = 'Calling specialist...';

    initPeerConnection();
    localMediaStream.getTracks().forEach(t => {
      peerConnection.addTrack(t, localMediaStream);
    });

    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await peerConnection.setLocalDescription(offer);

    socket.emit('webrtc_offer', {
      requestId: activeRequestObj._id,
      offer: peerConnection.localDescription
    });
    showToast('Calling specialist...', 'info');
  } catch (err) {
    console.error('Camera/Mic permission error:', err);
    showToast('Unable to access camera or microphone: ' + err.message, 'error');
  }
}

function initPeerConnection() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  const connection = new RTCPeerConnection(rtcConfigCust);
  peerConnection = connection;

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && activeRequestObj) {
      socket.emit('webrtc_ice_candidate', {
        requestId: activeRequestObj._id,
        candidate: event.candidate
      });
    }
  };

  connection.ontrack = (event) => {
    console.log('[WebRTC] Customer received remote track:', event.track.kind);
    const remoteVideo = document.getElementById('custRemoteVideo');
    if (remoteVideo.srcObject !== event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      remoteVideo.play().catch(e => console.warn('Autoplay caught:', e));
    }
  };

  connection.onconnectionstatechange = () => {
    const connectionState = connection.connectionState;
    console.log('[WebRTC] Customer connectionState:', connectionState);
    const statusText = document.getElementById('custCallStatusText');
    if (connectionState === 'connected') {
      statusText.textContent = '● Live Video Connected';
    } else if (connectionState === 'disconnected') {
      statusText.textContent = 'Connection interrupted; reconnecting...';
    } else if (connectionState === 'failed') {
      statusText.textContent = 'Connection failed. Check your network and try again.';
    }
  };
}

async function addCustomerIceCandidate(candidate) {
  if (!peerConnection || !peerConnection.remoteDescription) {
    pendingCustomerIceCandidates.push(candidate);
    return;
  }

  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    console.warn('[WebRTC] Could not add customer ICE candidate:', error);
  }
}

async function flushCustomerIceCandidates() {
  const candidates = pendingCustomerIceCandidates;
  pendingCustomerIceCandidates = [];
  for (const candidate of candidates) {
    await addCustomerIceCandidate(candidate);
  }
}

async function handleIncomingWebRtcOffer(offer) {
  try {
    document.getElementById('custVideoStage').classList.remove('hidden');
    document.getElementById('custCallStatusText').textContent = 'Answering specialist call...';
    if (!localMediaStream) {
      localMediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      const localVideo = document.getElementById('custLocalVideo');
      localVideo.srcObject = localMediaStream;
      localVideo.muted = true;
    }

    initPeerConnection();
    localMediaStream.getTracks().forEach(t => {
      peerConnection.addTrack(t, localMediaStream);
    });

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    await flushCustomerIceCandidates();
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('webrtc_answer', {
      requestId: activeRequestObj._id,
      answer: peerConnection.localDescription
    });
    showToast('Video consultation established.', 'success');
  } catch (err) {
    console.error('Error handling incoming offer on customer:', err);
    document.getElementById('custCallStatusText').textContent = 'Unable to join the call. Check camera and microphone permissions.';
    showToast('Unable to join the video call: ' + err.message, 'error');
  }
}

function hangupCustomerCall() {
  if (peerConnection && activeRequestObj) {
    socket.emit('webrtc_end_call', { requestId: activeRequestObj._id });
  }
  closeCustomerCall();
}

function closeCustomerCall() {
  pendingCustomerIceCandidates = [];
  if (custSharingScreen && custScreenStream) {
    custScreenStream.getTracks().forEach(t => t.stop());
    custScreenStream = null;
    custSharingScreen = false;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localMediaStream) {
    localMediaStream.getTracks().forEach(t => t.stop());
    localMediaStream = null;
  }
  const remoteVideo = document.getElementById('custRemoteVideo');
  if (remoteVideo) remoteVideo.srcObject = null;
  const localVideo = document.getElementById('custLocalVideo');
  if (localVideo) localVideo.srcObject = null;
  document.getElementById('custVideoStage').classList.add('hidden');
  const screenBtn = document.getElementById('custScreenBtn');
  if (screenBtn) screenBtn.textContent = '🖥️ Share Screen';
}

function toggleCustomerMic() {
  if (!localMediaStream) return;
  const audioTrack = localMediaStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    const btn = document.getElementById('custMicBtn');
    if (btn) btn.textContent = audioTrack.enabled ? 'Mute Mic' : 'Unmute Mic';
    showToast(audioTrack.enabled ? 'Microphone unmuted' : 'Microphone muted', 'info');
  }
}

// Screen Sharing for Customer
async function toggleCustomerScreenShare() {
  if (!peerConnection) {
    showToast('Start video call before sharing screen.', 'error');
    return;
  }

  const screenBtn = document.getElementById('custScreenBtn');

  if (!custSharingScreen) {
    try {
      custScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false
      });

      const screenTrack = custScreenStream.getVideoTracks()[0];
      const videoSender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');

      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
      }

      document.getElementById('custLocalVideo').srcObject = custScreenStream;
      custSharingScreen = true;
      screenBtn.textContent = '⏹️ Stop Screen Share';
      showToast('Screen sharing started with specialist.', 'success');

      screenTrack.onended = () => {
        stopCustomerScreenShare();
      };
    } catch (err) {
      console.warn('Screen sharing cancelled or failed:', err);
    }
  } else {
    stopCustomerScreenShare();
  }
}

async function stopCustomerScreenShare() {
  if (!custSharingScreen) return;
  if (custScreenStream) {
    custScreenStream.getTracks().forEach(t => t.stop());
    custScreenStream = null;
  }

  if (localMediaStream) {
    const camTrack = localMediaStream.getVideoTracks()[0];
    const videoSender = peerConnection ? peerConnection.getSenders().find(s => s.track && s.track.kind === 'video') : null;
    if (videoSender && camTrack) {
      await videoSender.replaceTrack(camTrack);
    }
    document.getElementById('custLocalVideo').srcObject = localMediaStream;
  }

  custSharingScreen = false;
  const screenBtn = document.getElementById('custScreenBtn');
  if (screenBtn) screenBtn.textContent = '🖥️ Share Screen';
  showToast('Screen sharing stopped.', 'info');
}

// 10. AI Q&A Clarification Chat
async function sendAiChat(userQuery) {
  pushAiChat(userQuery, 'customer');
  document.getElementById('chatInput').value = '';
  document.getElementById('typingIndicator').classList.remove('hidden');

  const res = await apiFetch('/chat', {
    method: 'POST',
    body: JSON.stringify({ query: userQuery, data: globalDiagnosticData })
  });

  document.getElementById('typingIndicator').classList.add('hidden');

  if (res.ok && res.data.success) {
    pushAiChat(res.data.data.response, 'system');
  } else {
    pushAiChat('Unable to retrieve AI clarification at this time.', 'system');
  }
}

function pushAiChat(text, type) {
  const box = document.getElementById('chatHistory');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${type}`;
  bubble.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
  box.appendChild(bubble);
  box.scrollTop = box.scrollHeight;
}

function setStepProgress(stepNum) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`stepNode${i}`);
    if (el) {
      el.classList.toggle('active', i === stepNum);
      el.classList.toggle('completed', i < stepNum);
    }
  }
  const fill = document.getElementById('stepperProgressFill');
  if (fill) fill.style.width = `${((stepNum - 1) / 3) * 100}%`;
}

async function exportPdfReport() {
  if (!globalDiagnosticData) {
    showToast('No diagnostic data available to export.', 'error');
    return;
  }
  showToast('Generating official engineering report...', 'info');
  await window.generateEngineeringReport({
    diagnostic: globalDiagnosticData,
    request: activeRequestObj || {},
    expert: currentAssignedExpert || null
  });
}
