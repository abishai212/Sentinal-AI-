const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');
const mockCredential = crypto.randomBytes(24).toString('hex');

const ENV_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_MODELS',
  'AI_MAX_REQUESTS_PER_MINUTE',
  'DEMO_FILENAME_HINTS'
];

function freshEngine(t, { model = 'unit-model', models = null } = {}) {
  const previousEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  const enginePath = require.resolve('../aiEngine');
  delete require.cache[enginePath];
  const engine = require('../aiEngine');
  process.env.GEMINI_API_KEY = mockCredential;
  process.env.GEMINI_MODEL = models ? '' : model;
  if (models) process.env.GEMINI_MODELS = models.join(',');
  process.env.AI_MAX_REQUESTS_PER_MINUTE = '100';
  const originalFetch = global.fetch;
  const originalLoad = Module._load;
  t.after(() => {
    global.fetch = originalFetch;
    Module._load = originalLoad;
    delete require.cache[enginePath];
    for (const key of ENV_KEYS) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  });
  return engine;
}

function response(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

function modelsResponse(names) {
  return response(200, {
    models: names.map(name => ({
      name: `models/${name}`,
      supportedGenerationMethods: ['generateContent']
    }))
  });
}

function generatedResponse(value) {
  return response(200, {
    candidates: [{
      finishReason: 'STOP',
      content: { parts: [{ text: typeof value === 'string' ? value : JSON.stringify(value) }] }
    }]
  });
}

function diagnosis(overrides = {}) {
  return {
    title: 'Diagnostic result',
    problem: 'Diagnostic result',
    problemType: 'other',
    extractedText: '',
    domain: 'Other',
    category: 'Not determined',
    severity: 'Medium',
    confidence: 0.95,
    evidence: [],
    uncertainties: [],
    ...overrides
  };
}

function makeFetch(handler) {
  return async (input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/models')) return modelsResponse(['unit-model']);
    return handler(url, options);
  };
}

test('all diagnosis producers use one contract and integer confidence', async t => {
  const engine = freshEngine(t);
  const expectedKeys = Object.keys(engine.normalizeDiagnosis({})).sort();
  const signature = engine.diagnoseTextSignature('MSVCP140.dll was not found').data;
  const fallback = (await engine.fallbackDiagnosis({ text: 'MSVCP140.dll was not found' })).data;
  const normalized = engine.normalizeResponse({ confidence: '95%' }).data;

  global.fetch = makeFetch(() => generatedResponse(diagnosis()));
  const generated = (await engine.aiDiagnose({ text: 'A non-specific issue' })).data;
  for (const result of [signature, fallback, normalized, generated]) {
    assert.deepEqual(Object.keys(result).sort(), expectedKeys);
    assert.ok(Number.isInteger(result.confidence));
  }
  assert.equal(normalized.confidence, 95);
  assert.equal(engine.normalizeDiagnosis({}).confidence, 40);
  assert.equal(signature.confidence, 85);
});

test('HTTP 400 fails fast, preserves sanitized error details, and is a configuration error', async t => {
  const engine = freshEngine(t);
  let generationCalls = 0;
  global.fetch = makeFetch(() => {
    generationCalls += 1;
    return response(400, { error: { status: 'INVALID_ARGUMENT', message: 'Invalid request configuration.' } });
  });

  const result = await engine.aiDiagnose({ text: 'A general issue' });
  assert.equal(generationCalls, 1);
  assert.equal(result.data.aiSource, 'fallback');
  assert.equal(result.data.aiError, 'configuration_error');
  assert.equal(engine.getStatus().lastError.httpStatus, 400);
  assert.equal(engine.getStatus().lastError.status, 'INVALID_ARGUMENT');
  assert.match(engine.getStatus().lastError.message, /Invalid request configuration/);
  assert.equal(engine.getStatus().lastError.message.includes(mockCredential), false);
});

test('503 retries the attempt and succeeds on HTTP 200', async t => {
  const engine = freshEngine(t);
  let generationCalls = 0;
  global.fetch = makeFetch(() => {
    generationCalls += 1;
    if (generationCalls === 1) {
      return response(503, { error: { status: 'UNAVAILABLE', message: 'Temporary service load.' } }, { 'Retry-After': '0' });
    }
    return generatedResponse(diagnosis({ title: 'Recovered result' }));
  });

  const result = await engine.aiDiagnose({ text: 'Issue description' });
  assert.equal(result.data.aiSource, 'gemini');
  assert.equal(result.data.title, 'Recovered result');
  assert.equal(generationCalls, 2);
  assert.equal(engine.getStatus().successCount, 1);
});

test('three all-model retryable failures open the circuit and it recovers after cooldown', async t => {
  const engine = freshEngine(t);
  let generationCalls = 0;
  global.fetch = makeFetch(() => {
    generationCalls += 1;
    if (generationCalls <= 9) {
      return response(503, { error: { status: 'UNAVAILABLE', message: 'Temporary service load.' } }, { 'Retry-After': '0' });
    }
    return generatedResponse(diagnosis({ title: 'Circuit recovered' }));
  });

  for (let index = 0; index < 3; index += 1) {
    await engine.aiDiagnose({ text: `Issue ${index}` });
  }
  assert.equal(generationCalls, 9);
  assert.equal(engine.getStatus().circuit.open, true);

  const originalNow = Date.now;
  Date.now = () => originalNow() + 61000;
  try {
    const recovered = await engine.aiDiagnose({ text: 'After circuit cooldown' });
    assert.equal(recovered.data.aiSource, 'gemini');
    assert.equal(engine.getStatus().circuit.open, false);
  } finally {
    Date.now = originalNow;
  }
});

test('404 removes the dead model and continues to the next model without retrying it', async t => {
  const engine = freshEngine(t, { models: ['unit-dead', 'unit-live'] });
  let deadCalls = 0;
  global.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/models')) return modelsResponse(['unit-dead', 'unit-live']);
    if (url.includes('/unit-dead:generateContent')) {
      deadCalls += 1;
      return response(404, { error: { status: 'NOT_FOUND', message: 'Model retired.' } });
    }
    return generatedResponse(diagnosis({ title: 'Live model result' }));
  };

  const result = await engine.aiDiagnose({ text: 'Issue description' });
  assert.equal(result.data.aiSource, 'gemini');
  assert.equal(result.data.title, 'Live model result');
  assert.equal(deadCalls, 1);
  assert.deepEqual(engine.getStatus().activeModels, ['unit-live']);
});

