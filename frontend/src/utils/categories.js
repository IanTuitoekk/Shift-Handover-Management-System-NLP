import { ClipboardText, Question, Truck, Wrench } from '@phosphor-icons/react';
import { sentenceCase } from './format';

// The incident taxonomy the classifier emits (backend/db/seed.sql). Each gets a fixed icon so
// categories are recognisable without relying on colour.
const CATEGORY_META = {
  'aircraft equipment problem': { icon: Wrench, short: 'Equipment' },
  'deviation/discrepancy - procedural': { icon: ClipboardText, short: 'Procedural' },
  'other/rare ground event': { icon: Truck, short: 'Ground event' },
};

export const KNOWN_CATEGORIES = [
  'Aircraft Equipment Problem',
  'Deviation/Discrepancy - Procedural',
  'Other/Rare Ground Event',
];

export function categoryMeta(name) {
  if (!name) return { icon: Question, label: 'Unclassified', short: 'Unclassified' };
  const meta = CATEGORY_META[name.toLowerCase()];
  return { icon: meta?.icon ?? Question, label: sentenceCase(name), short: meta?.short ?? sentenceCase(name) };
}
