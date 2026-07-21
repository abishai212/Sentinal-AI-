// Core Global State
let globalDiagnosticData = null;
let loadingIntervalTimer = null;

// Extracted DOM Elements
const textInput = document.getElementById('textInput');
const imageInput = document.getElementById('imageInput');
const imgPreviewContainer = document.getElementById('imagePreviewContainer');
const imgPreview = document.getElementById('imagePreview');
const uploadZone = document.querySelector('.upload-zone');
const errorMsg = document.getElementById('errorMsg');
const loadingHUD = document.getElementById('loadingHUD');
const resultCard = document.getElementById('resultCard');

// Image upload preview logic
imageInput.addEventListener('change', function() {
  const file = this.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      imgPreview.src = e.target.result;
      imgPreviewContainer.classList.remove('hidden');
      uploadZone.classList.add('hidden');
    }
    reader.readAsDataURL(file);
  }
});

document.getElementById('clearImageBtn').addEventListener('click', () => {
  imageInput.value = '';
  imgPreview.src = '';
  imgPreviewContainer.classList.add('hidden');
  uploadZone.classList.remove('hidden');
});

// UI HUD Managers
const showLoading = () => {
  errorMsg.classList.add('hidden');
  resultCard.classList.add('hidden');
  loadingHUD.classList.remove('hidden');

  const animText = ["Analyzing input parameters...", "Running heuristic detection...", "Locating root cause patterns...", "Generating comprehensive solution..."];
  let c = 0;
  document.getElementById('loadingTitle').textContent = animText[c];
  
  loadingIntervalTimer = setInterval(() => {
    c++;
    if (c < animText.length) document.getElementById('loadingTitle').textContent = animText[c];
  }, 400);
};

const hideLoading = () => {
  loadingHUD.classList.add('hidden');
  if (loadingIntervalTimer) clearInterval(loadingIntervalTimer);
};

// Injection of JSON to Dashboard
const renderDiagnostic = (data) => {
  globalDiagnosticData = data; // Save full context payload
  
  // Render Badges and Titles
  document.getElementById('resType').textContent = data.type;
  document.getElementById('resProblem').textContent = data.problem;
  document.getElementById('resConfidence').textContent = data.confidence;
  
  // Severity classes handling
  const sevEl = document.getElementById('resSeverity');
  sevEl.textContent = data.severity;
  sevEl.className = data.severity.toLowerCase(); 

  // Arrays rendering
  const loadList = (id, arr) => {
    const ul = document.getElementById(id);
    ul.innerHTML = "";
    arr.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    });
  };
  loadList('resDocs', data.technical_analysis);
  loadList('resSteps', data.solution_steps);

  if (data.type === 'Software') {
    document.getElementById('hardwareMetadata').classList.add('hidden');
    document.getElementById('softwareCodeGrid').classList.remove('hidden');
    
    document.getElementById('resFixedCode').textContent = data.fixed_code;
    loadList('resOptSuggestions', data.optimization_suggestions);
    document.getElementById('resDifficulty').textContent = data.difficulty_level;
    document.getElementById('resFixTime').textContent = data.estimated_fix_time;
  } else {
    document.getElementById('softwareCodeGrid').classList.add('hidden');
    document.getElementById('hardwareMetadata').classList.remove('hidden');
    
    document.getElementById('resRisk').textContent = data.risk_assessment;
    document.getElementById('resEstimate').textContent = data.estimated_cost_effort;
  }

  resultCard.classList.remove('hidden');

  // Show the Question Menu Dropdown
  const questionSelect = document.getElementById('questionSelect');
  questionSelect.innerHTML = '<option value="" disabled selected>Select a question from the menu...</option>';
  
  const commonQuestions = [
    "How do I repair this?",
    "Why did this happen?",
    "Is it safe to ignore?",
    "Explain the risk in simpler terms."
  ];

  if (data.type === 'Software') {
    commonQuestions.push("How to optimize this?");
    commonQuestions.push("Fix my code");
  } else {
    commonQuestions.push("What tools or skills do I need?");
  }

  commonQuestions.forEach(q => {
    const opt = document.createElement('option');
    opt.value = q;
    opt.textContent = q;
    questionSelect.appendChild(opt);
  });

  document.getElementById('questionMenuContainer').classList.remove('hidden');
};

