import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X } from '@phosphor-icons/react';

const TOAST_MS = 7000;

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  const Icon = toast.icon;
  return (
    <li className={`toast toast--${toast.tone ?? 'accent'}`}>
      {Icon && <Icon size={20} weight="fill" aria-hidden="true" className="toast__icon" />}
      <div className="toast__body">
        <p className="toast__title">{toast.title}</p>
        {toast.text && <p className="toast__text">{toast.text}</p>}
        {toast.to && (
          <Link to={toast.to} className="toast__link" onClick={() => onDismiss(toast.id)}>
            {toast.linkLabel ?? 'Open'}
          </Link>
        )}
      </div>
      <button type="button" className="icon-btn toast__close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
        <X size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

/** Short-lived notices for real-time events. Announced politely to screen readers. */
export function Toasts({ toasts, onDismiss }) {
  return (
    <ol className="toasts" aria-live="polite" aria-label="Notifications">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </ol>
  );
}
