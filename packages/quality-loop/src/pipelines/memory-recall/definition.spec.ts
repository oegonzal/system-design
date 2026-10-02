import { describe, expect, it } from 'vitest';

import { criterionLengthBound } from '../../core/contracts';
import { describePipeline, validatePipeline } from '../../core/pipeline';
import { criteriaSchema } from '../../core/stages/schemas';
import { boundsBelowMeasured, jsonSchemaTypes } from '../../core/testing';
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

  it('[QL-2] its deriver keeps the contract’s statement bound, above the longest it has measurably written', () => {
    // 286 characters across the recorded runs (static/runs, to 2026-10-02):
    // the persona asks for the query's own numbers and wording, never for
    // every alias, so no bound of its own is declared.
    expect(MEMORY_RECALL.task.maxStatementLength).toBeUndefined();
    const kinds = Object.keys(MEMORY_RECALL.task.criterionKinds) as [string, ...string[]];
    const schema = criteriaSchema(
      kinds,
      MEMORY_RECALL.task.maxCriteria,
      criterionLengthBound(MEMORY_RECALL.task),
    );
    expect(boundsBelowMeasured(schema, { 'criteria[].statement': 286 })).toEqual([]);
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

  it('[QL-4] every prose bound the producer is shown sits above the longest it has measurably written', () => {
    // The longest each path has been written across the recorded runs
    // (static/runs, to 2026-10-01). A string past its bound is a miss that
    // discards the whole answer — never cut to fit — so no bound may be one
    // the producer meets.
    const measured: Record<string, number> = {
      summary: 842,
      'kept[].serves': 163,
      'kept[].insight': 575,
      'kept[].caveat': 267,
      'dropped[].reason': 250,
      'gaps[]': 200,
    };
    expect(boundsBelowMeasured(memoryPackOutput.schema, measured)).toEqual([]);
  });

  it('[QL-6] the pack a model answers with contains no number', () => {
    const types = jsonSchemaTypes(memoryPackOutput.schema);
    expect(types).not.toContain('number');
    expect(types).not.toContain('integer');
  });
});
