import { useSearchParams } from 'react-router-dom';

/** The selected shift from the URL (`?shift=<shift id>|none`), so filtered views can be shared. */
export function useShiftParam() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('shift');
  const shift = raw === 'none' || /^[0-9a-f-]{36}$/i.test(raw ?? '') ? raw : 'all';
  const setShift = (value) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('shift');
    else next.set('shift', value);
    setParams(next, { replace: true });
  };
  return [shift, setShift];
}

/** Items carry `shift_id` (the shift of the handover behind them, or null) from the API. */
export const matchesShift = (item, shift) => shift === 'all' || (shift === 'none' ? !item.shift_id : item.shift_id === shift);

/** { all, none, [shift_id]: n } for the ShiftFilter. */
export function shiftCounts(items) {
  const counts = { all: items.length, none: 0 };
  for (const i of items) {
    const key = i.shift_id ?? 'none';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
