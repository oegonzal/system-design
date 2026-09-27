import { FACTORS, rankLeads, scoreLead } from './scoring';
import { opportunityOf, tinyProfile } from './testing';
import { containsPhrase, tokenize } from './text';

const NOW = Date.parse('2026-09-26T12:00:00Z');
const profile = tinyProfile();

const pointsOf = (lead: ReturnType<typeof scoreLead>) =>
  Object.fromEntries(lead.factors.map((trace) => [trace.id, trace.points]));

describe('scoring', () => {
  it('[GOV-4] prices a fitting opportunity by the profile and traces every point', () => {
    const lead = scoreLead(opportunityOf(), profile, NOW);
    // naics 332710 exact (1) · psc 5340 in family 53 (0.5) · interests: both terms (1.1 → 1)
    // · SBA (1) · Solicitation (1) · 14 days left → band 14 (1)
    expect(pointsOf(lead)).toEqual({
      naics: 30,
      psc: 7.5,
      interests: 15,
      setAside: 15,
      noticeType: 10,
      deadline: 15,
    });
    expect(lead.score).toBe(92.5);
    expect(lead.tier).toBe('high');
    expect(lead.excluded).toBeNull();
    expect(lead.factors.map((trace) => trace.id)).toEqual(FACTORS.map((factor) => factor.id));
    expect(lead.factors.reduce((total, trace) => total + trace.points, 0)).toBeCloseTo(
      lead.score,
      6,
    );
    expect(lead.factors.find((trace) => trace.id === 'interests')?.evidence).toEqual([
      'additive manufacturing',
      'replacement parts (as "replacement brackets")',
    ]);
    expect(lead.factors.find((trace) => trace.id === 'psc')?.evidence).toEqual([
      'psc 5340 in family 53',
    ]);
  });

  it('[GOV-4] scores a family match by the depth of the family, and nothing for no match', () => {
    const family = scoreLead(opportunityOf({ naicsCode: '541519', naicsCodes: [] }), profile, NOW);
    expect(family.factors[0]).toMatchObject({
      id: 'naics',
      value: 4 / 6,
      points: 20,
      evidence: ['naics 541519 in family 5415'],
    });
    const none = scoreLead(
      opportunityOf({ naicsCode: '722511', naicsCodes: ['722511'] }),
      profile,
      NOW,
    );
    expect(none.factors[0]).toMatchObject({
      value: 0,
      points: 0,
      evidence: ['no naics family matched'],
    });
    const missing = scoreLead(opportunityOf({ naicsCode: null, naicsCodes: [] }), profile, NOW);
    expect(missing.factors[0].value).toBe(0);
  });

  it.each([
    ['an ineligible set-aside', { setAsideCode: '8A' }, 'setAside', 'ineligible set-aside 8A'],
    [
      'an excluded notice type',
      { noticeType: 'Award Notice' },
      'noticeType',
      'notice type Award Notice',
    ],
    [
      'a passed deadline',
      { responseDeadlineAt: '2026-09-25T00:00:00.000Z' },
      'deadline',
      'deadline passed 2026-09-25T00:00:00.000Z',
    ],
    ['an inactive notice', { active: false }, 'deadline', 'inactive'],
  ])('[GOV-4] excludes %s by gate, not by weight', (_label, overrides, factor, reason) => {
    const lead = scoreLead(opportunityOf(overrides), profile, NOW);
    expect(lead.excluded).toEqual({ factor, reason });
    expect(lead.score).toBe(0);
    expect(lead.tier).toBeNull();
    // The trace still shows what every other factor saw.
    expect(lead.factors).toHaveLength(FACTORS.length);
  });

  it('prices unrestricted, unknown notice types and missing deadlines by the profile defaults', () => {
    const lead = scoreLead(
      opportunityOf({ setAsideCode: null, noticeType: 'Something New', responseDeadlineAt: null }),
      profile,
      NOW,
    );
    expect(pointsOf(lead)).toMatchObject({ setAside: 7.5, noticeType: 2, deadline: 6 });
    expect(lead.factors.find((trace) => trace.id === 'noticeType')?.evidence).toEqual([
      'notice type Something New priced by default',
    ]);
  });

  it('prices deadlines by band and beyond the last band', () => {
    const at = (iso: string) => scoreLead(opportunityOf({ responseDeadlineAt: iso }), profile, NOW);
    expect(at('2026-09-28T12:00:00Z').factors[5].value).toBe(0.3); // 2 days
    expect(at('2026-10-10T12:00:00Z').factors[5].value).toBe(1); // 14 days
    expect(at('2026-11-05T12:00:00Z').factors[5].value).toBe(0.8); // 40 days
    expect(at('2027-01-01T12:00:00Z').factors[5]).toMatchObject({
      value: 0.6,
      evidence: ['97 day(s) to respond, beyond the last band'],
    });
  });

  it('[GOV-4] ranks deterministically: score, then newest, then notice id; exclusions kept apart', () => {
    const candidates = [
      opportunityOf({ noticeId: 'c', postedAt: '2026-09-20T00:00:00.000Z' }),
      opportunityOf({ noticeId: 'b', postedAt: '2026-09-21T00:00:00.000Z' }),
      opportunityOf({ noticeId: 'a', postedAt: '2026-09-21T00:00:00.000Z' }),
      opportunityOf({ noticeId: 'weak', naicsCode: '722511', naicsCodes: [] }),
      opportunityOf({ noticeId: 'out', setAsideCode: 'HZC' }),
    ];
    const once = rankLeads(candidates, profile, NOW);
    const twice = rankLeads([...candidates].reverse(), profile, NOW);
    expect(once.leads.map((lead) => lead.opportunity.noticeId)).toEqual(['a', 'b', 'c', 'weak']);
    expect(twice.leads.map((lead) => lead.opportunity.noticeId)).toEqual(['a', 'b', 'c', 'weak']);
    expect(once.excluded.map((lead) => lead.opportunity.noticeId)).toEqual(['out']);
    expect(once.leads[3]?.tier).toBe('medium');
  });
});

describe('the tokenizer', () => {
  it('folds case, width and punctuation and matches phrases as whole tokens in order', () => {
    expect(tokenize('３D-Printed Brackets, (Qty: 400)')).toEqual([
      '3d',
      'printed',
      'brackets',
      'qty',
      '400',
    ]);
    const tokens = tokenize('Reverse engineering of legacy software components');
    expect(containsPhrase(tokens, tokenize('reverse engineering'))).toBe(true);
    expect(containsPhrase(tokens, tokenize('software components'))).toBe(true);
    expect(containsPhrase(tokens, tokenize('engineering software'))).toBe(false);
    expect(containsPhrase(tokens, tokenize('ware'))).toBe(false);
    expect(containsPhrase(tokens, [])).toBe(false);
  });
});
