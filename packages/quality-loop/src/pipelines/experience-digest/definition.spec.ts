import {
  boundsAgainstMeasured,
  CRITERION_STATEMENT_BOUND,
  LARGEST_STATEMENT_BOUND,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { describePipeline, validatePipeline } from '../../core/pipeline';
import { capsAgainstMeasured, deriverSchema, jsonSchemaTypes } from '../../core/testing';
import { EXPERIENCE_DIGEST } from './definition';
import measured from './measured.json';
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

  it('[QL-53] every finding type declares what it withholds of the memories it names, and a duplicate set withholds none of them', () => {
    const withholds = Object.fromEntries(
      Object.entries(EXPERIENCE_DIGEST.policy.findingTypes).map(([type, mapped]) => [
        type,
        mapped.withholds,
      ]),
    );
    expect(withholds).toEqual({
      missed_signal: 'none',
      unsupported_effect: 'every-ref',
      misattributed_evidence: 'every-ref',
      run_specific: 'every-ref',
      vague_insight: 'none',
      duplicate_memory: 'none',
    });
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

  it('[QL-4] [QL-49] every bound its producer and deriver are shown sits above what they have measurably written', () => {
    // `measured.json`: every field across the recorded runs, refreshed by
    // `pnpm measure:bounds`. A target under the 99th percentile written would
    // make most replies overruns, and a ceiling at or under the longest would
    // keep it past the ceiling rather than accept it.
    expect(
      boundsAgainstMeasured(
        [experienceDigestOutput.schema, deriverSchema(EXPERIENCE_DIGEST.task)],
        measured.fields,
      ),
    ).toEqual([]);
  });

  it('[QL-2] [QL-47] its deriver’s statement bound is the largest a pipeline may declare — the one the edge’s cap is sized from, declared once — above the contract’s, and its persona asks for concision', () => {
    // The longest statement the digest's deriver has written (751
    // characters, in a record whose rubric was refused whole for it, three
    // attempts running) is held by the fixture above; the persona that asked
    // for every alias and iteration is gone.
    expect(EXPERIENCE_DIGEST.task.statementBound).toBe(LARGEST_STATEMENT_BOUND);
    expect(describePipeline(EXPERIENCE_DIGEST as never).task.maxStatementLength).toBeGreaterThan(
      CRITERION_STATEMENT_BOUND.ceiling,
    );
    expect(measured.fields['criteria[].statement'].max).toBeGreaterThan(
      CRITERION_STATEMENT_BOUND.ceiling,
    );
    const persona = EXPERIENCE_DIGEST.deriveCriteria.persona;
    expect(persona).toMatch(/one concise sentence/);
    expect(persona).toMatch(/within the length the schema asks for/);
    expect(persona).not.toMatch(/Name the aliases and iterations/);
  });

  it('[QL-33] [QL-49] every declared output cap is a fifth above what its stage has measurably written', () => {
    // A cap is also the call's time limit, so one a stage outwrites is a call
    // cut short — as the producer was, at a fixed 300 s, on 2026-10-02.
    expect(measured.runs).toBeGreaterThan(0);
    expect(capsAgainstMeasured(EXPERIENCE_DIGEST, measured.caps)).toEqual([]);
  });

  it('[QL-6] the digest a model answers with contains no number', () => {
    const types = jsonSchemaTypes(experienceDigestOutput.schema);
    expect(types).not.toContain('number');
    expect(types).not.toContain('integer');
  });
});
