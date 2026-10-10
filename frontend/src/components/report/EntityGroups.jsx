import { Airplane, Clock, Gear, ListChecks, MapPin, User } from '@phosphor-icons/react';

const ENTITY_TYPES = [
  { type: 'AIRCRAFT', label: 'Aircraft', icon: Airplane },
  { type: 'COMPONENT', label: 'Component', icon: Gear },
  { type: 'LOCATION', label: 'Location', icon: MapPin },
  { type: 'ROLE', label: 'Role', icon: User },
  { type: 'TASK', label: 'Task', icon: ListChecks },
  { type: 'TIME', label: 'Time', icon: Clock },
];

/** Extracted entities grouped by type, in a fixed order. Aircraft text is never auto-translated. */
export function EntityGroups({ entities = [], ruled = false, emptyText = 'The model didn’t extract any details from this handover.' }) {
  const groups = ENTITY_TYPES.map((meta) => ({
    ...meta,
    items: entities.filter((e) => e.entity_type === meta.type),
  })).filter((g) => g.items.length);

  if (!groups.length) return <p className="entities-empty">{emptyText}</p>;

  return (
    <dl className={`entities ${ruled ? 'entities--ruled' : ''}`}>
      {groups.map(({ type, label, icon: Icon, items }) => (
        <div key={type} className="entities__group">
          <dt>
            <Icon size={16} aria-hidden="true" />
            {label}
          </dt>
          <dd>
            {items.map((e, i) => (
              <span key={`${e.entity_text}-${i}`} className="entity" translate={type === 'AIRCRAFT' ? 'no' : undefined}>
                {e.entity_text}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
