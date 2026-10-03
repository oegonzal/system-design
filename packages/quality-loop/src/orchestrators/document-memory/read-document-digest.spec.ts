import { describe, expect, it } from 'vitest';

import { DOCUMENT_DIGEST } from '../../pipelines/document-digest/definition';
import { WITHHOLDS } from '../memory/digest/endorsed';
import { DOCUMENT_WITHHOLDS } from './read-document-digest';

describe('what a document digest withholds', () => {
  it('[QL-40] declares a rule for every finding type the pipeline can report, and for none it cannot', () => {
    // A finding type with no declared rule falls to the strict default and silently
    // costs facts; one declared for a type the pipeline cannot report is dead data.
    expect(Object.keys(DOCUMENT_WITHHOLDS).sort()).toEqual(
      Object.keys(DOCUMENT_DIGEST.task.findingTypes).sort(),
    );
    for (const rule of Object.values(DOCUMENT_WITHHOLDS)) expect(WITHHOLDS).toContain(rule);
  });

  it('[QL-40] withholds a fact its sections do not support, and keeps a true one faulted only for its wording', () => {
    // These two say the fact is wrong — storing it would have the corpus assert
    // what the subject's own documents do not — and they are the gated pair.
    expect(DOCUMENT_WITHHOLDS['invented_fact']).toBe('every-ref');
    expect(DOCUMENT_WITHHOLDS['misread_section']).toBe('every-ref');
    for (const type of ['invented_fact', 'misread_section'] as const) {
      expect(DOCUMENT_DIGEST.policy.findingTypes[type]?.gate).toBe(true);
    }
    // These say a true fact is written weakly. Dropping it loses a detail the
    // corpus can never answer with again, so it is kept and the wording stands.
    for (const type of ['missed_fact', 'unusable_fact', 'vague_condition'] as const) {
      expect(DOCUMENT_WITHHOLDS[type]).toBe('none');
      expect(DOCUMENT_DIGEST.policy.findingTypes[type]?.gate).toBe(false);
    }
    // A duplicate is repaired by keeping one of the pair, not by losing both.
    expect(DOCUMENT_WITHHOLDS['duplicate_fact']).toBe('all-but-one');
  });
});