// Single Analyze Process Request
document.getElementById('analyzeBtn').addEventListener('click', async () => {
  const file = imageInput.files[0];
  const txtVal = textInput.value.trim();

  // Sniff Validation: Need at least one input
  if (!file && !txtVal) {
    errorMsg.classList.remove('hidden');
    return;
  }

  showLoading();

  // Create Universal Form Payload
  const fd = new FormData();
  if (file) fd.append('imageInput', file);       // Key matches Express route logic
  if (txtVal) fd.append('textInput', txtVal);   

  try {
    const res = await fetch('http://localhost:3000/analyze', {
      method: 'POST',
      body: fd
    });
    const json = await res.json();
    
    hideLoading();

    if (json.error) {
      alert(json.error);
      return;
    }

    renderDiagnostic(json.data);

  } catch (err) {
    hideLoading();
    console.error(err);
    alert('Backend connection aborted. Ensure the Node server is running.');
  }
});

// AI Central Chatbot
const chatHistory = document.getElementById('chatHistory');
const chatInput = document.getElementById('chatInput');
const typingIndicator = document.getElementById('typingIndicator');

const pushChat = (msg, sender) => {
  const div = document.createElement('div');
  div.className = `chat-msg ${sender}-msg`;
  div.textContent = msg;
  chatHistory.appendChild(div);
  chatHistory.scrollTop = chatHistory.scrollHeight;
};

// Boot Sequence message
setTimeout(() => pushChat("System Online. Awaiting file/text ingestion.", "sys"), 500);

const sendChatMessage = async (usrText) => {
  if (!usrText) return;
  pushChat(usrText, "user");
  chatInput.value = '';
  
  typingIndicator.classList.remove('hidden');
  chatHistory.appendChild(typingIndicator); // Move to bottom
  chatHistory.scrollTop = chatHistory.scrollHeight;

  try {
    const res = await fetch('http://localhost:3000/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: usrText, data: globalDiagnosticData })
    });
    const dataObj = await res.json();
    
    typingIndicator.classList.add('hidden');
    pushChat(dataObj.data.response, "sys");
  } catch(err) {
    typingIndicator.classList.add('hidden');
    pushChat("Core logic link detached.", "sys");
  }
};

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendChatMessage(chatInput.value.trim());
  }
});

document.getElementById('questionSelect').addEventListener('change', (e) => {
  if (e.target.value) {
    sendChatMessage(e.target.value);
    e.target.selectedIndex = 0; // Reset menu title
  }
});

// --- EXPERT MARKETPLACE LOGIC ---
let currentRequestId = null;

const socket = io();
const alertSound = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');

// Auto-join socket room on connection
socket.on('connect', () => {
  if (currentRequestId) {
    socket.emit('join_request', currentRequestId);
  }
});