test('automatic model discovery prioritizes configured, newest flash, then flash-lite', async t => {
  const engine = freshEngine(t, { models: ['configured-flash'] });
  global.fetch = async (input, options = {}) => {
    if (String(input).endsWith('/models')) {
      return modelsResponse([
        'configured-flash',
        'gemini-2.5-flash',
        'gemini-3.8-flash',
        'gemini-3.1-flash-lite'
      ]);
    }
    return generatedResponse(diagnosis());
  };

  await engine.aiDiagnose({ text: 'Issue description' });
  assert.deepEqual(engine.getStatus().activeModels, [
    'configured-flash',
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite'
  ]);
  assert.equal(engine.getStatus().lastRequestShape.timeoutMs, 20000);
});

test('429 honors Retry-After before retrying', async t => {
  const engine = freshEngine(t);
  let generationCalls = 0;
  global.fetch = makeFetch(() => {
    generationCalls += 1;
    if (generationCalls === 1) {
      return response(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'Slow down.' } }, { 'Retry-After': '0.05' });
    }
    return generatedResponse(diagnosis());
  });

  const started = Date.now();
  const result = await engine.aiDiagnose({ text: 'Issue description' });
  assert.equal(result.data.aiSource, 'gemini');
  assert.equal(generationCalls, 2);
  assert.ok(Date.now() - started >= 40);
});

test('zero-quota 429 skips the long Retry-After and tries the next discovered model', async t => {
  const engine = freshEngine(t, { models: ['gemini-flash-latest', 'gemini-flash-lite-latest'] });
  const generationModels = [];
  global.fetch = async input => {
    const url = String(input);
    if (url.endsWith('/models')) return modelsResponse(['gemini-flash-latest', 'gemini-flash-lite-latest']);
    const model = decodeURIComponent(url.split('/models/')[1].split(':')[0]);
    generationModels.push(model);
    if (model === 'gemini-flash-latest') {
      return response(429, {
        error: {
          status: 'RESOURCE_EXHAUSTED',
          message: 'Free tier generate_content_free_tier_requests_per_day limit: 0.'
        }
      }, { 'Retry-After': '86400' });
    }
    return generatedResponse(diagnosis());
  };

  const result = await engine.aiDiagnose({ text: 'A general issue' });
  assert.equal(result.data.aiSource, 'gemini');
  assert.deepEqual(generationModels, ['gemini-flash-latest', 'gemini-flash-lite-latest']);
});

