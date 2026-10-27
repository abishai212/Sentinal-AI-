const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), override: true, quiet: true });
const aiEngine = require('../aiEngine');

async function main() {
  if (!String(process.env.GEMINI_API_KEY || '').trim()) {
    console.log('SKIP Live AI checks: GEMINI_API_KEY is absent.');
    return;
  }

  const cases = [
    {
      name: 'Rusty PVC pipe photo',
      file: path.join(__dirname, 'fixtures', 'sample-pipe.jpg'),
      mimeType: 'image/jpeg',
      hintName: 'pipe_leak.png',
      expected: 'Plumber (High/Critical)',
      matches: data => data.category === 'Plumber' && ['High', 'Critical'].includes(data.severity)
    },
    {
      name: 'MSVCP140.dll screenshot',
      file: path.join(__dirname, 'fixtures', 'sample-screen.png'),
      mimeType: 'image/png',
      hintName: 'missing_dll_error.png',
      expected: 'Software Developer',
      matches: data => data.category === 'Software Developer'
        && data.problemType === 'software_error'
        && data.steps.some(step => /Microsoft Visual C\+\+ Redistributable/i.test(step))
    }
  ];
  const rows = [];
  for (const testCase of cases) {
    const result = await aiEngine.aiDiagnose({
      text: '',
      imagePath: testCase.file,
      mimeType: testCase.mimeType,
      hintName: testCase.hintName
    });
    const data = result && result.data ? result.data : {};
    rows.push({
      case: testCase.name,
      expected: testCase.expected,
      returnedCategory: data.category || 'Not determined',
      aiSource: data.aiSource || 'unknown',
      confidence: Number.isInteger(data.confidence) ? data.confidence : 'invalid',
      result: testCase.matches(data) && data.aiSource === 'gemini' ? 'PASS' : 'FAIL'
    });
  }
  console.table(rows);
  if (rows.some(row => row.result === 'FAIL')) process.exitCode = 1;
}

main().catch(error => {
  console.error(`Live AI test failed: ${error.message}`);
  process.exitCode = 1;
});
