import { EVIDENCE_TEXT_MAX_LENGTH, MAX_EVIDENCE, type FieldSpec } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { fill } from '../../core/testing';
import { sampleFields } from '../../pipelines/field-answer/testing';
import { hitOf } from '../memory/testing';
import {
  distinctHits,
  evidenceItems,
  fieldEvidence,
  fieldProbes,
  HITS_PER_PROBE,
  MAX_FIELD_PROBES,
  probeText,
  searchProbes,
} from './probes';

const field = (ref: string, name: string, context: string | null = null): FieldSpec => ({
  ref,
  role: 'textbox',
  name,
  inputType: null,
  options: null,
  required: false,
  maxLength: null,
  hiddenTraits: [],
  context,
});

const a = hitOf('Alex Example has six years of Python', 'digest-1', 'memory.1');
const b = hitOf('Alex Example is authorised to work in Portugal', 'digest-1', 'memory.2');
const c = hitOf('Alex Example lives in Lisbon', 'digest-2', 'memory.1');

describe('the form recall’s probes', () => {
  it('[QL-38] a field’s own label is its probe, with the help text beside it, and fields asking the same thing share one', () => {
    expect(
      probeText(field('e1', '  Years of  experience ', 'Whole years,\nprofessional only.')),
    ).toBe('Years of experience. Whole years, professional only.');
    expect(probeText(field('e2', 'Work authorisation'))).toBe('Work authorisation');
    const probes = fieldProbes([
      field('e1', 'City'),
      field('e2', 'Country'),
      field('e3', 'City'),
      field('e4', '   '),
    ]);
    expect(probes).toEqual({ texts: ['City', 'Country'], byField: [0, 1, 0, null] });
    expect(fieldProbes(sampleFields()).texts).toHaveLength(5);
    const many = fieldProbes(
      Array.from({ length: MAX_FIELD_PROBES + 2 }, (_, index) => field(`e${index}`, `q${index}`)),
    );
    expect(many.texts).toHaveLength(MAX_FIELD_PROBES);
    expect(many.byField.slice(-2)).toEqual([null, null]);
  });

  it('[QL-38] every probe is asked of every named vector in one batch, each with the same small budget', () => {
    const probes = searchProbes([
      [1, 0],
      [0, 1],
    ]);
    expect(probes.map((probe) => [probe.using, probe.limit])).toEqual([
      ['condition', HITS_PER_PROBE],
      ['lesson', HITS_PER_PROBE],
      ['condition', HITS_PER_PROBE],
      ['lesson', HITS_PER_PROBE],
    ]);
    expect(probes.map((probe) => probe.vector)).toEqual([
      [1, 0],
      [1, 0],
      [0, 1],
      [0, 1],
    ]);
  });

  it('[QL-38] each field’s lists are fused on their own, the fields joined in field order, one slot per lesson, under a cap', () => {
    const probes = fieldProbes([field('e1', 'Python'), field('e2', 'Location')]);
    // Field 1: b is ranked by both named vectors, a by one; field 2: c first, then a again.
    const ranked = [[a, b], [b], [c, a], [c]];
    expect(distinctHits(ranked)).toBe(3);
    expect(fieldEvidence(probes, ranked).map((hit) => hit.text)).toEqual([b.text, a.text, c.text]);
    expect(fieldEvidence(probes, ranked, 2).map((hit) => hit.text)).toEqual([b.text, a.text]);
    expect(MAX_EVIDENCE).toBe(24);
    // A field with no probe contributes nothing; an empty search is empty evidence.
    expect(fieldEvidence({ texts: [], byField: [null] }, [])).toEqual([]);
  });

  it('[QL-38] the evidence is aliased m1.. in order, carries where each fact came from, and stays within the goal’s bound per item', () => {
    const long = hitOf(fill(EVIDENCE_TEXT_MAX_LENGTH + 40, 'f'), 'digest-3', 'memory.4');
    const items = evidenceItems([a, long]);
    expect(items[0]).toEqual({
      alias: 'm1',
      text: a.text,
      when: '2026-09-06',
      source: { runId: 'digest-1', pipeline: 'system-design', ref: 'memory.1' },
    });
    expect(items[1].alias).toBe('m2');
    expect(items[1].text).toHaveLength(EVIDENCE_TEXT_MAX_LENGTH);
    expect(items[1].text.endsWith('…')).toBe(true);
  });
});
