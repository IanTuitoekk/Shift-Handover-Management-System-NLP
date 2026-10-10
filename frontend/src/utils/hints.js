/*
 * Completeness hints for the handover composer.
 *
 * These are simple keyword checks run in the browser while the user types. They are NOT the
 * model's extraction: they only nudge the writer to mention the six things the NLP service
 * looks for (aircraft, component, role, location, task, time). English and common Swahili
 * terms are covered; anything not matched is shown as a gentle prompt, never an error.
 */

const RULES = [
  {
    type: 'AIRCRAFT',
    label: 'Aircraft',
    prompt: 'Which aircraft?',
    patterns: [
      /\b5Y-?[A-Z]{3}\b/i, // Kenyan registrations, e.g. 5Y-KZD
      /\b(?:B|Boeing\s?)7[0-9]7(?:-\d+)?\b/i,
      /\b(?:E|ERJ|Embraer\s?)-?1[79]0\b/i,
      /\b(?:A|Airbus\s?)3[0-9]{2}\b/i,
      /\b(?:Q400|Dash\s?8|ATR\s?\d+)\b/i,
      /\b(?:aircraft|ndege)\b/i,
    ],
  },
  {
    type: 'COMPONENT',
    label: 'Component',
    prompt: 'Which part or system?',
    patterns: [
      /\b(?:main |nose )?(?:landing )?gear\b/i,
      /\b(?:tyre|tire|wheel|brake|engine|APU|pump|hydraulic\w*|valve|actuator|door|seal|bearing|sensor|battery|flap|slat|fuel \w+|oil \w+|cargo door|galley|lav(?:atory)?|injini|gurudumu|breki)\b/i,
    ],
  },
  {
    type: 'ROLE',
    label: 'Role',
    prompt: 'Who should act on it?',
    patterns: [
      /\b(?:engineer|technician|mechanic|supervisor|crew|pilot|captain|inspector|loader|marshaller|stores|planner|fundi|mhandisi|msimamizi)s?\b/i,
      /\bB1\b|\bB2\b/,
    ],
  },
  {
    type: 'LOCATION',
    label: 'Location',
    prompt: 'Where is it?',
    patterns: [
      /\b(?:stand|bay|gate|parking)\s?[A-Z]?\d+[A-Z]?\b/i,
      /\b(?:hangar|apron|ramp|runway|taxiway|terminal|stores|workshop|JKIA|NBO|MBA|KIS|EDL)\b/i,
    ],
  },
  {
    type: 'TASK',
    label: 'Task',
    prompt: 'What needs doing?',
    patterns: [
      /\b(?:replace\w*|repair\w*|inspect\w*|check\w*|fit|fitted|install\w*|remov\w*|order\w*|tested|clean\w*|refuel\w*|tow\w*|servic\w*|top(?:ped)? up|monitor\w*|\w*badilish\w*|\w*kagu\w*|\w*tengenez\w*|\w*safish\w*)\b/i,
    ],
  },
  {
    type: 'TIME',
    label: 'Time',
    prompt: 'By when?',
    patterns: [
      /\b(?:[01]?\d|2[0-3])[:.][0-5]\d\b/,
      /\b(?:[01]\d|2[0-3])[0-5]\d\s?(?:h|hrs|L|Z)?\b/,
      /\b(?:tonight|today|tomorrow|this (?:morning|afternoon|evening)|next shift|before departure|asubuhi|mchana|jioni|usiku|kesho|leo)\b/i,
    ],
  },
];

/** Returns one entry per category: { type, label, prompt, found, match }. */
export function completenessHints(text = '') {
  return RULES.map((rule) => {
    let match = null;
    for (const pattern of rule.patterns) {
      const m = text.match(pattern);
      if (m) {
        match = m[0];
        break;
      }
    }
    return { type: rule.type, label: rule.label, prompt: rule.prompt, found: Boolean(match), match };
  });
}
