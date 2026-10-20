const axios = require('axios');
const { detectLanguage } = require('../utils/languageDetect');

const INFERENCE_URL = process.env.INFERENCE_SERVICE_URL;

/**
 * Sends a recording to the inference service's Whisper endpoint and returns
 * { text, language, language_probability, duration }. The request `language` is 'en', 'sw' or
 * undefined (detect). The returned `language` ('en' | 'sw' | 'mixed') comes from the transcript's
 * words, like typed handovers, falling back to the language the audio was decoded as.
 * Throws an Error with `status` (400 for unusable audio, 503 when the service is unavailable).
 */
async function transcribe({ buffer, mimetype, filename, language }) {
  const form = new FormData();
  form.append('audio', new Blob([buffer], { type: mimetype || 'application/octet-stream' }), filename || 'recording');
  if (language) form.append('language', language);
  try {
    const { data } = await axios.post(`${INFERENCE_URL}/transcribe`, form, { timeout: 120_000 });
    return { ...data, language: detectLanguage(data.text) ?? data.language };
  } catch (err) {
    const status = err.response?.status;
    if (status === 400 || status === 413) {
      throw Object.assign(new Error(err.response.data?.detail || 'The recording couldn’t be used'), { status });
    }
    throw Object.assign(new Error('Voice input is unavailable right now. Type the handover instead.'), { status: 503 });
  }
}

module.exports = { transcribe };
