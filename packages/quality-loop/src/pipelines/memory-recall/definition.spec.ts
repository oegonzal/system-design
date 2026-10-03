import { boundsAgainstMeasured, modelSchema, parseLenient } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { describePipeline, validatePipeline } from '../../core/pipeline';
import { capsAgainstMeasured, deriverSchema, jsonSchemaTypes } from '../../core/testing';
import { MEMORY_RECALL } from './definition';
import measured from './measured.json';
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

  it('[QL-2] [QL-49] its deriver keeps the contract’s statement bound, above what it has measurably written', () => {
    // The persona asks for the query's own numbers and wording, never for
    // every alias, so no bound of its own is declared; the contract's is held
    // to what the deriver wrote with the producer's fields, below.
    expect(MEMORY_RECALL.task.statementBound).toBeUndefined();
    expect(measured.fields['criteria[].statement'].n).toBeGreaterThan(0);
  });

  it('[QL-50] a chunk that only restates what the producer holds is a precision finding a critic is told to raise, priced and never gating', () => {
    expect(MEMORY_RECALL.task.findingTypes).toHaveProperty('restated_defect');
    expect(MEMORY_RECALL.policy.findingTypes['restated_defect']).toEqual({
      dimension: 'precision',
      gate: false,
      withholds: 'every-ref',
    });
    // Priced: its dimension carries weight in the overall score.
    expect(MEMORY_RECALL.policy.dimensionWeights['precision']).toBeGreaterThan(0);
    // Earnable: a lens is asked for it by name, beside the query's own section it reads.
    const raising = MEMORY_RECALL.critics.filter((lens) =>
      lens.persona.includes('(restated_defect)'),
    );
    expect(raising.map((lens) => lens.id)).toEqual(['critic.relevance']);
    expect(raising[0].persona).toContain('already in hand');
  });

  it('[QL-53] every finding type declares what it withholds of the chunks it names', () => {
    const withholds = Object.fromEntries(
      Object.entries(MEMORY_RECALL.policy.findingTypes).map(([type, mapped]) => [
        type,
        mapped.withholds,
      ]),
    );
    expect(withholds).toEqual({
      missed_chunk: 'none',
      no_usable_memory: 'every-ref',
      irrelevant_chunk: 'every-ref',
      redundant_chunk: 'all-but-one',
      restated_defect: 'every-ref',
      unsupported_insight: 'every-ref',
      misleading_chunk: 'every-ref',
      stale_chunk: 'every-ref',
    });
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

  it('[QL-4] [QL-49] every bound its producer and deriver are shown sits above what they have measurably written', () => {
    // `measured.json`: every field across the recorded runs, refreshed by
    // `pnpm measure:bounds`. A target under the 99th percentile written would
    // make most replies overruns, and a ceiling at or under the longest would
    // keep it past the ceiling rather than accept it.
    expect(
      boundsAgainstMeasured(
        [memoryPackOutput.schema, deriverSchema(MEMORY_RECALL.task)],
        measured.fields,
      ),
    ).toEqual([]);
  });

  it('[QL-58] the pack asks for each bound’s target and keeps a verdict a little past it whole', () => {
    const { json, bounds } = modelSchema(memoryPackOutput.schema);
    expect(bounds['kept[].serves']).toMatchObject({ kind: 'text', target: 200 });
    expect(JSON.stringify(json)).toContain('"maxLength":200');
    const [first, second] = samplePack().kept;
    const serves = 'the list read while the POS feed is down, and what it serves; '
      .repeat(4)
      .trim();
    expect(serves.length).toBeGreaterThan(bounds['kept[].serves'].target);
    expect(serves.length).toBeLessThanOrEqual(bounds['kept[].serves'].ceiling);
    const read = parseLenient(
      memoryPackOutput.schema,
      samplePack({ kept: [{ ...first, serves }, second] }),
    );
    expect(read.ok).toBe(true);
    expect(read.overruns.map((overrun) => [overrun.path, overrun.handling])).toEqual([
      ['kept[0].serves', 'accepted'],
    ]);
  });

  it('[QL-33] [QL-49] every declared output cap is a fifth above what its stage has measurably written', () => {
    // A cap is also the call's time limit, so one a stage outwrites is a call cut short.
    expect(measured.runs).toBeGreaterThan(0);
    expect(capsAgainstMeasured(MEMORY_RECALL, measured.caps)).toEqual([]);
  });

  it('[QL-6] the pack a model answers with contains no number', () => {
    const types = jsonSchemaTypes(memoryPackOutput.schema);
    expect(types).not.toContain('number');
    expect(types).not.toContain('integer');
  });
});