test('long transient Retry-After fails over without waiting inline', async t => {
  const engine = freshEngine(t, { models: ['gemini-flash-latest', 'gemini-flash-lite-latest'] });
  const generationModels = [];
  global.fetch = async input => {
    const url = String(input);
    if (url.endsWith('/models')) return modelsResponse(['gemini-flash-latest', 'gemini-flash-lite-latest']);
    const model = decodeURIComponent(url.split('/models/')[1].split(':')[0]);
    generationModels.push(model);
    if (model === 'gemini-flash-latest') {
      return response(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'Please retry later.' } }, {
        'Retry-After': '3600'
      });
    }
    return generatedResponse(diagnosis());
  };

  const started = Date.now();
  const result = await engine.aiDiagnose({ text: 'A general issue' });
  assert.equal(result.data.aiSource, 'gemini');
  assert.deepEqual(generationModels, ['gemini-flash-latest', 'gemini-flash-lite-latest']);
  assert.ok(Date.now() - started < 1000);
});

test('network errors use a distinct timeout signal for each retry attempt', async t => {
  const engine = freshEngine(t);
  const signals = [];
  global.fetch = async (input, options = {}) => {
    if (String(input).endsWith('/models')) return modelsResponse(['unit-model']);
    signals.push(options.signal);
    throw new Error('connection reset');
  };

  const result = await engine.aiDiagnose({ text: 'Issue description' });
  assert.equal(result.data.aiSource, 'fallback');
  assert.equal(result.data.aiError, 'no_connection');
  assert.equal(signals.length, 3);
  assert.equal(new Set(signals).size, 3);
  assert.equal(engine.getStatus().lastRequestShape.timeoutMs, 20000);
});

test('invalid JSON gets exactly one repair request', async t => {
  const engine = freshEngine(t);
  let generationCalls = 0;
  global.fetch = makeFetch(() => {
    generationCalls += 1;
    return generatedResponse(generationCalls === 1 ? 'not valid json' : diagnosis({ title: 'Repaired JSON' }));
  });

  const result = await engine.aiDiagnose({ text: 'Issue description' });
  assert.equal(result.data.aiSource, 'gemini');
  assert.equal(result.data.title, 'Repaired JSON');
  assert.equal(generationCalls, 2);
});

test('empty MAX_TOKENS response is explicit and falls back', async t => {
  const engine = freshEngine(t);
  global.fetch = async input => {
    if (String(input).endsWith('/models')) return modelsResponse(['unit-model']);
    return response(200, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] });
  };

  const result = await engine.aiDiagnose({ text: 'Issue description' });
  assert.equal(result.data.aiSource, 'fallback');
  assert.equal(result.data.aiError, 'temporarily_busy');
  assert.match(engine.getStatus().lastError.message, /MAX_TOKENS/);
});

test('MIME sent to Gemini follows the normalized image bytes', async t => {
  const engine = freshEngine(t);
  const fixture = path.join(__dirname, 'fixtures', 'sample-screen.png');
  let observedMime = null;
  let sharpOptions = null;
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'sharp') {
      return () => {
        const chain = {
          rotate() { return chain; },
          async metadata() { return { width: 1600, height: 900, orientation: 1 }; },
          resize(width, height) {
            assert.ok(width >= 1280 || height >= 1280);
            return chain;
          },
          jpeg(options) {
            sharpOptions = options;
            return chain;
          },
          async toBuffer() { return Buffer.from([0xff, 0xd8, 0xff, 0xd9]); }
        };
        return chain;
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  global.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/models')) return modelsResponse(['unit-model']);
    const body = JSON.parse(options.body);
    observedMime = body.contents[0].parts[1].inline_data.mime_type;
    return generatedResponse(diagnosis());
  };

  const result = await engine.aiDiagnose({ text: 'Screenshot diagnosis', imagePath: fixture, mimeType: 'image/png' });
  assert.equal(result.data.aiSource, 'gemini');
  assert.equal(observedMime, 'image/jpeg');
  assert.ok(sharpOptions.quality >= 85);
  assert.equal(engine.getStatus().lastRequestShape.timeoutMs, 40000);
});

