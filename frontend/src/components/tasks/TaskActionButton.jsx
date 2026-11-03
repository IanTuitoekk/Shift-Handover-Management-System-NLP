import { useState } from 'react';

/**
 * A one-click task action that can be undone (mark done, send back), so no confirm step.
 * `onAction` returns a promise; errors show beside the button.
 */
export function TaskActionButton({ onAction, label, busyLabel, icon: Icon, variant = 'secondary', errorText = 'Couldn’t update this task. Try again.' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    try {
      await onAction();
    } catch {
      setError(errorText);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="resolve">
      <button type="button" className={`btn btn-${variant}`} onClick={run} disabled={busy}>
        {Icon && <Icon size={16} aria-hidden="true" />}
        {busy ? busyLabel : label}
      </button>
      <span aria-live="polite">{error && <span className="field-error">{error}</span>}</span>
    </span>
  );
}
