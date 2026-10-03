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
    expect(fieldLimit(140, 120, 'near')).toMatchObject({
      remaining: 0,
      over: 20,
      past: 20,
      reached: true,
      near: true,
      shown: true,
    });
  });

  describe('with a target under the limit', () => {
    it('[UX-19] counts down to the ask, not the limit, and is near within the last tenth of the ask', () => {
      expect(fieldLimit(71, 120, 'near', 80)).toMatchObject({
        target: 80,
        remaining: 9,
        over: 0,
        near: false,
        shown: false,
      });
      expect(fieldLimit(72, 120, 'near', 80)).toMatchObject({
        remaining: 8,
        near: true,
        shown: true,
      });
    });

    it('is over the ask past the target and reached only at the limit', () => {
      expect(fieldLimit(80, 120, 'near', 80)).toMatchObject({
        remaining: 0,
        over: 0,
        reached: false,
      });
      expect(fieldLimit(95, 120, 'near', 80)).toMatchObject({
        remaining: 0,
        over: 15,
        reached: false,
        shown: true,
      });
      expect(fieldLimit(120, 120, 'near', 80)).toMatchObject({
        over: 40,
        past: 0,
        reached: true,
      });
      expect(fieldLimit(150, 120, 'near', 80)).toMatchObject({
        over: 70,
        past: 30,
        reached: true,
      });
    });

    it('takes the limit as the ask when the target is missing, past the limit, or nothing', () => {
      expect(fieldLimit(10, 120, 'near')).toMatchObject({ target: 120 });
      expect(fieldLimit(10, 120, 'near', 200)).toMatchObject({ target: 120 });
      expect(fieldLimit(10, 120, 'near', 0)).toMatchObject({ target: 120 });
    });
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

  describe('with a target under the limit', () => {
    const asked = (length: number) => {
      const limit = fieldLimit(length, 1500, 'always', 1200);
      if (limit === null) throw new Error('a limited field has a standing');
      return limit;
    };

    it('[UX-19] counts down to the ask, says the ask is met, then how far over it the value runs, and the limit last', () => {
      expect(limitCopy(asked(1193))).toBe('7 characters left');
      expect(limitCopy(asked(1200))).toBe('At the 1,200 asked — 1,500 at most');
      expect(limitCopy(asked(1201))).toBe('1 over the 1,200 asked — 1,500 at most');
      expect(limitCopy(asked(1438))).toBe('238 over the 1,200 asked — 1,500 at most');
      expect(limitCopy(asked(1500))).toBe('Limit reached — 1,500 characters at most.');
    });

    it('announces nearing the ask, meeting it, and reaching the limit — once each', () => {
      expect(limitAnnouncement(asked(1000))).toBe('');
      expect(limitAnnouncement(asked(1080))).toBe('Nearing the 1,200 characters asked.');
      expect(limitAnnouncement(asked(1199))).toBe('Nearing the 1,200 characters asked.');
      expect(limitAnnouncement(asked(1200))).toBe('At the 1,200 characters asked — 1,500 at most.');
      expect(limitAnnouncement(asked(1438))).toBe('At the 1,200 characters asked — 1,500 at most.');
      expect(limitAnnouncement(asked(1500))).toBe('Limit of 1,500 characters reached.');
    });

    it('[UX-22] says how far past the most accepted a value set from code runs, and that it must be shortened to submit — announced once', () => {
      expect(limitCopy(asked(1501))).toBe(
        '1 character past the 1,500 accepted — shorten it to submit.',
      );
      expect(limitCopy(asked(1545))).toBe(
        '45 characters past the 1,500 accepted — shorten it to submit.',
      );
      expect(limitAnnouncement(asked(1501))).toBe(
        'Past the limit of 1,500 characters — shorten it to submit.',
      );
      expect(limitAnnouncement(asked(1545))).toBe(limitAnnouncement(asked(1501)));
      // A field with no target words it alike.
      expect(limitCopy(at(4100))).toBe(
        '100 characters past the 4,000 accepted — shorten it to submit.',
      );
    });
  });
});
