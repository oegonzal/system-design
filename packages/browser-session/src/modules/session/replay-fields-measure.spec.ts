import { LESSON_SEPARATOR, type MemoryRecordDto } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { predicateOf } from '../../adapters/memory-loop/teach';
import {
  citedFound,
  citedMatchOf,
  csvLine,
  foldWhitespace,
  KnownAnswers,
  percentile,
  sampledIndices,
  scopeLeaksOf,
  verdictOf,
} from './replay-fields-measure';

/** A semantic record as the recall answers one, with the fact given; nothing else of it matters to the match. */
const record = (predicate: string, value: string): MemoryRecordDto =>
  ({ body: { subject: 'Ada', predicate, value, validFrom: null } }) as unknown as MemoryRecordDto;

describe('the replay measures', () => {
  it('folds whitespace alone when comparing two codecs’ texts', () => {
    expect(foldWhitespace('  Ada  is\n authorised ')).toBe('Ada is authorised');
    expect(foldWhitespace('Ada is authorised')).toBe(foldWhitespace('Ada\tis   authorised'));
    expect(foldWhitespace('Ada is authorised.')).not.toBe(foldWhitespace('Ada is authorised'));
  });

  it('[BRW-21] finds a cited text by three declared rules read apart — the same words, the question’s identity, the fact’s words contained — never by the shape of its prose alone', () => {
    const question = 'What is your notice period?';
    const taught = `Two weeks${LESSON_SEPARATOR}${question}`;

    const standing = record(
      predicateOf(question),
      `Asked "${question}", Ada answered "Two weeks".`,
    );
    const unrelated = record('authorisation', 'Yes, authorised');
    // The taught answer: found by its identity and by its words, not by the loop's rendering.
    expect(citedMatchOf(taught, [standing, unrelated], new Set())).toEqual({
      equal: false,
      identity: true,
      contained: true,
    });
    // A standing answer the operator since changed: the identity still finds it, the words do not.
    const changed = record(predicateOf(question), `Asked "${question}", Ada answered "A month".`);
    expect(citedMatchOf(taught, [changed], new Set())).toEqual({
      equal: false,
      identity: true,
      contained: false,
    });
    // An ingested fact: the digest's words, whole, inside the record's value — or the same text again.
    const ingested = `Yes, authorised to work in this country${LESSON_SEPARATOR}Work authorisation`;
    expect(
      citedMatchOf(
        ingested,
        [record('authorisation', 'Yes, authorised to work in this country')],
        new Set(),
      ),
    ).toMatchObject({ identity: false, contained: true });
    expect(citedMatchOf('Ada — years: six', [], new Set(['Ada — years: six']))).toEqual({
      equal: true,
      identity: false,
      contained: false,
    });
    expect(citedFound({ equal: false, identity: false, contained: false })).toBe(false);
    expect(citedFound({ equal: false, identity: true, contained: false })).toBe(true);
    // A record of another kind declares no fact to compare.
    expect(
      citedMatchOf(
        taught,
        [{ body: { name: 'x', rules: [] } } as unknown as MemoryRecordDto],
        new Set(),
      ),
    ).toEqual({ equal: false, identity: false, contained: false });
  });

  it('[BRW-21] holds a judged value to the operator’s answer for its own unit, and to a subject-wide answer only where the answerer declared the question the subject’s or no unit was open', () => {
    const known = new KnownAnswers();
    known.record('Have you worked here before?', 'Yes', 'company=acme', 'unit');
    known.record('Have you worked here before?', 'No', 'company=globex', 'unit');
    known.record('Are you authorised to work here?', 'Yes', 'company=acme', 'subject');
    known.record('Preferred name?', 'Alex', null, null);
    // Each unit's own answer, never the other's; a third unit has none to be held to.
    expect(known.for('Have you worked here before?', 'company=acme', 'unit')).toBe('Yes');
    expect(known.for('Have you worked here before?', 'company=globex', 'unit')).toBe('No');
    expect(known.for('Have you worked here before?', 'company=initech', 'unit')).toBeNull();
    expect(known.for('Have you worked here before?', 'company=initech', null)).toBeNull();
    // A subject's answer reaches every unit where the question is declared the subject's, and every page outside a unit.
    expect(known.for('Are you authorised to work here?', 'company=initech', 'subject')).toBe('Yes');
    expect(known.for('Are you authorised to work here?', null, null)).toBe('Yes');
    expect(known.for('Are you authorised to work here?', 'company=initech', 'unit')).toBeNull();
    expect(known.for('Preferred name?', 'company=acme', 'subject')).toBe('Alex');
    // The latest answer stands.
    known.record('Preferred name?', 'Alexandra', null, null);
    expect(known.for('Preferred name?', null, null)).toBe('Alexandra');
  });

  it('takes a percentile by nearest rank, and none over no values', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([40], 90)).toBe(40);
    expect(percentile([30, 10, 20, 40, 50], 50)).toBe(30);
    expect(percentile([30, 10, 20, 40, 50], 90)).toBe(50);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
  });

  it('samples evenly across the whole, and takes everything when the sample covers it', () => {
    expect(sampledIndices(5, null)).toEqual([0, 1, 2, 3, 4]);
    expect(sampledIndices(3, 5)).toEqual([0, 1, 2]);
    expect(sampledIndices(10, 4)).toEqual([0, 2, 5, 7]);
    expect(sampledIndices(0, 3)).toEqual([]);
  });

  it('gives a judged field its verdict from the declared table, a typed value against the operator’s answer first', () => {
    expect(verdictOf('fill', 'fill', 'Yes', null)).toBe('same-fill');
    expect(verdictOf('ask-operator', 'fill', 'Yes', 'Yes')).toBe('new-fill');
    expect(verdictOf('ask-operator', 'fill', ' yes ', 'yes')).toBe('new-fill');
    expect(verdictOf('fill', 'ask-operator', null, null)).toBe('lost-fill');
    expect(verdictOf('ask-operator', 'ask-operator', 'a suggestion', 'Yes')).toBe('same-ask');
    expect(verdictOf('ask-operator', 'fill', 'No', 'Yes')).toBe('wrong');
    expect(verdictOf('fill', 'fill', null, 'Yes')).toBe('wrong');
    // A field kept or left blank is outside the acceptance table: no verdict.
    expect(verdictOf('keep', 'fill', 'Yes', null)).toBeNull();
    expect(verdictOf('fill', 'leave-blank', null, null)).toBeNull();
  });

  it('reads a leak off the record’s own scope against the request’s, by the bound keys', () => {
    const bound = { scope: { partition: 'tenant', unit: 'unit' } };
    const request = { tenant: 'verify-1', project: 'p', unit: 'a'.repeat(64) };
    expect(scopeLeaksOf({ tenant: 'verify-1', project: 'p' }, request, bound, 'verify-1')).toEqual({
      unitLeak: false,
      tenantLeak: false,
    });
    expect(scopeLeaksOf({ ...request }, request, bound, 'verify-1')).toEqual({
      unitLeak: false,
      tenantLeak: false,
    });
    expect(
      scopeLeaksOf({ ...request, unit: 'b'.repeat(64) }, request, bound, 'verify-1').unitLeak,
    ).toBe(true);
    // A unit record recalled where no unit was named is a leak too.
    expect(
      scopeLeaksOf({ ...request }, { tenant: 'verify-1', project: 'p' }, bound, 'verify-1')
        .unitLeak,
    ).toBe(true);
    expect(scopeLeaksOf({ ...request, tenant: 'other' }, request, bound, 'verify-1')).toEqual({
      unitLeak: false,
      tenantLeak: true,
    });
    // A binding that never narrows by a unit can show no unit leak.
    expect(
      scopeLeaksOf(
        { tenant: 'verify-1' },
        { tenant: 'verify-1' },
        { scope: { partition: 'tenant', unit: null } },
        'verify-1',
      ),
    ).toEqual({ unitLeak: false, tenantLeak: false });
  });

  it('writes a CSV line, quoting a cell that holds a comma, a quote or a line break', () => {
    expect(csvLine(['a', 1, true, null])).toBe('a,1,true,');
    expect(csvLine(['x, y', 'say "hi"', 'two\nlines'])).toBe('"x, y","say ""hi""","two\nlines"');
  });
});
