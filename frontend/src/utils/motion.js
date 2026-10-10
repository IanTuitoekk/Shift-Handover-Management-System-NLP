// Exit transitions last --dur-3 (320ms); under reduced motion they are instant.
const LEAVE_MS = 320;

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/** Runs `fn` after an element's exit transition (immediately under reduced motion). */
export function afterLeave(fn) {
  setTimeout(fn, prefersReducedMotion() ? 0 : LEAVE_MS);
}
