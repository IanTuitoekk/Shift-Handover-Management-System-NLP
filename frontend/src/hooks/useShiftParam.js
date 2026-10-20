import { useSearchParams } from 'react-router-dom';

/** The selected shift from the URL (`?shift=day|night`), so filtered views can be shared. */
export function useShiftParam() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('shift');
  const shift = raw === 'day' || raw === 'night' ? raw : 'all';
  const setShift = (value) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('shift');
    else next.set('shift', value);
    setParams(next, { replace: true });
  };
  return [shift, setShift];
}

/** Items carry `shift` ('day' | 'night') from the API. */
export const matchesShift = (item, shift) => shift === 'all' || item.shift === shift;

export function shiftCounts(items) {
  return {
    all: items.length,
    day: items.filter((i) => i.shift === 'day').length,
    night: items.filter((i) => i.shift === 'night').length,
  };
}
