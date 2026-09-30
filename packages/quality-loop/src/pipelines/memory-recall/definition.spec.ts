import { describe, expect, it } from 'vitest';

import { describePipeline, validatePipeline } from '../../core/pipeline';
import { jsonSchemaTypes } from '../../core/testing';
import { MEMORY_RECALL } from './definition';
import { memoryPackOutput } from './output';
import { samplePack } from './testing';

describe('the memory-recall pipeline', () => {
  it('[QL-1] is valid data with md personas loaded beside it', () => {
    expect(() => validatePipeline(MEMORY_RECALL as never)).not.toThrow();
    const summary = describePipeline(MEMORY_RECALL as never);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    for (const lens of [...MEMORY_RECALL.critics, ...MEMORY_RECALL.evaluators]) {
      expect(lens.persona.length).toBeGreaterThan(80);
    }
    expect(MEMORY_RECALL.deriveCriteria.persona.length).toBeGreaterThan(80);
    expect(MEMORY_RECALL.producer.persona).toContain('memory-recall');
    expect(summary.validators.map((validator) => validator.id)).toEqual(['references', 'limits']);
  });

  it('[QL-4] every location the pack exposes is printed verbatim where a judge reads it', () => {
    const pack = samplePack();
    const rendered = memoryPackOutput.render(pack);
    for (const location of memoryPackOutput.locate(pack)) {
      expect(rendered).toContain(`[${location.id}]`);
    }
    expect(memoryPackOutput.locate(pack).map((location) => location.id)).toEqual([
      'summary',
      'm1',
      'm2',
      'm3',
      'gap.1',
    ]);
    expect(memoryPackOutput.schema.safeParse(pack).success).toBe(true);
  });

  it('[QL-6] the pack a model answers with contains no number', () => {
    const types = jsonSchemaTypes(memoryPackOutput.schema);
    expect(types).not.toContain('number');
    expect(types).not.toContain('integer');
  });
});
