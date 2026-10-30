import {
  DOCUMENT_MEMORY_KINDS,
  EVIDENCE_TEXT_MAX_LENGTH,
  FIELD_TYPES,
  fieldProbes,
  MAX_EVIDENCE,
  type FieldSpec,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { fill } from '../../core/testing';
import type { MemoryHit } from '../memory/ports';
import { hitOf } from '../memory/testing';
import {
  distinctHits,
  evidenceItems,
  evidenceRef,
  fieldEvidence,
  HITS_PER_FIELD_TYPE,
  searchProbes,
} from './probes';

const field = (
  ref: string,
  name: string,
  context: string | null = null,
  inputType: string | null = null,
): FieldSpec => ({
  ref,
  role: 'textbox',
  name,
  inputType,
  options: null,
  optionsOmitted: 0,
  value: null,
  required: false,
  invalid: false,
  maxLength: null,
  hiddenTraits: [],
  context,
});

const a = hitOf('Alex Example has six years of Python', 'digest-1', 'memory.1');
const b = hitOf('Alex Example is authorised to work in Portugal', 'digest-1', 'memory.2');
const c = hitOf('Alex Example lives in Lisbon', 'digest-2', 'memory.1');

describe('the form recall’s probes', () => {
  it('[QL-70] the recall declares how deep each kind of control draws — a free-text field deeper than a control that takes one value — over every declared field type', () => {
    // Every declared field type is classified — a new kind is a build error, never a silent default.
    expect(Object.keys(HITS_PER_FIELD_TYPE).sort()).toEqual([...FIELD_TYPES].sort());
    expect(HITS_PER_FIELD_TYPE.textarea).toBeGreaterThan(HITS_PER_FIELD_TYPE.text);
    expect(
      new Set(
        FIELD_TYPES.filter((type) => type !== 'textarea').map((type) => HITS_PER_FIELD_TYPE[type]),
      ),
    ).toEqual(new Set([3]));
  });

  it('[QL-38] [QL-71] every probe is asked of every named vector in one batch, each under its own budget, and only of what documents taught about the subject — of what was recorded for one unit of work, only the unit the page names', () => {
    const probes = searchProbes(
      [
        [1, 0],
        [0, 1],
      ],
      [3, 6],
      'company=acme',
    );
    expect(probes.map((probe) => [probe.using, probe.limit])).toEqual([
      ['condition', 3],
      ['lesson', 3],
      ['condition', 6],
      ['lesson', 6],
    ]);
    expect(() => searchProbes([[1, 0]], [], undefined)).toThrow('probe 0 has no budget');
    // Never a design lesson: a probe for this person's career reads the kinds a document teaches.
    expect(probes.every((probe) => probe.filter?.kinds === DOCUMENT_MEMORY_KINDS)).toBe(true);
    expect(DOCUMENT_MEMORY_KINDS).not.toContain('lesson');
    // Every probe names the page's unit; a page naming none names none, and reads no unit's memories.
    expect(probes.every((probe) => probe.filter?.unitKey === 'company=acme')).toBe(true);
    expect(
      searchProbes([[1, 0]], [3], undefined).every((probe) => probe.filter?.unitKey === undefined),
    ).toBe(true);
    expect(probes.map((probe) => probe.vector)).toEqual([
      [1, 0],
      [1, 0],
      [0, 1],
      [0, 1],
    ]);
  });

  it('[QL-38] each field’s lists are fused on their own, then dealt out by rank — every field’s best before any field’s second — one slot per fact, under a cap', () => {
    const probes = fieldProbes(
      [field('e1', 'Python'), field('e2', 'Location')],
      HITS_PER_FIELD_TYPE,
    );
    // Field 1: b is ranked by both named vectors, a by one; field 2: c first, then a again.
    const ranked = [[a, b], [b], [c, a], [c]];
    expect(distinctHits(ranked)).toBe(3);
    // Both fields' best first; field 2's second is a, already taken by field 1's.
    expect(fieldEvidence(probes, ranked).map((hit) => hit.text)).toEqual([b.text, c.text, a.text]);
    expect(fieldEvidence(probes, ranked, 2).map((hit) => hit.text)).toEqual([b.text, c.text]);
    expect(MAX_EVIDENCE).toBe(24);
    // A field with no probe contributes nothing; an empty search is empty evidence.
    expect(fieldEvidence({ texts: [], byField: [null], limits: [] }, [])).toEqual([]);
  });

  it('[QL-70] a free-text field is dealt as deep as its budget allows once every field has its first hits', () => {
    const probes = fieldProbes(
      [field('e1', 'Describe your experience', null, 'textarea'), field('e2', 'City')],
      HITS_PER_FIELD_TYPE,
    );
    const story = (rank: number) => hitOf(`story part ${rank}`, 'digest-9', `memory.${rank}`);
    const ranks = Array.from({ length: HITS_PER_FIELD_TYPE.textarea }, (_, i) => i + 1);
    const stories = ranks.map(story);
    // The textarea's lists run its whole budget deep under both vectors; the city's one hit stands alone.
    const ranked = [stories, stories, [c], [c]];
    const chosen = fieldEvidence(probes, ranked);
    expect(chosen.map((hit) => hit.text)).toEqual([
      'story part 1',
      c.text,
      ...ranks.slice(1).map((rank) => `story part ${rank}`),
    ]);
  });

  it('[QL-38] the evidence is aliased m1.. in order, carries what the store holds each fact as and where it came from — the pipeline that digested it and the point’s address as one token — and stays within the goal’s bound per item', () => {
    const fact = (hit: MemoryHit, kind: 'profile_fact' | 'claim_boundary'): MemoryHit => ({
      ...hit,
      source: { ...hit.source, kind },
    });
    const long = fact(
      hitOf(fill(EVIDENCE_TEXT_MAX_LENGTH + 40, 'f'), 'digest-3', 'memory.4'),
      'claim_boundary',
    );
    // A hit of a kind no document wrote is no evidence about the subject.
    const items = evidenceItems([fact(a, 'profile_fact'), b, long]);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      alias: 'm1',
      text: a.text,
      when: '2026-09-06',
      // A point written before scopes holds as every document fact did: of the subject.
      scope: 'subject',
      kind: 'profile_fact',
      source: { origin: 'system-design', ref: 'digest-1#memory.1' },
    });
    expect(evidenceRef(a.source)).toBe('digest-1#memory.1');
    // A point that declares its scope is read as it declared it.
    expect(evidenceItems([{ ...fact(a, 'profile_fact'), scope: 'unit' }])[0]?.scope).toBe('unit');
    expect(items[1]?.kind).toBe('claim_boundary');
    expect(items[1].alias).toBe('m2');
    expect(items[1].text).toHaveLength(EVIDENCE_TEXT_MAX_LENGTH);
    expect(items[1].text.endsWith('…')).toBe(true);
  });
});
