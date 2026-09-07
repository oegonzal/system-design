import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { describePipeline, validatePipeline } from '../../core/pipeline';
import { EXPERIENCE_DIGEST } from './definition';
import { experienceDigestOutput } from './output';
import { sampleDigest } from './testing';

const walk = (node: unknown, visit: (value: Record<string, unknown>) => void): void => {
  if (Array.isArray(node)) return node.forEach((item) => walk(item, visit));
  if (node && typeof node === 'object') {
    visit(node as Record<string, unknown>);
    Object.values(node).forEach((value) => walk(value, visit));
  }
};

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
      'f1',
      'r1',
      'f2',
      'r2',
    ]);
    expect(experienceDigestOutput.schema.safeParse(digest).success).toBe(true);
  });

  it('[QL-6] the digest a model answers with contains no number', () => {
    const types: string[] = [];
    walk(z.toJSONSchema(experienceDigestOutput.schema), (node) => {
      if (typeof node['type'] === 'string') types.push(node['type']);
    });
    expect(types).not.toContain('number');
    expect(types).not.toContain('integer');
  });
});
