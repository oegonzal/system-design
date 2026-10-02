import { describe, expect, it } from 'vitest';

import { fieldLimit, limitAnnouncement, limitCopy } from './field-limit';

describe('fieldLimit', () => {
  it('has nothing to say of a field without a limit, or one told never to speak of it', () => {
    expect(fieldLimit(10, undefined, 'near')).toBeNull();
    expect(fieldLimit(10, 0, 'near')).toBeNull();
    expect(fieldLimit(120, 120, 'never')).toBeNull();
  });

  it('shows the count from the last tenth of the limit on, whatever the limit', () => {
    expect(fieldLimit(107, 120, 'near')).toMatchObject({
      remaining: 13,
      near: false,
      shown: false,
    });
    expect(fieldLimit(108, 120, 'near')).toMatchObject({ remaining: 12, near: true, shown: true });
    expect(fieldLimit(3599, 4000, 'near')).toMatchObject({ near: false, shown: false });
    expect(fieldLimit(3600, 4000, 'near')).toMatchObject({ remaining: 400, shown: true });
    // A limit too short to have a tenth still warns on its last character.
    expect(fieldLimit(4, 5, 'near')).toMatchObject({ remaining: 1, shown: true });
    expect(fieldLimit(3, 5, 'near')).toMatchObject({ remaining: 2, shown: false });
  });

  it('shows the count throughout when asked to, and is near only in the last stretch', () => {
    expect(fieldLimit(0, 120, 'always')).toMatchObject({
      remaining: 120,
      near: false,
      shown: true,
    });
    expect(fieldLimit(115, 120, 'always')).toMatchObject({ near: true, shown: true });
  });

  it('never counts below nothing left, for a value set past the limit from code', () => {
    expect(fieldLimit(140, 120, 'near')).toMatchObject({ remaining: 0, near: true, shown: true });
  });
});

describe('the limit’s wording', () => {
  const at = (length: number, max = 4000) => {
    const limit = fieldLimit(length, max, 'always');
    if (limit === null) throw new Error('a limited field has a standing');
    return limit;
  };

  it('counts what is left in words, with the number grouped', () => {
    expect(limitCopy(at(0))).toBe('4,000 characters left');
    expect(limitCopy(at(3999))).toBe('1 character left');
    expect(limitCopy(at(4000))).toBe('Limit reached — 4,000 characters at most.');
  });

  it('announces only entering the last stretch and reaching the limit', () => {
    expect(limitAnnouncement(at(100))).toBe('');
    expect(limitAnnouncement(at(3600))).toBe('Nearing the limit of 4,000 characters.');
    expect(limitAnnouncement(at(3999))).toBe('Nearing the limit of 4,000 characters.');
    expect(limitAnnouncement(at(4000))).toBe('Limit of 4,000 characters reached.');
  });
});
