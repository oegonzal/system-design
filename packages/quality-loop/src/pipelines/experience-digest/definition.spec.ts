import { describe, expect, it } from 'vitest';

import { describePipeline, validatePipeline } from '../../core/pipeline';
import { jsonSchemaTypes } from '../../core/testing';
import { EXPERIENCE_DIGEST } from './definition';
import { experienceDigestOutput } from './output';
import { sampleDigest } from './testing';

describe('the experience-digest pipeline', () => {
  it('[QL-1] is valid data with md personas loaded beside it', () => {
    expect(() => validatePipeline(EXPERIENCE_DIGEST as never)).not.toThrow();
    const summary = describePipeline(EXPERIENCE_DIGEST as never);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    for (const lens of [...EXPERIENCE_DIGEST.critics, ...EXPERIENCE_DIGEST.evaluators]) {
      expect(lens.persona.length).toBeGreaterThan(80);
    }
    expect(EXPERIENCE_DIGEST.deriveCriteria.persona.length).toBeGreaterThan(80);
    expect(EXPERIENCE_DIGEST.producer.persona).toContain('experience-digest');
    expect(summary.validators.map((validator) => validator.id)).toEqual(['references', 'limits']);
  });

  it('[QL-4] every location the digest exposes is printed verbatim where a judge reads it', () => {
    const digest = sampleDigest();
    const rendered = experienceDigestOutput.render(digest);
    for (const location of experienceDigestOutput.locate(digest)) {
      expect(rendered).toContain(`[${location.id}]`);
    }
    expect(experienceDigestOutput.locate(digest).map((location) => location.id)).toEqual([
      'summary',
      'memory.1',
      'f2',
      'r2',
    ]);
    expect(experienceDigestOutput.schema.safeParse(digest).success).toBe(true);
  });

  it('[QL-4] a location is a place — the summary, a memory, an unused slot — never a memory’s citation', () => {
    // Two memories arguing from different evidence share no location, so the
    // normaliser cannot chain a finding on one to a finding on the other
    // through a citation, and admission excludes only the memory a finding
    // is located at.
    const digest = sampleDigest({
      memories: [
        ...sampleDigest().memories,
        {
          evidence: ['f2'],
          insight: 'Name the fix for a contradiction or escalate it.',
          appliesWhen: 'a critic finds two parts that cannot both hold',
        },
      ],
      unused: ['r2'],
    });
    const ids = experienceDigestOutput.locate(digest).map((location) => location.id);
    expect(ids).toEqual(['summary', 'memory.1', 'memory.2', 'r2']);
    for (const memory of digest.memories) {
      for (const alias of memory.evidence) expect(ids).not.toContain(alias);
    }
  });

  it('[QL-6] the digest a model answers with contains no number', () => {
    const types = jsonSchemaTypes(experienceDigestOutput.schema);
    expect(types).not.toContain('number');
    expect(types).not.toContain('integer');
  });
});
