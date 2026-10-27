// Shared categories across frontend and backend
const CATEGORIES = [
  'Plumber',
  'Electrician',
  'Mobile Technician',
  'Software Developer',
  'Cybersecurity Specialist'
];

// Helper to normalize any category string safely
function normalizeCategory(val) {
  if (!val) return 'Plumber';
  const clean = String(val).trim().toLowerCase();
  if (clean.includes('plumb') || clean.includes('pipe') || clean.includes('leak')) return 'Plumber';
  if (/\b(electric(?:al|ity)?|wire|wiring|cable|circuit|plug|socket|breaker|voltage|conductor|insulation|overcurrent|arcing|spark|outlet)\b/.test(clean)) return 'Electrician';
  if (clean.includes('mobile') || clean.includes('phone') || clean.includes('screen')) return 'Mobile Technician';
  if (clean.includes('cyber') || clean.includes('ransom') || clean.includes('security')) return 'Cybersecurity Specialist';
  if (clean.includes('software') || clean.includes('code') || clean.includes('dev') || clean.includes('bug')) return 'Software Developer';
  return 'Software Developer';
}

function detectCategoryFromProblem(problemText, typeText) {
  const p = String(problemText || '').toLowerCase();
  const t = String(typeText || '').toLowerCase();
  const evidence = `${p} ${t}`;

  // Evaluate physical-service signals before broad domain labels such as "Hardware".
  // These terms also match diagnostic findings, not just the user-entered title.
  if (/\b(pipe|leak|drain|plumb|faucet|water|sewer|toilet)\b/.test(evidence)) return 'Plumber';
  if (/\b(electric(?:al|ity)?|wire|wiring|cable|circuit|plug|socket|breaker|voltage|conductor|insulation|overcurrent|arcing|spark|electrocution|outlet)\b/.test(evidence)) return 'Electrician';
  if (/\b(mobile|phone|smartphone|screen|display|touchscreen|tablet)\b/.test(evidence)) return 'Mobile Technician';
  if (/\b(ransomware|hacked|hacking|cybersecurity|malware|phishing|data breach)\b/.test(evidence) || t.includes('cyber')) return 'Cybersecurity Specialist';
  if (/\b(software|code|coding|program|programming|developer|bug|exception|stack trace|runtime error|bsod|infinite loop)\b/.test(evidence) || t.includes('software')) return 'Software Developer';

  return 'Software Developer';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CATEGORIES,
    normalizeCategory,
    detectCategoryFromProblem
  };
}
