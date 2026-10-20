import { CheckCircle, Circle } from '@phosphor-icons/react';
import { completenessHints } from '../../utils/hints';

/**
 * Live nudges for the six things the NLP service extracts. These are keyword checks in the
 * browser, labelled as hints so nobody mistakes them for the model's output.
 */
export function CompletenessHints({ text }) {
  const hints = completenessHints(text);
  const found = hints.filter((h) => h.found).length;
  const started = text.trim().length > 0;

  return (
    <div className="hints" aria-describedby="hints-note">
      <div className="hints__head">
        <span className="hints__title">Completeness hints</span>
        <span id="hints-note" className="hints__note">
          Checked on this device as you type. Not the model’s extraction.
        </span>
        {started && (
          <span className="hints__score num" aria-live="polite">
            {found}/6 covered
          </span>
        )}
      </div>
      <ul className="hints__list">
        {hints.map((h) => (
          <li key={h.type} className={`hint ${h.found ? 'hint--found' : ''}`}>
            {h.found ? (
              <CheckCircle size={16} weight="fill" aria-hidden="true" />
            ) : (
              <Circle size={16} aria-hidden="true" />
            )}
            <span className="hint__label">{h.label}</span>
            <span className="hint__detail" translate={h.type === 'AIRCRAFT' ? 'no' : undefined}>
              {h.found ? h.match : started ? h.prompt : ''}
            </span>
            <span className="visually-hidden">{h.found ? ', mentioned' : ', not mentioned yet'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
