/**
 * Horizontal bar list (dataviz: magnitude, one hue). Every bar carries a visible value label in
 * text colour at its tip, so the list is also its own table view.
 *   rows: [{ key, label (node), value, note (node, optional) }]
 */
export function BarList({ rows, max, unit = '', label, emptyText = 'No data yet.' }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="chart-empty">{emptyText}</p>;
  return (
    <ul className="barlist" aria-label={label}>
      {rows.map((r) => {
        const width = r.value === 0 ? 0 : Math.max(2, (r.value / top) * 100);
        return (
          <li key={r.key} className="barlist__row" title={`${r.title ?? ''}${r.title ? ': ' : ''}${r.value}${unit}`}>
            <span className="barlist__label">{r.label}</span>
            <span className="barlist__track" aria-hidden="true">
              <span className="barlist__bar" style={{ width: `${width}%` }} />
              <span className="barlist__value num">{r.value}</span>
            </span>
            <span className="visually-hidden">
              {r.value}
              {unit}
            </span>
            {r.note && <span className="barlist__note">{r.note}</span>}
          </li>
        );
      })}
    </ul>
  );
}
