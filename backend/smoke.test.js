const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const BACKEND_DIR = __dirname;
const SERVER = path.join(BACKEND_DIR, 'server.js');

function startServer(port) {
  return new Promise((resolve, reject) => {
    const emailSuffix = Date.now() + Math.random().toString(36).slice(2, 8);
    const child = spawn(process.execPath, [SERVER], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        PORT: String(port),
        MONGO_URI: 'mongodb://127.0.0.1:65535/ai_marketplace',
        GEMINI_API_KEY: '',
        JWT_SECRET: 'test-secret',
        ADMIN_USERNAME: 'admin',
        ADMIN_PASSWORD: 'admin123',
        ADMIN_JWT_SECRET: 'admin-secret',
        TEST_EMAIL_SUFFIX: emailSuffix
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.unref();

    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('Server actively running')) {
        resolve(child);
      }
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('error', reject);
    setTimeout(() => {
      if (output.includes('Server actively running')) {
        return;
      }
      reject(new Error(`Server failed to start on port ${port}. Output: ${output}`));
    }, 15000);
  });
}

async function httpJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

test('admin login and expert signup/login succeed in memory mode', async () => {
  const port = 4100 + Math.floor(Math.random() * 1000);
  const child = await startServer(port);
  try {
    const login = await httpJson(`http://localhost:${port}/admin/login`, {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });

    assert.equal(login.status, 200);
    assert.equal(login.data.success, true);
    assert.ok(login.data.token);

    const stats = await httpJson(`http://localhost:${port}/admin/stats`, {
      headers: { Authorization: `Bearer ${login.data.token}` }
    });
    assert.equal(stats.status, 200);
    assert.equal(stats.data.success, true);

    const aiStatus = await httpJson(`http://localhost:${port}/api/ai/status`);
    assert.equal(aiStatus.status, 200);
    assert.equal(aiStatus.data.success, true);
    assert.equal(typeof aiStatus.data.configured, 'boolean');
    assert.ok(Array.isArray(aiStatus.data.activeModels));
    assert.ok(Array.isArray(aiStatus.data.discoveredModels));
    assert.equal(typeof aiStatus.data.successCount, 'number');
    assert.equal(typeof aiStatus.data.fallbackCount, 'number');
    assert.equal(typeof aiStatus.data.circuit.open, 'boolean');
    assert.equal(typeof aiStatus.data.healthy, 'boolean');

    const email = `jane-${process.env.TEST_EMAIL_SUFFIX || Date.now()}@example.com`;

    const signup = await httpJson(`http://localhost:${port}/api/expert/signup`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Jane Doe',
        email,
        phone: '+15551112222',
        password: 'secret123',
        category: 'Software Developer',
        experience: 3,
        serviceArea: 'Remote',
        bio: 'Senior engineer'
      })
    });

    assert.equal(signup.status, 200);
    assert.equal(signup.data.success, true);

    const expertLogin = await httpJson(`http://localhost:${port}/api/expert/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password: 'secret123' })
    });

    assert.equal(expertLogin.status, 200);
    assert.equal(expertLogin.data.success, true);
    assert.ok(expertLogin.data.token);

    const fixturePath = path.join(BACKEND_DIR, '..', 'uploads', 'missing_dll_error.png');
    const form = new FormData();
    form.append(
      'imageInput',
      new Blob([fs.readFileSync(fixturePath)], { type: 'image/png' }),
      'missing_dll_error.png'
    );
    const analysisResponse = await fetch(`http://localhost:${port}/analyze`, {
      method: 'POST',
      body: form
    });
    const analysis = await analysisResponse.json();
    const imagePath = analysis.data && analysis.data.imageUrl
      ? path.join(BACKEND_DIR, '..', analysis.data.imageUrl.replace(/^\/+/, '').replace(/\//g, path.sep))
      : null;

    try {
      assert.equal(analysisResponse.status, 200);
      assert.equal(analysis.data.aiSource, 'fallback');
      assert.equal(analysis.data.title, 'Missing DLL error (MSVCP140.dll)');
      assert.equal(analysis.data.recommendedCategory, 'Software Developer');
      assert.match(analysis.data.imageUrl, /^\/uploads\/[0-9a-f-]+\.png$/i);
    } finally {
      if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }
  } finally {
    child.kill('SIGTERM');
  }
});
