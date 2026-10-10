import { useEffect, useState } from 'react';
import { Check } from '@phosphor-icons/react';

const CONFIRM_WINDOW_MS = 6000;

/**
 * Two-step resolve: "Mark resolved" turns into "Confirm resolved" + "Cancel". Resolving cannot be
 * undone in the API, so it is never a single click. `onResolve` returns a promise.
 */
export function ResolveButton({ onResolve, label = 'Mark resolved' }) {
  const [confirming, setConfirming] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!confirming || resolving) return;
    const id = setTimeout(() => setConfirming(false), CONFIRM_WINDOW_MS);
    return () => clearTimeout(id);
  }, [confirming, resolving]);

  async function confirm() {
    setResolving(true);
    setError('');
    try {
      await onResolve();
    } catch {
      setError('Couldn’t resolve this task. Try again.');
      setResolving(false);
      setConfirming(false);
    }
  }

  return (
    <span className="resolve">
      {confirming ? (
        <>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={resolving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={resolving}>
            <Check size={16} weight="bold" aria-hidden="true" />
            {resolving ? 'Resolving…' : 'Confirm resolved'}
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)}>
          {label}
        </button>
      )}
      <span aria-live="polite">{error && <span className="field-error">{error}</span>}</span>
    </span>
  );
}
