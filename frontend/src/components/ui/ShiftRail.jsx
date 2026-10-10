import { CheckCircle, PaperPlaneTilt } from '@phosphor-icons/react';
import { DAY_SHIFT_START, NIGHT_SHIFT_START } from '../../config';
import { formatTime, operationalDay } from '../../utils/format';

const TICK_HOURS = 3;
const KIND_META = {
  submitted: { icon: PaperPlaneTilt, label: 'Submitted' },
  resolved: { icon: CheckCircle, label: 'Resolved' },
};

/**
 * The shift rail: a 24h operational day (DAY_SHIFT_START to DAY_SHIFT_START) with the day and
 * night shifts as two segments, a "now" marker, and either personal event ticks (`events`)
 * or a reports-per-hour histogram (`perHour`, 24 counts).
 */
export function ShiftRail({ now, events, perHour, summary }) {
  const { start, end } = operationalDay(now);
  const span = end - start;
  const pos = (t) => `${Math.min(100, Math.max(0, ((new Date(t) - start) / span) * 100))}%`;
  const dayWidth = ((NIGHT_SHIFT_START - DAY_SHIFT_START) / 24) * 100;
  const max = perHour ? Math.max(1, ...perHour) : 1;
  const visibleEvents = (events ?? []).filter((e) => new Date(e.at) >= start && new Date(e.at) < end);

  const ticks = [];
  for (let h = 0; h <= 24; h += TICK_HOURS) {
    const t = new Date(start);
    t.setHours(t.getHours() + h);
    ticks.push({ h, label: formatTime(t) });
  }

  return (
    <figure className="rail" aria-label={summary}>
      <div className="rail__track">
        <div className="rail__segment rail__segment--day" style={{ width: `${dayWidth}%` }}>
          <span>Day</span>
        </div>
        <div className="rail__segment rail__segment--night" style={{ left: `${dayWidth}%`, width: `${100 - dayWidth}%` }}>
          <span>Night</span>
        </div>

        {perHour && (
          <div className="rail__hist" aria-hidden="true">
            {perHour.map((count, i) => (
              <span
                key={i}
                className="rail__bar"
                style={{ height: count ? `${20 + (count / max) * 70}%` : 0 }}
                title={`${count} report${count === 1 ? '' : 's'}`}
              />
            ))}
          </div>
        )}

        {visibleEvents.map((e, i) => {
          const meta = KIND_META[e.kind];
          const Icon = meta.icon;
          return (
            <span
              key={`${e.kind}-${e.at}-${i}`}
              className={`rail__event rail__event--${e.kind}`}
              style={{ left: pos(e.at) }}
              title={`${meta.label} ${formatTime(e.at)}${e.label ? `: ${e.label}` : ''}`}
              aria-hidden="true"
            >
              <Icon size={12} weight="bold" />
            </span>
          );
        })}

        <span className="rail__now" style={{ left: pos(now) }} aria-hidden="true">
          <span className="rail__now-label num">{formatTime(now)}</span>
        </span>
      </div>
      <div className="rail__ticks" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t.h} className="num" style={{ left: `${(t.h / 24) * 100}%` }}>
            {t.label}
          </span>
        ))}
      </div>
      {visibleEvents.length > 0 && (
        <figcaption className="visually-hidden">
          <ul>
            {visibleEvents.map((e, i) => (
              <li key={i}>
                {KIND_META[e.kind].label} at {formatTime(e.at)}
                {e.label ? `: ${e.label}` : ''}
              </li>
            ))}
          </ul>
        </figcaption>
      )}
    </figure>
  );
}
