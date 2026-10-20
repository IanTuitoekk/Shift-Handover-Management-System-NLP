import { useEffect, useRef, useState } from 'react';
import { CircleNotch, Microphone, Stop, X } from '@phosphor-icons/react';
import { api } from '../../api/client';
import { errorMessage } from '../../utils/format';

export const MAX_RECORDING_SECONDS = 180;
// Anything smaller can't hold speech (a second of Opus audio is several KB).
const MIN_RECORDING_BYTES = 2000;

// Recording formats in order of preference. Safari now also claims WebM support, but its WebM
// recorder sometimes produces an empty file, so Safari records MP4 (its long-standing format).
const FORMATS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
const SAFARI_FORMATS = ['audio/mp4', ...FORMATS.filter((f) => f !== 'audio/mp4')];
const isSafari = () => /^((?!chrome|chromium|crios|fxios|android|edg).)*safari/i.test(navigator.userAgent);

const supported = () =>
  typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder !== 'undefined';

function micError(err) {
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
    return 'Microphone access is blocked. Allow it in the browser’s site settings, or type the handover.';
  }
  if (err?.name === 'NotFoundError') return 'No microphone was found on this device.';
  return 'The microphone couldn’t be started. Type the handover, or try again.';
}

// Below this peak level (0-1) a microphone is treated as sending silence.
const SILENCE_LEVEL = 0.02;

/**
 * Watches the microphone's loudness with Web Audio (doesn't affect the recording).
 * Calls onLevel(0..1) ten times a second; returns { peak(), stop() }.
 */
function watchLevel(stream, onLevel) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return { peak: () => null, stop() {} };
  const ctx = new AudioCtx();
  ctx.resume?.().catch(() => {});
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let peak = 0;
  const id = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) sum += v * v;
    const level = Math.min(1, Math.sqrt(sum / samples.length) * 6);
    peak = Math.max(peak, level);
    onLevel(level);
  }, 100);
  return {
    // Only trust the meter if the audio engine is really running (not held back by autoplay rules).
    peak: () => (ctx.state === 'running' ? peak : null),
    stop() {
      clearInterval(id);
      ctx.close?.().catch(() => {});
    },
  };
}

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Record a spoken handover and turn it into text on the server (Whisper, English and Swahili).
 * Nothing is submitted: `onTranscript({ text, language })` hands the text to the composer so the
 * crew member can check and correct it first. `onError(message)` reports problems ('' clears).
 */
