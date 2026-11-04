import { Moon, Sun, SunHorizon, Prohibit } from '@phosphor-icons/react';
import { activeShifts } from '../../utils/shiftClock';

// Shifts starting in daylight hours get the sun; others the moon.
const iconFor = (s) => {
  const hour = Number(String(s.start_time).slice(0, 2));
  return hour >= 5 && hour < 17 ? Sun : Moon;
};

/**
 * All shifts, or one of the active shifts set up by supervisors (and "No shift" when some items
 * have none). `counts` is optional: { all, none, [shift_id]: n }.
 */
export function ShiftFilter({ shift, onChange, counts }) {
  const options = [
    { value: 'all', label: 'All shifts', icon: SunHorizon },
    ...activeShifts().map((s) => ({ value: s.shift_id, label: s.name, icon: iconFor(s) })),
    ...(counts?.none || shift === 'none' ? [{ value: 'none', label: 'No shift', icon: Prohibit }] : []),
  ];
  return (
    <div className="segmented" role="group" aria-label="Filter by shift">
      {options.map(({ value, label, icon: Icon }) => (
        <button key={value} type="button" className="segmented__btn" aria-pressed={shift === value} onClick={() => onChange(value)}>
          <Icon size={16} aria-hidden="true" />
          {label}
          {counts && <span className="count">{counts[value] ?? 0}</span>}
        </button>
      ))}
    </div>
  );
}
