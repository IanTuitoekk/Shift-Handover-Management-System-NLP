/*
 * Lightweight English / Swahili / mixed detector for handover narratives.
 *
 * Counts common function words and frequent maintenance terms in each language. It only fills
 * handover_submissions.language_variant for analysis (e.g. model accuracy per language); it never
 * affects classification. Returns 'en', 'sw', 'mixed', or null when there is too little signal.
 */

const SWAHILI = new Set([
  // function words
  'na', 'ya', 'wa', 'za', 'la', 'cha', 'vya', 'kwa', 'ni', 'si', 'ya', 'katika', 'kwenye', 'kutoka',
  'hadi', 'mpaka', 'baada', 'kabla', 'lakini', 'pia', 'sana', 'tu', 'bado', 'tayari', 'hii', 'hiyo',
  'huu', 'hizi', 'hapa', 'pale', 'kuna', 'hakuna', 'iko', 'yuko', 'wako', 'ina', 'ana', 'kama',
  'au', 'ili', 'wakati', 'leo', 'kesho', 'jana', 'asubuhi', 'mchana', 'jioni', 'usiku', 'saa',
  // common handover vocabulary
  'ndege', 'tatizo', 'shida', 'gurudumu', 'magurudumu', 'breki', 'mlango', 'ubawa', 'mafuta',
  'fundi', 'mhandisi', 'msimamizi', 'kazi', 'imeharibika', 'imekamilika', 'imerekebishwa',
  'inahitaji', 'inavuja', 'badilisha', 'imebadilishwa', 'kagua', 'akague', 'imekaguliwa',
  'tengeneza', 'safisha', 'agiza', 'imeagizwa', 'subiri', 'sehemu', 'nje', 'ndani', 'mpya', 'zamani',
]);

const ENGLISH = new Set([
  'the', 'and', 'of', 'to', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had',
  'on', 'at', 'for', 'with', 'in', 'from', 'by', 'before', 'after', 'until', 'it', 'this', 'that',
  'needs', 'need', 'not', 'no', 'all', 'still', 'also', 'will', 'should', 'please', 'left', 'right',
  'aircraft', 'engine', 'tyre', 'tire', 'gear', 'brake', 'brakes', 'door', 'leak', 'pump', 'hydraulic',
  'replaced', 'replacement', 'replace', 'ordered', 'checked', 'inspect', 'inspected', 'repair',
  'repaired', 'worn', 'damaged', 'fault', 'stand', 'hangar', 'engineer', 'crew', 'shift', 'tonight',
  'tomorrow', 'morning', 'evening', 'done', 'pending',
]);

const MIN_SIGNAL = 2; // words matched in either list before we commit to an answer
const DOMINANT = 0.8; // share needed to call a text single-language

function detectLanguage(text = '') {
  const words = String(text).toLowerCase().match(/[a-zÀ-ɏ]+/g) || [];
  let sw = 0;
  let en = 0;
  for (const word of words) {
    if (SWAHILI.has(word)) sw += 1;
    else if (ENGLISH.has(word)) en += 1;
  }
  const total = sw + en;
  if (total < MIN_SIGNAL) return null;
  const swShare = sw / total;
  if (swShare >= DOMINANT) return 'sw';
  if (swShare <= 1 - DOMINANT) return 'en';
  return 'mixed';
}

module.exports = { detectLanguage };