export function VoiceInput({ id, onTranscript, onError, disabled = false }) {
  const [state, setState] = useState('idle'); // idle | permission | starting | recording | transcribing
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const meter = useRef(null);
  const recorder = useRef(null);
  const starting = useRef(false); // blocks a second start from a double tap
  const cancelled = useRef(false);
  const attempt = useRef(0); // bumps on every start and on cancel, so stale permission replies are ignored
  const timer = useRef(null);
  const canRecord = supported();
  const setError = (message) => onError?.(message);

  function release() {
    clearInterval(timer.current);
    meter.current?.stop();
    meter.current = null;
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
    recorder.current = null;
  }

  // Free the microphone if the composer goes away mid-recording.
  useEffect(() => {
    const timerRef = timer;
    const recorderRef = recorder;
    return () => {
      cancelled.current = true;
      clearInterval(timerRef.current);
      meter.current?.stop();
      const rec = recorderRef.current;
      if (rec?.state === 'recording') rec.stop();
      rec?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function upload(blob, { micName, quiet } = {}) {
    setState('transcribing');
    try {
      const result = await api.transcribeHandover(blob);
      if (result.text) onTranscript(result);
      else if (quiet)
        setError(
          `Nothing was heard: “${micName}” sent almost no sound. Check that the Mac hears you (System Settings → Sound → Input, the level bars should move as you speak; the built-in microphone is off while the lid is closed), then try again.`,
        );
      else setError('Nothing was heard. Speak a little closer to the microphone and try again.');
    } catch (err) {
      setError(errorMessage(err, 'The recording couldn’t be turned into text. Try again, or type the handover.'));
    } finally {
      setState('idle');
    }
  }

  async function start() {
    if (starting.current || recorder.current) return;
    starting.current = true;
    cancelled.current = false;
    const mine = ++attempt.current;
    setError('');
    setState('permission');
    // getUserMedia waits for the browser's (or macOS's) permission prompt; explain if it's slow.
    const hint = setTimeout(
      () =>
        setError(
          'Waiting for microphone permission. Look for the prompt by the address bar (or a macOS dialog), or allow the browser in System Settings → Privacy & Security → Microphone.',
        ),
      4000,
    );
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      clearTimeout(hint);
      if (mine !== attempt.current) return; // cancelled meanwhile
      setError(micError(err));
      setState('idle');
      starting.current = false;
      return;
    } finally {
      clearTimeout(hint);
    }
    if (mine !== attempt.current) {
      // Cancelled while the permission prompt was open: give the microphone straight back.
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    setError('');
    setState('starting');
    const [track] = stream.getAudioTracks();
    const t0 = performance.now();
    const since = () => `${((performance.now() - t0) / 1000).toFixed(1)}s`;
    // The microphone disappearing mid-recording (unplugged, taken by another app) is worth a warning.
    track?.addEventListener('ended', () => console.warn(`[voice] microphone stopped at ${since()}`));
    const micName = track?.label || 'the default microphone';
    meter.current = watchLevel(stream, setLevel);
    const mimeType = (isSafari() ? SAFARI_FORMATS : FORMATS).find((f) => window.MediaRecorder.isTypeSupported?.(f));
    const rec = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    // This recording's own pieces, so nothing from another recording can mix in.
    const pieces = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) pieces.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(pieces, { type: rec.mimeType || mimeType || 'audio/webm' });
      const peak = meter.current?.peak();
      // One line per recording, for diagnosing microphone problems from the browser console.
      console.info(
        `[voice] ${since()} from "${micName}" as ${blob.type}: ${blob.size} bytes, peak level ${peak == null ? 'n/a' : peak.toFixed(3)}`,
      );
      release();
      setLevel(0);
      starting.current = false;
      if (cancelled.current) {
        setState('idle');
        return;
      }
      const quiet = peak !== null && peak !== undefined && peak < SILENCE_LEVEL;
      if (blob.size < MIN_RECORDING_BYTES) {
        setError(
          `Nothing usable was recorded (${since()}, ${blob.size} bytes from “${micName}”). Wait for “Speak now”, speak for a few seconds, then stop.`,
        );
        setState('idle');
        return;
      }
      // Even if the meter read near-silence, let Whisper decide: the meter can misjudge a quiet voice.
      upload(blob, { micName, quiet });
    };
    recorder.current = rec;
    // Safari takes a moment to start capturing; words spoken before `onstart` are lost, so the
    // "Speak now" cue and the timer only appear once it has really started.
    let begun = false;
    const begin = () => {
      if (begun || recorder.current !== rec) return;
      begun = true;
      setSeconds(0);
      setState('recording');
      const startedAt = Date.now();
      let warned = false;
      timer.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(s);
        // Say so while they're still talking if the microphone hears nothing.
        const peak = meter.current?.peak();
        if (!warned && s >= 3 && peak !== null && peak !== undefined && peak < SILENCE_LEVEL) {
          warned = true;
          setError(`Very little sound is coming through from “${micName}”. Speak closer, or check the microphone.`);
        }
        if (s >= MAX_RECORDING_SECONDS) stop();
      }, 250);
    };
    rec.onstart = begin;
    rec.onerror = (e) => {
      console.error('[voice] recorder error', e.error ?? e);
      setError('The recording stopped unexpectedly. Try again, or type the handover.');
      cancelled.current = true;
      if (rec.state !== 'inactive') rec.stop();
    };
    // No timeslice: the browser hands over the whole recording as one file when it stops.
    // (Safari's WebM recorder drops audio when asked for one-second pieces.)
    rec.start();
    // Some browsers don't fire `start` reliably; if it's recording after 2 s, go ahead.
    setTimeout(() => rec.state === 'recording' && begin(), 2000);
  }

  function stop() {
    clearInterval(timer.current);
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
  }

  function cancel() {
    cancelled.current = true;
    setError('');
    if (recorder.current) {
      stop();
      return;
    }
    // Still waiting for permission: forget that attempt so the mic can be tapped again.
    attempt.current += 1;
    starting.current = false;
    setState('idle');
  }

  const recording = state === 'recording';
  const waiting = state === 'permission' || state === 'starting';
  const busy = waiting || state === 'transcribing';
  const noteId = `${id}-note`;

  let note;
  if (!canRecord) note = 'Voice needs a newer browser';
  else if (state === 'permission') note = 'Allow the microphone…';
  else if (state === 'starting') note = 'Wait…';
  else if (recording && seconds < 2) note = 'Speak now';
  else if (recording) note = <span className="num">{clock(seconds)}</span>;
  else if (state === 'transcribing') note = 'Turning speech into text…';
  else note = 'Speak instead';

  return (
    <div className={`composer__mic ${recording ? 'composer__mic--recording' : ''}`}>
      <button
        type="button"
        id={id}
        className={`mic-btn ${recording ? 'mic-btn--recording' : ''}`}
        onClick={recording ? stop : start}
        disabled={!canRecord || busy || disabled}
        aria-describedby={noteId}
        aria-label={recording ? 'Stop recording and turn it into text' : 'Speak the handover'}
        title={recording ? 'Stop recording' : 'Speak the handover (English or Swahili)'}
      >
        {busy ? (
          <CircleNotch size={22} className="spin" aria-hidden="true" />
        ) : recording ? (
          <Stop size={22} weight="fill" aria-hidden="true" />
        ) : (
          <Microphone size={22} aria-hidden="true" />
        )}
      </button>
      {recording && (
        <span className="mic-level" aria-hidden="true">
          <span className="mic-level__bar" style={{ transform: `scaleX(${Math.max(0.04, level)})` }} />
        </span>
      )}
      <span id={noteId} className="mic-btn__note" aria-live="polite">
        {note}
        {recording && <span className="visually-hidden"> recorded. Press stop when you’re done.</span>}
      </span>
      {(recording || waiting) && (
        <button type="button" className="mic-btn__cancel" onClick={cancel}>
          <X size={12} aria-hidden="true" />
          Cancel
        </button>
      )}
    </div>
  );
}
