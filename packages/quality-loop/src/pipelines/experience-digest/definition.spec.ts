import { CRITERION_STATEMENT_BOUND } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { criterionLengthBound } from '../../core/contracts';
import { describePipeline, validatePipeline } from '../../core/pipeline';
import { criteriaSchema } from '../../core/stages/schemas';
import { boundsBelowMeasured, capsBelowMeasured, jsonSchemaTypes } from '../../core/testing';
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

  it('[QL-4] every prose bound the producer is shown sits above the longest it has measurably written', () => {
    // The longest each path has been written across the recorded runs
    // (static/runs, to 2026-10-01). A string past its bound is a miss that
    // discards the whole answer — never cut to fit — so no bound may be one
    // the producer meets.
    const measured: Record<string, number> = {
      summary: 755,
      'memories[].insight': 862,
      'memories[].appliesWhen': 235,
    };
    expect(boundsBelowMeasured(experienceDigestOutput.schema, measured)).toEqual([]);
  });

  it('[QL-2] its deriver’s statement target sits above the longest it has measurably written, and its persona asks for concision', () => {
    // The longest statement the digest's deriver has written across the
    // recorded runs (static/runs, to 2026-10-02): 751 characters, in a
    // record whose rubric was refused whole for it, three attempts running.
    // The persona that asked for every alias and iteration is gone; the
    // target is still sized above what it produced, so a statement that long
    // is what was asked for, not an overrun kept past the ceiling.
    const kinds = Object.keys(EXPERIENCE_DIGEST.task.criterionKinds) as [string, ...string[]];
    const schema = criteriaSchema(
      kinds,
      EXPERIENCE_DIGEST.task.maxCriteria,
      criterionLengthBound(EXPERIENCE_DIGEST.task),
    );
    expect(boundsBelowMeasured(schema, { 'criteria[].statement': 751 })).toEqual([]);
    expect(describePipeline(EXPERIENCE_DIGEST as never).task.maxStatementLength).toBeGreaterThan(
      CRITERION_STATEMENT_BOUND.ceiling,
    );
    const persona = EXPERIENCE_DIGEST.deriveCriteria.persona;
    expect(persona).toMatch(/one concise sentence/);
    expect(persona).toMatch(/longer than the schema allows/);
    expect(persona).not.toMatch(/Name the aliases and iterations/);
    // The deriver has measurably written 6,783 output tokens for one record.
    expect(EXPERIENCE_DIGEST.deriveCriteria.maxTokens).toBeGreaterThan(6783);
  });

  it('[QL-33] every declared output cap is above what its stage has measurably written', () => {
    // The most output tokens, thinking included, each stage wrote across the
    // recorded digest runs (static/runs, 2026-09-20 – 2026-10-02). A cap is
    // also the call's time limit, so one a stage outwrites is a call cut
    // short — as the producer was, at a fixed 300 s, on 2026-10-02. The
    // producer's figure is an answer the schema missed.
    const measured: Record<string, number> = {
      criteria: 7_684,
      producer: 31_719,
      'critic.attribution': 26_918,
      'critic.provenance': 27_805,
      'critic.transfer': 19_963,
      'evaluator.attribution': 13_321,
    };
    expect(capsBelowMeasured(EXPERIENCE_DIGEST, measured)).toEqual([]);
  });

  it('[QL-6] the digest a model answers with contains no number', () => {
    const types = jsonSchemaTypes(experienceDigestOutput.schema);
    expect(types).not.toContain('number');
    expect(types).not.toContain('integer');
  });
});
