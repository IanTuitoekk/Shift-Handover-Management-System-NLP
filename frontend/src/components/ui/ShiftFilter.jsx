import { Moon, Sun, SunHorizon } from '@phosphor-icons/react';

const OPTIONS = [
  { value: 'all', label: 'All shifts', icon: SunHorizon },
  { value: 'day', label: 'Day', icon: Sun },
  { value: 'night', label: 'Night', icon: Moon },
];

/** All / Day / Night toggle. `counts` is optional: { all, day, night }. */
export function ShiftFilter({ shift, onChange, counts }) {
  return (
    <div className="segmented" role="group" aria-label="Filter by shift">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button key={value} type="button" className="segmented__btn" aria-pressed={shift === value} onClick={() => onChange(value)}>
          <Icon size={16} aria-hidden="true" />
          {label}
          {counts && <span className="count">{counts[value]}</span>}
        </button>
      ))}
    </div>
  );
}