test('identical bytes under different filenames share prompt and cache entry', async t => {
  const engine = freshEngine(t);
  const fixture = path.join(__dirname, 'fixtures', 'sample-pipe.jpg');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-cache-'));
  const first = path.join(directory, 'first-name.png');
  const second = path.join(directory, 'other-name.jpg');
  fs.copyFileSync(fixture, first);
  fs.copyFileSync(fixture, second);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const prompts = [];
  let generationCalls = 0;
  global.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/models')) return modelsResponse(['unit-model']);
    generationCalls += 1;
    const body = JSON.parse(options.body);
    prompts.push(body.contents[0].parts[0].text);
    return generatedResponse(diagnosis());
  };

  await engine.aiDiagnose({ text: 'Same issue', imagePath: first, mimeType: 'image/png', hintName: 'first-name.png' });
  await engine.aiDiagnose({ text: 'Same issue', imagePath: second, mimeType: 'image/jpeg', hintName: 'other-name.jpg' });
  assert.equal(generationCalls, 1);
  assert.equal(prompts[0], prompts[1] || prompts[0]);
  assert.doesNotMatch(prompts[0], /first-name|other-name/i);
});

test('software signatures override a mocked Electrician diagnosis', async t => {
  const engine = freshEngine(t);
  global.fetch = makeFetch(() => generatedResponse(diagnosis({
    title: 'System error',
    problem: 'Windows cannot start the application.',
    problemType: 'software_error',
    extractedText: 'MSVCP140.dll was not found',
    domain: 'Software',
    category: 'Electrician',
    steps: ['Install the Microsoft Visual C++ Redistributable.']
  })));

  const result = await engine.aiDiagnose({ text: 'Windows error dialog' });
  assert.equal(result.data.aiSource, 'gemini');
  assert.equal(result.data.category, 'Software Developer');
  assert.equal(result.data.steps.some(step => /Microsoft Visual C\+\+ Redistributable/.test(step)), true);
});

test('offline signatures identify PVC rupture and missing DLL; weak OCR is discarded', async t => {
  const engine = freshEngine(t);
  delete process.env.GEMINI_API_KEY;
  const pipe = (await engine.fallbackDiagnosis({ text: 'rusted PVC pipe joint leaking water' })).data;
  const dll = (await engine.fallbackDiagnosis({ text: 'System Error: MSVCP140.dll was not found' })).data;

  assert.equal(pipe.title, 'PVC pipe joint rupture');
  assert.equal(pipe.category, 'Plumber');
  assert.equal(pipe.aiSource, 'fallback');
  assert.ok(pipe.confidence <= 85);
  assert.equal(dll.problemType, 'software_error');
  assert.equal(dll.category, 'Software Developer');
  assert.ok(dll.steps.some(step => /Microsoft Visual C\+\+ Redistributable/.test(step)));
  assert.equal(engine.filterOcrText('### 123 !!', [98, 99, 95]), '');
});

test('DEMO_FILENAME_HINTS=false does not classify using an image name', async t => {
  const engine = freshEngine(t);
  delete process.env.GEMINI_API_KEY;
  process.env.DEMO_FILENAME_HINTS = 'false';
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'tesseract.js') {
      return {
        createWorker: async () => ({
          async recognize() {
            return { data: { text: '### 123 !!', words: [{ confidence: 98 }] } };
          },
          async terminate() {}
        })
      };
    }
    if (request === '@tesseract.js-data/eng') return { langPath: '', gzip: false };
    return originalLoad.call(this, request, parent, isMain);
  };
  const fixture = path.join(__dirname, 'fixtures', 'sample-pipe.jpg');
  const result = await engine.fallbackDiagnosis({
    text: '',
    imagePath: fixture,
    hintName: 'pipe_leak.png'
  });
  assert.equal(result.data.category, 'Not determined');
  assert.equal(result.data.title, 'Unable to identify the problem from this image');
});

test('offline demo filename hint works only after low-quality OCR is discarded', async t => {
  const engine = freshEngine(t);
  delete process.env.GEMINI_API_KEY;
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'tesseract.js') {
      return {
        createWorker: async () => ({
          async recognize() {
            return { data: { text: '### 123 !!', words: [{ confidence: 98 }] } };
          },
          async terminate() {}
        })
      };
    }
    if (request === '@tesseract.js-data/eng') return { langPath: '', gzip: false };
    return originalLoad.call(this, request, parent, isMain);
  };
  const result = await engine.fallbackDiagnosis({
    text: '',
    imagePath: path.join(__dirname, 'fixtures', 'sample-pipe.jpg'),
    hintName: 'pipe_leak.png'
  });
  assert.equal(result.data.title, 'PVC pipe joint rupture');
  assert.equal(result.data.category, 'Plumber');
  assert.equal(result.data.extractedText, '');
});
