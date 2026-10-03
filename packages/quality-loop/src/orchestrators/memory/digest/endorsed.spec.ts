import { describe, expect, it } from 'vitest';

import { DEFAULT_WITHHOLD, WITHHOLDS, withheldRefs, type Withhold } from './endorsed';

const finding = (type: string, refs: readonly string[]) => ({ type, locationRefs: refs });

describe('what a digest withholds', () => {
  it('[QL-40] withholds by what a finding says about the fact, not by how many items it names', () => {
    const findings = [
      finding('invented_fact', ['memory.2', 'memory.5']),
      finding('duplicate_fact', ['memory.1', 'memory.3', 'memory.4']),
      finding('unusable_fact', ['memory.6']),
    ];
    const withholds: Record<string, Withhold> = {
      invented_fact: 'every-ref',
      duplicate_fact: 'all-but-one',
      unusable_fact: 'none',
    };
    // A wrong fact goes, however many it names; a duplicate keeps one of its set;
    // a true fact faulted for its wording stays.
    expect([...withheldRefs(findings, withholds)].sort()).toEqual([
      'memory.2',
      'memory.3',
      'memory.4',
      'memory.5',
    ]);
  });

  it('[QL-40] a finding type nothing declares withholds every item it names, so a new type is strict until it is decided', () => {
    expect(DEFAULT_WITHHOLD).toBe('every-ref');
    const findings = [finding('a_type_no_table_names', ['memory.1', 'memory.2'])];
    expect([...withheldRefs(findings, { other: 'none' })].sort()).toEqual(['memory.1', 'memory.2']);
    // No table at all is the same strictness — what every digest did before any was declared.
    expect([...withheldRefs(findings)]).toHaveLength(2);
    // Nothing to withhold from, and nothing withheld.
    expect(withheldRefs([], {}).size).toBe(0);
    expect(withheldRefs([finding('unusable_fact', [])], { unusable_fact: 'none' }).size).toBe(0);
    // `all-but-one` on a finding naming one item keeps it: there is no other to prefer.
    expect(withheldRefs([finding('dup', ['memory.1'])], { dup: 'all-but-one' }).size).toBe(0);
    expect(WITHHOLDS).toEqual(['every-ref', 'all-but-one', 'none']);
  });
});
