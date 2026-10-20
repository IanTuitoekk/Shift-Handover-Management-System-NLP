import { Link } from 'react-router-dom';
import { ArrowRight, WarningOctagon } from '@phosphor-icons/react';

/**
 * Attention tiles on one raised strip, separated by rules (not five cards). Each links to the
 * filtered view behind the number. Critical tiles get the red tab and an icon.
 *   tiles: [{ key, label, value, detail, to, linkLabel, critical }]
 */
export function OverviewTiles({ tiles, loading }) {
  return (
    <section className="tiles" aria-label="Shift at a glance">
      {tiles.map((tile) => (
        <div key={tile.key} className={`tile ${tile.critical ? 'tile--critical' : ''}`}>
          <span className="tile__label">
            {tile.label}
            {tile.critical && <WarningOctagon size={16} weight="fill" aria-label="Needs attention" />}
          </span>
          {loading ? <span className="skeleton tile__skeleton" /> : <span className="tile__value">{tile.value}</span>}
          <span className="tile__detail">{tile.detail}</span>
          <Link to={tile.to} className="tile__link">
            {tile.linkLabel}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      ))}
    </section>
  );
}
