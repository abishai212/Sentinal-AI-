// Shared Category Definitions for Frontend
const SENTINEL_CATEGORIES = [
  'Plumber',
  'Electrician',
  'Mobile Technician',
  'Software Developer',
  'Cybersecurity Specialist'
];

function detectCategoryFromProblem(problemText, typeText) {
  const p = String(problemText || '').toLowerCase();
  const t = String(typeText || '').toLowerCase();
  const evidence = `${p} ${t}`;

  if (/\b(pipe|leak|drain|plumb|faucet|water|sewer|toilet)\b/.test(evidence)) return 'Plumber';
  if (/\b(electric(?:al|ity)?|wire|wiring|cable|circuit|plug|socket|breaker|voltage|conductor|insulation|overcurrent|arcing|spark|electrocution|outlet)\b/.test(evidence)) return 'Electrician';
  if (/\b(mobile|phone|smartphone|screen|display|touchscreen|tablet)\b/.test(evidence)) return 'Mobile Technician';
  if (/\b(ransomware|hacked|hacking|cybersecurity|malware|phishing|data breach)\b/.test(evidence) || t.includes('cyber')) return 'Cybersecurity Specialist';
  if (/\b(software|code|coding|program|programming|developer|bug|exception|stack trace|runtime error|bsod|infinite loop)\b/.test(evidence) || t.includes('software')) return 'Software Developer';

  return 'Software Developer';
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function apiFetch(url, options = {}) {
  const defaultHeaders = {
    'Accept': 'application/json'
  };
  if (options.body && !(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }
  const token = localStorage.getItem('sentinel_expert_token');
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {})
    }
  };

  try {
    const res = await fetch(url, config);
    let data;
    try {
      data = await res.json();
    } catch (e) {
      data = { success: false, error: `Server response error (${res.status})` };
    }

    if (!res.ok && !data.error) {
      data.error = `HTTP ${res.status}: ${res.statusText || 'Request failed'}`;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: { success: false, error: err.message || 'Network connection failed' }
    };
  }
}
