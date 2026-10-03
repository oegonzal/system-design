import { CRITERION_STATEMENT_MAX_LENGTH, KNOWLEDGE_ITEM_KINDS } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { describePipeline, validatePipeline } from '../../core/pipeline';
import {
  boundsBelowMeasured,
  capsBelowMeasured,
  declaredCaps,
  jsonSchemaTypes,
} from '../../core/testing';
import { KNOWLEDGE_DIGEST } from './definition';
import { KNOWLEDGE_KINDS, knowledgeDigestOutput, polarityOf } from './output';
import { sampleDigest } from './testing';

describe('the knowledge-digest pipeline', () => {
  it('[QL-1] is valid data with md personas loaded beside it', () => {
    expect(() => validatePipeline(KNOWLEDGE_DIGEST as never)).not.toThrow();
    const summary = describePipeline(KNOWLEDGE_DIGEST as never);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    for (const lens of [...KNOWLEDGE_DIGEST.critics, ...KNOWLEDGE_DIGEST.evaluators]) {
      expect(lens.persona.length).toBeGreaterThan(80);
    }
    expect(KNOWLEDGE_DIGEST.deriveCriteria.persona.length).toBeGreaterThan(80);
    expect(KNOWLEDGE_DIGEST.id).toBe('knowledge-digest');
    expect(KNOWLEDGE_DIGEST.goalSource).toBe('composed');
    expect(KNOWLEDGE_DIGEST.producer.persona).toContain('knowledge-digest');
    expect(summary.controller.id).toBe('standard');
  });

  it('[QL-1] coverage and novelty earn from a criterion kind; fidelity and reuse are the declared exception', () => {
    const earning = new Set(
      Object.values(KNOWLEDGE_DIGEST.policy.criterionKinds).map((kind) => kind.dimension),
    );
    expect([...earning].sort()).toEqual(['coverage', 'novelty']);
    // `fidelity` and `reuse` are priced by findings alone, as in the experience
    // digest: a digest nobody faulted renormalises them out rather than being
    // credited for them. Stated here so the exception is declared, not implied.
    const priced = new Set(
      Object.values(KNOWLEDGE_DIGEST.policy.findingTypes).map((type) => type.dimension),
    );
    for (const dimension of Object.keys(KNOWLEDGE_DIGEST.policy.dimensionWeights)) {
      expect(earning.has(dimension) || priced.has(dimension)).toBe(true);
    }
    expect(['fidelity', 'reuse'].every((dimension) => !earning.has(dimension))).toBe(true);
  });

  it('[QL-42] types knowledge by what it is, gates what would be false in the store, and prices what is merely weak', () => {
    // Four kinds, and the store's chunk kinds are built from the same list.
    expect(Object.keys(KNOWLEDGE_KINDS)).toEqual([...KNOWLEDGE_ITEM_KINDS]);
    for (const kind of KNOWLEDGE_ITEM_KINDS)
      expect(KNOWLEDGE_KINDS[kind].length).toBeGreaterThan(20);
    expect(KNOWLEDGE_ITEM_KINDS.map(polarityOf)).toEqual([null, 'avoid', 'do', 'do']);

    expect(Object.keys(KNOWLEDGE_DIGEST.task.criterionKinds)).toEqual([
      'signal',
      'transition',
      'held',
      'delta',
    ]);
    // A gap is graded by the coverage evaluator's fail, never faulted as a
    // defect in an item: in the experience digest 20 of 21 confirmed
    // `missed_signal` findings named an item they were not faulting.
    expect(Object.keys(KNOWLEDGE_DIGEST.task.findingTypes)).not.toContain('missed_signal');

    const gated = Object.entries(KNOWLEDGE_DIGEST.policy.findingTypes)
      .filter(([, mapped]) => mapped.gate)
      .map(([type]) => type);
    expect(gated).toEqual(['misattributed_evidence', 'ungrounded_fact', 'run_specific']);
    // Weak is not wrong: an item a rewrite would improve stays priced.
    expect(KNOWLEDGE_DIGEST.policy.findingTypes['vague_item'].gate).toBe(false);
    expect(KNOWLEDGE_DIGEST.policy.findingTypes['duplicate_item'].gate).toBe(false);

    expect(KNOWLEDGE_DIGEST.policy.evidence.minHits).toBe(2);
    for (const lens of [...KNOWLEDGE_DIGEST.critics, ...KNOWLEDGE_DIGEST.evaluators]) {
      expect(lens.samples).toBe(2);
      expect(lens.persona).toContain('knowledge-digest');
      expect(lens.persona).toMatch(/item/);
    }
    expect(KNOWLEDGE_DIGEST.critics.map((lens) => lens.id)).toEqual([
      'critic.grounding',
      'critic.generality',
      'critic.novelty',
    ]);
    expect(KNOWLEDGE_DIGEST.evaluators.map((lens) => lens.criterionKinds)).toEqual([
      ['signal', 'transition', 'held'],
      ['delta'],
    ]);
    // The producer is told to write a delta, and the deriver to keep statements short.
    expect(KNOWLEDGE_DIGEST.producer.persona).toMatch(/confirms/);
    expect(KNOWLEDGE_DIGEST.producer.persona).toMatch(/contradicts/);
    expect(KNOWLEDGE_DIGEST.deriveCriteria.persona).toMatch(/longer than the schema allows/);
    // A delta criterion names a known item, the register that ran long in the parent.
    expect(describePipeline(KNOWLEDGE_DIGEST as never).task.maxStatementLength).toBeGreaterThan(
      CRITERION_STATEMENT_MAX_LENGTH,
    );
    expect(KNOWLEDGE_DIGEST.validators.map((validator) => validator.id)).toEqual([
      'references',
      'limits',
      'run-specificity',
      'dimension',
      'kinds',
    ]);
    // Bookkeeping blocks; a content rule faults one item and lets the digest stand.
    expect(KNOWLEDGE_DIGEST.validators.map((validator) => validator.gate)).toEqual([
      'block',
      'block',
      'warn',
      'warn',
      'warn',
    ]);
  });

  it('[QL-33] every declared output cap is above what its stage has measurably written', () => {
    // SEEDED from the experience digest's measured calls (docs/quality-loop/
    // memory-digest-and-recall.md §2.5: deriver 7,684 output tokens for 16
    // criteria, producer 31,719 for 8 items against a 32,000 cap, critics to
    // 27,805, its one evaluator 13,321), mapped onto this pipeline's lenses:
    // grounding takes provenance's, generality and novelty take transfer's,
    // both evaluators take attribution's. A cap is also the call's time limit,
    // so one a stage outwrites is a call cut short. Re-pin from this pipeline's
    // own runs once twenty are recorded.
    const measured: Record<string, number> = {
      criteria: 7_684,
      producer: 31_719,
      'critic.grounding': 27_805,
      'critic.generality': 19_963,
      'critic.novelty': 19_963,
      'evaluator.coverage': 13_321,
      'evaluator.novelty': 13_321,
    };
    expect(capsBelowMeasured(KNOWLEDGE_DIGEST, measured)).toEqual([]);
    expect(Object.keys(declaredCaps(KNOWLEDGE_DIGEST)).sort()).toEqual(
      Object.keys(measured).sort(),
    );
  });

  it('[QL-4] every location the digest exposes is printed verbatim where a judge reads it, and a citation is never a location', () => {
    const digest = sampleDigest();
    const rendered = knowledgeDigestOutput.render(digest);
    for (const location of knowledgeDigestOutput.locate(digest)) {
      expect(rendered).toContain(`[${location.id}]`);
    }
    const ids = knowledgeDigestOutput.locate(digest).map((location) => location.id);
    expect(ids).toEqual(['summary', 'memory.1', 'f2', 'r2']);
    // Neither a cited alias nor a confirmed known item is a place: a finding is
    // located at the item it faults, which is what keeps one fault from
    // chaining through a shared citation into several items.
    for (const item of digest.memories) {
      for (const alias of [...item.evidence, ...item.confirms, ...item.contradicts]) {
        expect(ids).not.toContain(alias);
      }
    }
    expect(rendered).toContain('[memory.1] procedure · soundness · topics:');
    expect(rendered).toContain('confirms [k1]');
    expect(knowledgeDigestOutput.schema.safeParse(digest).success).toBe(true);
  });

  it('[QL-4] every prose bound sits above the longest its path has measurably been written', () => {
    // SEEDED from the experience digest's own items, whose insight and
    // condition are the same two fields: summary 755, insight 862,
    // appliesWhen 235.
    expect(
      boundsBelowMeasured(knowledgeDigestOutput.schema, {
        summary: 755,
        'memories[].insight': 862,
        'memories[].appliesWhen': 235,
      }),
    ).toEqual([]);
  });

  it('[QL-6] the digest a model answers with contains no number', () => {
    const types = jsonSchemaTypes(knowledgeDigestOutput.schema);
    expect(types).not.toContain('number');
    expect(types).not.toContain('integer');
  });
});
