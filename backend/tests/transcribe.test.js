const request = require('supertest');
const axios = require('axios');
const app = require('../app');

// The inference service is mocked here; its own tests cover Whisper (inference-service/tests).
describe('POST /api/handovers/transcribe', () => {
  let token;
  const audio = Buffer.from('fake webm bytes');
  const post = () => request(app).post('/api/handovers/transcribe').set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const email = `transcribe${Date.now()}@kenya-airways.com`;
    await request(app).post('/api/auth/register').send({ full_name: 'Voice Tester', email, password: 'testpass123' });
    token = (await request(app).post('/api/auth/login').send({ email, password: 'testpass123' })).body.token;
  });
  afterEach(() => jest.restoreAllMocks());

  test('needs sign-in', async () => {
    const res = await request(app).post('/api/handovers/transcribe').attach('audio', audio, { filename: 'a.webm', contentType: 'audio/webm' });
    expect(res.statusCode).toBe(401);
  });

  test('forwards the recording and returns the transcript', async () => {
    const spy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { text: 'Hydraulic pump leak on 5Y-KZD.', language: 'en', language_probability: 0.99, duration: 4.2 },
    });
    const res = await post().field('language', 'sw').attach('audio', audio, { filename: 'a.webm', contentType: 'audio/webm' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ text: 'Hydraulic pump leak on 5Y-KZD.', language: 'en', language_probability: 0.99, duration: 4.2 });
    const [url, form] = spy.mock.calls[0];
    expect(url).toMatch(/\/transcribe$/);
    expect(form.get('language')).toBe('sw');
    expect(Buffer.from(await form.get('audio').arrayBuffer()).equals(audio)).toBe(true);
  });

  test('labels the language from the transcript words, not the audio guess', async () => {
    const reply = (text) => ({ data: { text, language: 'sw', language_probability: 0.8, duration: 5 } });
    const send = () => post().attach('audio', audio, { filename: 'a.m4a', contentType: 'audio/mp4' });
    jest.spyOn(axios, 'post').mockResolvedValueOnce(reply('Pump leak detected on 5Y-KZD at stand 7, replacement ordered from the parts store.'));
    expect((await send()).body.language).toBe('en');
    jest.spyOn(axios, 'post').mockResolvedValueOnce(reply('Pampu ya ndege inavuja, fundi ameagiza kipuri kabla ya saa kumi na mbili asubuhi.'));
    expect((await send()).body.language).toBe('sw');
    jest.spyOn(axios, 'post').mockResolvedValueOnce(reply('Tairi ya left main gear imeisha, replacement imeagizwa, engineer atafit kabla ya night shift.'));
    expect((await send()).body.language).toBe('mixed');
  });

  test('rejects a missing file, a non-audio file, a bad language and an oversized file', async () => {
    expect((await post()).statusCode).toBe(400);
    expect((await post().attach('audio', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' })).statusCode).toBe(400);
    expect((await post().field('language', 'fr').attach('audio', audio, { filename: 'a.webm', contentType: 'audio/webm' })).statusCode).toBe(400);
    const big = Buffer.alloc(10 * 1024 * 1024 + 1);
    expect((await post().attach('audio', big, { filename: 'a.webm', contentType: 'audio/webm' })).statusCode).toBe(413);
  });

  test('passes on "unusable audio" and turns an outage into 503', async () => {
    jest.spyOn(axios, 'post').mockRejectedValueOnce({ response: { status: 400, data: { detail: 'The recording is empty.' } } });
    const empty = await post().attach('audio', audio, { filename: 'a.webm', contentType: 'audio/webm' });
    expect(empty.statusCode).toBe(400);
    expect(empty.body.error).toBe('The recording is empty.');

    jest.spyOn(axios, 'post').mockRejectedValueOnce(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    const down = await post().attach('audio', audio, { filename: 'a.webm', contentType: 'audio/webm' });
    expect(down.statusCode).toBe(503);
    expect(down.body.error).toMatch(/Type the handover instead/);
  });

  test('a handover can be saved as voice input; other input types are refused', async () => {
    const res = await request(app)
      .post('/api/handovers')
      .set('Authorization', `Bearer ${token}`)
      .send({ narrative_text: 'x', input_type: 'video' });
    expect(res.statusCode).toBe(400);
  });
});
