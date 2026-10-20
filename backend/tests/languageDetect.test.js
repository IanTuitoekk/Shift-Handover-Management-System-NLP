const { detectLanguage } = require('../utils/languageDetect');

describe('detectLanguage', () => {
  test('English narrative', () => {
    expect(
      detectLanguage('5Y-KZD left main gear tyre worn past limits at stand 7. Replacement ordered, engineer to fit before 06:00.'),
    ).toBe('en');
  });

  test('Swahili narrative', () => {
    expect(detectLanguage('Ndege 5Y-KYZ ina tatizo la breki, fundi akague kesho asubuhi kwenye hangar.')).toBe('sw');
  });

  test('Code-switched narrative', () => {
    expect(
      detectLanguage('Hydraulic pump ya 5Y-KZD inavuja, engineer amesema replacement imeagizwa na itafika kesho.'),
    ).toBe('mixed');
  });

  test('Too little signal returns null', () => {
    expect(detectLanguage('5Y-KZD 06:00')).toBeNull();
    expect(detectLanguage('')).toBeNull();
  });

  test('Registrations and numbers do not count as words of either language', () => {
    expect(detectLanguage('5Y-KZD 5Y-KYZ B737 E190 the aircraft')).toBe('en');
  });
});
