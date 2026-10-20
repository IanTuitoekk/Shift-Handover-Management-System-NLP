import { useEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';

/** Native modal dialog (focus trap, Esc to close) with a title bar. */
export function Dialog({ open, onClose, title, titleId, children, wide = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal--wide' : ''}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal__head">
        <h2 id={titleId} className="section__title">
          {title}
        </h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="modal__body">{open && children}</div>
    </dialog>
  );
}