const requestExpertBtn = document.getElementById('requestExpertBtn');
const expertModal = document.getElementById('expertModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const mpChatInput = document.getElementById('mpChatInput');
const mpSendBtn = document.getElementById('mpSendBtn');
const mpTypingIndicator = document.getElementById('mpTypingIndicator');

if(requestExpertBtn) {
  requestExpertBtn.addEventListener('click', async () => {
    if (!globalDiagnosticData) return;
    
    // If there is an active request in local storage, just re-open the modal
    if (currentRequestId) {
      expertModal.classList.remove('hidden');
      expertModal.style.display = 'flex';
      // Load current details
      fetch(`/api/request/${currentRequestId}`).then(r => r.json()).then(res => {
        if(res.success) updateMarketplaceUI(res.request, res.messages);
      });
      return;
    }
    
    // Show Modal
    expertModal.classList.remove('hidden');
    expertModal.style.display = 'flex'; 
    document.getElementById('expertStatusBanner').className = 'status-banner badge';
    document.getElementById('reqStatus').textContent = 'Pending... Searching for experts';
    document.getElementById('expertInfoSection').classList.add('hidden');
    document.getElementById('marketplaceChat').classList.add('hidden');
    document.getElementById('mpChatHistory').innerHTML = '';
    
    try {
      const res = await fetch('/api/customer/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem: globalDiagnosticData.problem,
          type: globalDiagnosticData.type,
          severity: globalDiagnosticData.severity,
          analysis: globalDiagnosticData.technical_analysis[0] || 'See specific hardware description.',
          image: globalDiagnosticData.imageUrl || null,
          costEstimate: globalDiagnosticData.estimated_cost_effort
        })
      });
      const data = await res.json();
      if (data.success) {
        currentRequestId = data.request._id;
        localStorage.setItem('sentinal_customer_request_id', currentRequestId);
        socket.emit('join_request', currentRequestId);
        
        if (data.assignedExpert) {
           document.getElementById('reqStatus').innerHTML = `✅ Request assigned successfully! Email sent to expert <b>${data.assignedExpert.name}</b>. Waiting for expert response...`;
           document.getElementById('expertStatusBanner').className = 'status-banner badge success';
        } else {
           document.getElementById('reqStatus').textContent = '⏳ Request logged. Waiting for an available expert...';
        }
      } else {
        document.getElementById('reqStatus').textContent = '❌ Failed to submit request: ' + data.error;
      }
    } catch (err) {
      document.getElementById('reqStatus').textContent = '❌ Failed to connect to marketplace (Server Error).';
    }
  });

  closeModalBtn.addEventListener('click', () => {
    expertModal.classList.add('hidden');
    expertModal.style.display = 'none';
  });

  socket.on('request_updated', (data) => {
    if (data.request._id === currentRequestId) {
        fetch(`/api/request/${currentRequestId}`).then(r => r.json()).then(res => {
            if(res.success) updateMarketplaceUI(res.request, res.messages);
        });
    }
  });

  socket.on('receive_message', (msg) => {
    if (msg.requestId === currentRequestId) {
        appendCustomerMessage(msg);
        if (mpTypingIndicator) mpTypingIndicator.textContent = '';
        if (msg.sender === 'expert') alertSound.play().catch(e => {});
    }
  });
  
  socket.on('user_typing', (data) => {
    if (data.requestId === currentRequestId && data.sender === 'expert' && mpTypingIndicator) {
        mpTypingIndicator.textContent = 'Expert is typing...';
        clearTimeout(window.customerTypingTimeout);
        window.customerTypingTimeout = setTimeout(() => mpTypingIndicator.textContent = '', 2000);
    }
  });

  const updateMarketplaceUI = (request, messages = []) => {
    const reqStatus = document.getElementById('reqStatus');
    const expertInfo = document.getElementById('expertInfoSection');
    const chatArea = document.getElementById('marketplaceChat');
    
    if (request.status === 'accepted') {
      if (reqStatus.textContent !== 'Accepted') {
        reqStatus.textContent = 'Accepted';
        document.getElementById('expertStatusBanner').className = 'status-banner badge success';
        document.getElementById('reqExpertName').textContent = request.expertId ? request.expertId.name : 'Unknown';
        document.getElementById('reqPrice').textContent = request.customPrice || request.costEstimate;
        expertInfo.classList.remove('hidden');
        chatArea.classList.remove('hidden');
        
        // Notify customer that their request was accepted
        alertSound.play().catch(e => {});
        alert(`🎉 Expert ${request.expertId ? request.expertId.name : 'assigned'} has accepted your request!`);
      }
    } else if (request.status === 'resolved') {
      reqStatus.textContent = 'Resolved';
      document.getElementById('expertStatusBanner').className = 'status-banner badge';
      // Clear session cache on resolution
      localStorage.removeItem('sentinal_customer_request_id');
      currentRequestId = null;
    }

    // Refresh full chat
    const chatHist = document.getElementById('mpChatHistory');
    chatHist.innerHTML = '';
    messages.forEach(msg => appendCustomerMessage(msg));
  };

  const appendCustomerMessage = (msg) => {
      const chatHist = document.getElementById('mpChatHistory');
      if (!msg || !msg._id) return;
      if (chatHist.querySelector(`[data-msg-id="${msg._id}"]`)) return;

      const div = document.createElement('div');
      div.className = `chat-msg ${msg.sender === 'customer' ? 'user' : 'sys'}-msg`;
      div.setAttribute('data-msg-id', msg._id);
      const time = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      div.innerHTML = `<strong>${msg.sender}:</strong> ${msg.text} <span style="font-size: 0.7em; opacity: 0.7; float: right; margin-top: 5px;">${time}</span>`;
      chatHist.appendChild(div);
      chatHist.scrollTop = chatHist.scrollHeight;
  };

  mpSendBtn.addEventListener('click', () => {
    const text = mpChatInput.value.trim();
    if (!text || !currentRequestId) return;
    mpChatInput.value = '';
    
    socket.emit('send_message', {
        requestId: currentRequestId,
        sender: 'customer',
        text: text
    });
  });

  mpChatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') mpSendBtn.click();
    else socket.emit('user_typing', { requestId: currentRequestId, sender: 'customer' });
  });
}

// Auto-restore customer active request session on load
window.addEventListener('DOMContentLoaded', () => {
  const savedReqId = localStorage.getItem('sentinal_customer_request_id');
  if (savedReqId) {
    currentRequestId = savedReqId;
    fetch(`/api/request/${currentRequestId}`).then(r => r.json()).then(res => {
      if (res.success && res.request && res.request.status !== 'resolved') {
        const expertModal = document.getElementById('expertModal');
        expertModal.classList.remove('hidden');
        expertModal.style.display = 'flex';
        if (socket.connected) {
          socket.emit('join_request', currentRequestId);
        }
        updateMarketplaceUI(res.request, res.messages);
      } else {
        localStorage.removeItem('sentinal_customer_request_id');
        currentRequestId = null;
      }
    }).catch(() => {});
  }
});
