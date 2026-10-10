import { formatDay } from '../../utils/format';

/**
 * Reports per shift, oldest to newest, as columns (dataviz: change over a few periods, one
 * series). The current shift is emphasised in the data hue; earlier shifts use the
 * de-emphasis grey. Values sit on each cap; low-confidence counts are listed in the table.
 *   data: [{ shift, value, lowConfidence }]
 */
export function ShiftTrend({ data, label = 'Reports per shift' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="trend">
      <div className="trend__plot" aria-hidden="true">
        {data.map((d, i) => {
          const current = i === data.length - 1;
          return (
            <div key={d.shift.key} className="trend__col" title={`${d.shift.name} ${formatDay(d.shift.start)}: ${d.value}`}>
              <span className="trend__value num">{d.value}</span>
              <span
                className={`trend__bar ${current ? 'trend__bar--current' : ''}`}
                style={{ height: d.value ? `${Math.max(4, (d.value / max) * 100)}%` : 0 }}
              />
            </div>
          );
        })}
      </div>
      <div className="trend__axis" aria-hidden="true">
        {data.map((d, i) => (
          <span key={d.shift.key} className={i === data.length - 1 ? 'trend__axis--current' : ''}>
            {d.shift.name === 'Day' ? 'D' : 'N'} {formatDay(d.shift.start)}
            {i === data.length - 1 && <span className="trend__now">Now</span>}
          </span>
        ))}
      </div>
      <table className="visually-hidden">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Shift</th>
            <th scope="col">Reports</th>
            <th scope="col">Below 60% confidence</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.shift.key}>
              <th scope="row">
                {d.shift.name} {formatDay(d.shift.start)}
              </th>
              <td>{d.value}</td>
              <td>{d.lowConfidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
