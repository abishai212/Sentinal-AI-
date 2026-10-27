const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns').promises;
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '..', '.env');
const fixtureDir = path.resolve(__dirname, '..', 'tests', 'fixtures');
const apiBase = 'https://generativelanguage.googleapis.com/v1beta';
const results = [];
const allowMissingKey = process.argv.includes('--allow-missing-key');

function printResult(name, status, reason, fix = '') {
  const label = status === 'PASS' ? 'PASS' : status === 'WARN' ? 'WARN' : 'FAIL';
  console.log(`${label} ${name}: ${reason}`);
  if (status === 'FAIL' || status === 'WARN') {
    console.log(`  Fix: ${fix}`);
  }
  results.push({ status, name, fix });
}

function sanitize(value, key) {
  let message = String(value || 'No additional details provided.');
  if (key) message = message.split(key).join('[redacted]');
  return message
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]')
    .replace(/(x-goog-api-key\s*[:=]\s*)[^\s,]+/gi, '$1[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function supportedModels(payload) {
  return (Array.isArray(payload.models) ? payload.models : [])
    .filter(model => Array.isArray(model.supportedGenerationMethods)
      && model.supportedGenerationMethods.includes('generateContent'))
    .map(model => String(model.name || '').replace(/^models\//, ''))
    .filter(Boolean);
}

function configuredModels() {
  const models = String(process.env.GEMINI_MODELS || '')
    .split(/[,;\s]+/)
    .map(model => model.trim().replace(/^models\//, ''))
    .filter(Boolean);
  if (process.env.GEMINI_MODEL && process.env.GEMINI_MODEL.trim()) {
    return [process.env.GEMINI_MODEL.trim().replace(/^models\//, '')];
  }
  return [...new Set(models)];
}

function compareModelRecency(first, second) {
  const firstLatest = /-latest$/i.test(first) ? 1 : 0;
  const secondLatest = /-latest$/i.test(second) ? 1 : 0;
  if (firstLatest !== secondLatest) return secondLatest - firstLatest;
  const firstVersions = (first.match(/\d+/g) || []).map(Number);
  const secondVersions = (second.match(/\d+/g) || []).map(Number);
  for (let index = 0; index < Math.max(firstVersions.length, secondVersions.length); index += 1) {
    const difference = (secondVersions[index] || 0) - (firstVersions[index] || 0);
    if (difference) return difference;
  }
  return second.localeCompare(first);
}

function selectModelChain(availableModels) {
  const configured = configuredModels();
  const configuredAvailable = configured.filter(model => availableModels.includes(model));
  if (process.env.GEMINI_MODEL && process.env.GEMINI_MODEL.trim()) {
    return configuredAvailable.slice(0, 1);
  }
  const flash = availableModels
    .filter(model => /flash/i.test(model) && !/flash-lite/i.test(model))
    .sort(compareModelRecency);
  const flashLite = availableModels
    .filter(model => /flash-lite/i.test(model))
    .sort(compareModelRecency);
  return [...new Set([...configuredAvailable, ...flash.slice(0, 1), ...flashLite.slice(0, 1)])];
}

function imageMime(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

async function listAllModels(apiKey) {
  const models = [];
  let pageToken = '';
  do {
    const url = new URL(`${apiBase}/models`);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetchWithTimeout(url, {
      headers: { 'x-goog-api-key': apiKey }
    });
    const payload = await readResponse(response);
    if (!response.ok) return { response, payload, models: [] };
    models.push(...(Array.isArray(payload.models) ? payload.models : []));
    pageToken = payload.nextPageToken || '';
  } while (pageToken);
  return { response: { ok: true, status: 200 }, payload: { models }, models };
}

async function callModel(model, apiKey, parts, generationConfig, fixtureMime = null) {
  const response = await fetchWithTimeout(
    `${apiBase}/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts }],
        ...(generationConfig ? { generationConfig } : {})
      })
    },
    fixtureMime ? 40000 : 20000
  );
  const payload = await readResponse(response);
  return { response, payload };
}

async function main() {
  let apiKey = '';
  try {
    if (!fs.existsSync(envPath)) {
      printResult('.env configuration', 'FAIL', `Explicit file not found: ${envPath}.`, 'Create backend/.env from backend/.env.example and add a Google AI Studio key.');
    } else {
      const loaded = dotenv.config({ path: envPath, override: true, quiet: true });
      if (loaded.error) throw loaded.error;
      const rawEnv = fs.readFileSync(envPath, 'utf8');
      const keyLine = rawEnv.match(/^\s*GEMINI_API_KEY\s*=(.*)$/mi);
      const rawKey = keyLine ? keyLine[1] : '';
      apiKey = String(loaded.parsed && loaded.parsed.GEMINI_API_KEY || '');
      const trimmedKey = apiKey.trim();
      const wasTrimmed = rawKey !== rawKey.trim() || trimmedKey !== apiKey;
      apiKey = trimmedKey;
      process.env.GEMINI_API_KEY = apiKey;
      const cleanFormat = apiKey.length > 0 && !/[\s"']/.test(rawKey.trim());
      const plausibleKey = apiKey.length >= 30;
      const valid = Boolean(apiKey) && cleanFormat && plausibleKey;
      const details = `Loaded ${envPath}; GEMINI_API_KEY ${apiKey ? 'present' : 'absent'}, length ${apiKey.length}${wasTrimmed ? ' (surrounding whitespace was trimmed)' : ''}; ${cleanFormat ? 'no quotes or whitespace' : 'contains quotes or whitespace'}; ${plausibleKey ? 'has a plausible API-key length (the authenticated API check determines validity)' : 'is shorter than expected for an API key'}.`;
      const resultStatus = !valid
        ? apiKey ? 'FAIL' : allowMissingKey ? 'WARN' : 'FAIL'
        : wasTrimmed ? 'WARN' : 'PASS';
      printResult('.env configuration', resultStatus, details, apiKey ? 'Create or rotate a Google AI Studio API key at aistudio.google.com, then set GEMINI_API_KEY in backend/.env without quotes or spaces.' : 'Add GEMINI_API_KEY to backend/.env; create a key at aistudio.google.com.');
    }
  } catch (error) {
    printResult('.env configuration', 'FAIL', `Could not load ${envPath}: ${sanitize(error.message, apiKey)}.`, 'Check that backend/.env is readable and contains valid KEY=value lines.');
  }

  let networkAvailable = false;
  let resolvedAddresses = [];
  try {
    resolvedAddresses = (await dns.lookup('generativelanguage.googleapis.com', { all: true })).map(item => item.address);
    const response = await fetchWithTimeout('https://generativelanguage.googleapis.com/', {}, 10000);
    networkAvailable = true;
    printResult('Network reachability', 'PASS', `DNS resolved generativelanguage.googleapis.com (${resolvedAddresses.join(', ')}); TLS/HTTPS reached the service (HTTP ${response.status}).`);
  } catch (error) {
    printResult('Network reachability', 'FAIL', `DNS/TLS/HTTPS request failed: ${sanitize(error.message, apiKey)}.`, 'Allow outbound DNS and HTTPS (TCP 443) to generativelanguage.googleapis.com; check VPN, proxy, firewall, and system clock.');
  }

  let listResult = null;
  if (!apiKey || !networkAvailable) {
    const reason = !apiKey ? 'Skipped because GEMINI_API_KEY is absent.' : 'Skipped because the network check failed.';
    printResult('Key validity', !apiKey && allowMissingKey ? 'WARN' : 'FAIL', reason, !apiKey ? 'Add a valid Google AI Studio key to backend/.env.' : 'Restore DNS/TLS access and rerun npm run ai:doctor.');
  } else {
    try {
      listResult = await listAllModels(apiKey);
      if (!listResult.response.ok) {
        const apiError = listResult.payload.error || {};
        const status = listResult.response.status;
        const reason = `HTTP ${status}; error.status=${apiError.status || 'not provided'}; error.message=${sanitize(apiError.message, apiKey)}`;
        let fix = 'Check the key and Google AI API project configuration.';
        if (status === 400 || status === 403) fix = 'Key is invalid, deleted, or restricted: create/enable a valid key at aistudio.google.com and allow the Generative Language API.';
        if (status === 429) fix = /limit:\s*0/i.test(apiError.message || '')
          ? 'Quota is zero for this project/model: enable billing or request Generative Language API quota in Google AI Studio/Google Cloud, then rerun the doctor.'
          : 'Quota exhausted: wait for the quota reset or enable/increase Generative Language API quota; rerun the doctor afterward.';
        printResult('Key validity', 'FAIL', reason, fix);
      } else {
        printResult('Key validity', 'PASS', 'The models endpoint accepted the API key (HTTP 200).');
      }
    } catch (error) {
      printResult('Key validity', 'FAIL', `Could not query the models endpoint: ${sanitize(error.message, apiKey)}.`, 'Check key restrictions, proxy/firewall access, and Generative Language API availability.');
    }
  }

  let usableModels = [];
  if (listResult && listResult.response.ok) {
    usableModels = supportedModels(listResult.payload);
    const configured = configuredModels();
    const missing = configured.filter(model => !usableModels.includes(model.replace(/^models\//, '')));
    const suggestions = selectModelChain(usableModels);
    if (missing.length) {
      printResult('Model availability', 'WARN', `Configured model(s) not found or lacking generateContent: ${missing.join(', ')}. ${usableModels.length} supported models were discovered.`, `Use one of the discovered models: ${suggestions.join(', ') || 'see the model list returned by Google'}.`);
    } else if (!usableModels.length) {
      printResult('Model availability', 'FAIL', 'The API key is accepted, but no model with generateContent support was returned.', 'Enable a Generative Language API model for this project and rerun npm run ai:doctor.');
    } else {
      printResult('Model availability', 'PASS', `Configured models are available. Recommended working flash models: ${suggestions.join(', ') || usableModels.slice(0, 5).join(', ')}.`);
    }
  } else {
    const skippedWithoutKey = !apiKey && allowMissingKey;
    printResult('Model availability', skippedWithoutKey ? 'WARN' : 'FAIL', 'Skipped because the authenticated models list is unavailable.', 'Resolve the key validity or network failure above, then rerun npm run ai:doctor.');
  }

  const modelChain = selectModelChain(usableModels);

  async function testCall(name, parts, generationConfig, fixtureMime = null) {
    if (!apiKey || !modelChain.length || !listResult || !listResult.response.ok) {
      printResult(name, !apiKey && allowMissingKey ? 'WARN' : 'FAIL', 'Skipped because a valid key and working model were not discovered.', 'Resolve the key/model failures above and rerun npm run ai:doctor.');
      return;
    }
    const failures = [];
    for (const model of modelChain) {
      try {
        const { response, payload } = await callModel(model, apiKey, parts, generationConfig, fixtureMime);
        if (!response.ok) {
          const apiError = payload.error || {};
          failures.push(`Model ${model}: HTTP ${response.status}; error.status=${apiError.status || 'not provided'}; error.message=${sanitize(apiError.message, apiKey)}`);
          if ([400, 401, 403].includes(response.status)) break;
          continue;
        }
        const candidate = payload.candidates && payload.candidates[0];
        const text = (candidate && candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts : [])
          .map(part => part.text || '')
          .join('')
          .trim();
        if (!text) {
          failures.push(`Model ${model}: HTTP response succeeded but the model returned no text.`);
          continue;
        }
        if (generationConfig && generationConfig.responseMimeType === 'application/json') {
          try {
            JSON.parse(text);
          } catch {
            failures.push(`Model ${model}: returned text that is not valid JSON in JSON response mode.`);
            continue;
          }
        }
        const fallbackNote = failures.length ? ` after fallback from ${failures.length} unavailable model(s)` : '';
        printResult(name, 'PASS', `Model ${model} returned non-empty ${fixtureMime ? `image (${fixtureMime})` : generationConfig ? 'JSON-mode' : 'text'} output${fallbackNote}.`);
        return;
      } catch (error) {
        failures.push(`Model ${model}: request failed: ${sanitize(error.message, apiKey)}`);
      }
    }
    const failure = failures.join('; ') || 'No candidate model completed the request.';
    const quotaZero = /limit:\s*0/i.test(failure);
    const fix = quotaZero
      ? 'Quota is zero for this project/model: enable billing or request Generative Language API quota in Google AI Studio/Google Cloud.'
      : 'Check outbound HTTPS access, then enable/increase quota or select a working discovered model.';
    printResult(name, 'FAIL', failure, fix);
  }

  await testCall('Text generation', [{ text: 'Reply with OK' }], { temperature: 0 });
  await testCall('JSON-mode generation', [{ text: 'Return exactly this JSON object: {"reply":"OK"}' }], {
    responseMimeType: 'application/json',
    temperature: 0
  });

  let fixture = null;
  if (fs.existsSync(fixtureDir)) {
    for (const name of fs.readdirSync(fixtureDir).sort()) {
      const filePath = path.join(fixtureDir, name);
      if (!fs.statSync(filePath).isFile()) continue;
      const bytes = fs.readFileSync(filePath);
      const mimeType = imageMime(bytes);
      if (mimeType) {
        fixture = { name, bytes, mimeType };
        break;
      }
    }
  }
  if (!fixture) {
    printResult('Image generation', 'FAIL', `No real PNG, JPEG, or WebP fixture found in ${fixtureDir}.`, 'Add a valid sample image to backend/tests/fixtures using a neutral filename, then rerun npm run ai:doctor.');
  } else {
    await testCall('Image generation', [
      { text: 'Briefly describe the visible issue in this image.' },
      { inline_data: { mime_type: fixture.mimeType, data: fixture.bytes.toString('base64') } }
    ], { temperature: 0 }, fixture.mimeType);
  }

  const failures = results.filter(result => result.status === 'FAIL');
  const warnings = results.filter(result => result.status === 'WARN');
  console.log(`\nSummary: ${results.length - failures.length - warnings.length} PASS, ${failures.length} FAIL, ${warnings.length} WARN.`);
  for (const failure of failures) console.log(`- ${failure.name}: ${failure.fix}`);
  if (failures.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(`FAIL Doctor: ${sanitize(error.message, process.env.GEMINI_API_KEY || '')}`);
  process.exitCode = 1;
});
