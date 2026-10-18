// A stand-in for inference-service (FastAPI + mBERT + Whisper) with fixed, predictable answers,
// so end-to-end tests are fast and don't depend on ML models. The real models have their own
// tests in inference-service/tests.
const http = require('http');

const PORT = Number(process.env.PORT) || 8100;
const VOICE_TRANSCRIPT = 'Brake wear on 5Y-KQA at stand 4, engineer to replace pads before 1800.';

function predict(text) {
  const entities = [];
  const add = (type, re) => {
    const m = text.match(re);
    if (m) entities.push({ type, text: m[0], confidence: 0.95 });
  };
  add('AIRCRAFT', /5Y-[A-Z]{3}/);
  add('COMPONENT', /hydraulic pump|main gear tyre|brake pads|brake/i);
  add('LOCATION', /stand \d+/i);
  add('ROLE', /engineer|technician/i);
  // "unclear" in a narrative makes a low-confidence report, for the review queue.
  const unclear = /unclear/i.test(text);
  return {
    incident_category: unclear ? 'Other/Rare Ground Event' : 'Aircraft Equipment Problem',
    category_confidence: unclear ? 0.41 : 0.93,
    entities,
    summary: text.split(/(?<=\.)\s/)[0].trim(),
  };
}

const server = http.createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (req.url === '/health') return send(200, { status: 'ok' });
      if (req.url === '/predict' && req.method === 'POST') {
        const { text } = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        return send(200, predict(text || ''));
      }
      if (req.url === '/transcribe' && req.method === 'POST') {
        const size = Buffer.concat(chunks).length;
        if (size < 1000) return send(400, { detail: 'The recording is empty.' });
        return send(200, { text: VOICE_TRANSCRIPT, language: 'en', language_probability: 0.99, duration: 4 });
      }
      send(404, { detail: 'Not found' });
    });
});

// Only listen when run as a server (`node support/fake-inference.js`), not when a test imports it.
if (require.main === module) server.listen(PORT, () => console.log(`fake inference on ${PORT}`));

module.exports = { VOICE_TRANSCRIPT };
