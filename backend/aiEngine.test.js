const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const aiEngine = require('./aiEngine');

test('missing Visual C++ DLL text is diagnosed as a software issue', () => {
  const result = aiEngine.diagnoseTextSignature(
    'System Error: The code execution cannot proceed because MSVCP140.dll was not found.'
  ).data;

  assert.equal(result.title, 'Missing DLL error (MSVCP140.dll)');
  assert.equal(result.problemType, 'software_error');
  assert.equal(result.recommendedCategory, 'Software Developer');
  assert.equal(result.severity, 'Medium');
  assert.equal(result.confidence, 85);
  assert.match(result.rootCause, /Microsoft Visual C\+\+ 2015-2022 Redistributable/);
  assert.ok(result.solution_steps.some(step => step.includes("Do NOT download DLL files")));
});

test('Windows stop codes retain their exact signature and software category', () => {
  const result = aiEngine.diagnoseTextSignature(
    'Your PC ran into a problem. Stop code: MEMORY_MANAGEMENT'
  ).data;

  assert.match(result.title, /MEMORY_MANAGEMENT/);
  assert.equal(result.problemType, 'operating_system_crash');
  assert.equal(result.recommendedCategory, 'Software Developer');
  assert.match(result.rootCause, /memory-management fault/i);
});

test('ransomware and runtime signatures use their dedicated categories', () => {
  const ransomware = aiEngine.diagnoseTextSignature('Your files have been encrypted; pay bitcoin to decrypt.').data;
  const runtime = aiEngine.diagnoseTextSignature('Unhandled exception: null pointer in service.').data;

  assert.equal(ransomware.recommendedCategory, 'Cybersecurity Specialist');
  assert.equal(ransomware.severity, 'Critical');
  assert.equal(runtime.recommendedCategory, 'Software Developer');
  assert.equal(runtime.problemType, 'software_error');
});

test('unrecognized evidence is explicitly unknown with low confidence', () => {
  const result = aiEngine.diagnoseTextSignature('', { hasImage: true }).data;

  assert.equal(result.title, 'Unable to identify the problem from this image');
  assert.equal(result.recommendedCategory, 'Not determined');
  assert.equal(result.severity, 'Low');
  assert.ok(result.confidence <= 20);
  assert.match(result.rootCause, /clearer photo|text description|retry with AI/i);
});

test('image filename keywords do not determine the offline diagnosis without an explicit hint', async () => {
  const fixturePath = path.join(__dirname, '..', 'uploads', 'missing_dll_error.png');
  const tempPath = path.join(os.tmpdir(), 'pipe_leak_windows_bsod.png');

  try {
    fs.copyFileSync(fixturePath, tempPath);
    const result = (await aiEngine.fallbackDiagnosis({ text: '', imagePath: tempPath })).data;

    assert.equal(result.title, 'Unable to identify the problem from this image');
    assert.equal(result.recommendedCategory, 'Not determined');
    assert.equal(result.extractedText, '');
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
});

test('Gemini prompt asks for transcription, problem type, evidence, and uncertainty', () => {
  const prompt = aiEngine.buildDiagnosticPrompt({
    text: 'MSVCP140.dll was not found',
    imagePath: 'C:\\uploads\\windows_bsod.png'
  });

  assert.match(prompt, /FIRST transcribe all visible text/);
  assert.match(prompt, /problemType/);
  assert.match(prompt, /extractedText/);
  assert.match(prompt, /evidence/);
  assert.match(prompt, /uncertainties/);
  assert.match(prompt, /never classify a computer-screen error as Electrician or Plumber/i);
  assert.doesNotMatch(prompt, /windows_bsod\.png/i);
});

test('normalization preserves honest zero confidence and undetermined category', () => {
  const result = aiEngine.normalizeResponse({
    title: 'Unable to identify the problem from this image',
    category: 'Not determined',
    confidence: 0
  }).data;

  assert.equal(result.confidence, 0);
  assert.equal(result.recommendedCategory, 'Not determined');
});
