import {
  boundsAgainstMeasured,
  CRITERION_STATEMENT_BOUND,
  KNOWLEDGE_ITEM_KINDS,
  WITHHOLDINGS,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { describePipeline } from '../../core/describe-pipeline';
import { validatePipeline } from '../../core/validate-pipeline';
import {
  allStages,
  capsAgainstMeasured,
  jsonSchemaTypes,
  seededCaps,
  seededFields,
  unseededFields,
} from '../../core/testing';
import { KNOWLEDGE_DIGEST } from './definition';
import measured from './measured.json';
import { KNOWLEDGE_KINDS } from './input';
import { knowledgeDigestOutput, polarityOf } from './output';
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
      CRITERION_STATEMENT_BOUND.ceiling,
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

  it('[QL-42] every finding type this pipeline declares carries an explicit withholds', () => {
    // A quantification over an empty collection is trivially true, so the count
    // comes first: a migration that keeps the quantifier and drops a pin would
    // otherwise reopen it silently.
    expect(Object.keys(KNOWLEDGE_DIGEST.task.findingTypes)).toHaveLength(10);
    // A type the pipeline declares with no withholds would fall to the strict
    // default silently. The other direction — a rule for a type the pipeline no
    // longer declares — has no place to be written: the rule is on the type's record.
    for (const type of Object.keys(KNOWLEDGE_DIGEST.task.findingTypes)) {
      expect(WITHHOLDINGS).toContain(KNOWLEDGE_DIGEST.policy.findingTypes[type].withholds);
    }
    const declared = Object.fromEntries(
      Object.entries(KNOWLEDGE_DIGEST.policy.findingTypes).map(([type, mapped]) => [
        type,
        mapped.withholds,
      ]),
    );
    // What is false or misleading in the store is withheld; what is merely weak
    // is not; nor is a member of a named duplicate set, which may be a bystander.
    expect(declared).toEqual({
      misattributed_evidence: 'every-ref',
      ungrounded_fact: 'every-ref',
      unsupported_effect: 'every-ref',
      wrong_kind: 'every-ref',
      run_specific: 'every-ref',
      vague_item: 'none',
      duplicate_item: 'none',
      restated_known: 'every-ref',
      false_confirmation: 'every-ref',
      false_contradiction: 'every-ref',
    });
  });

  it('[QL-53] its content warnings declare what their problems withhold, and its blocking checks declare nothing', () => {
    // A blocking validator that fails closes admission, so no reader sees its
    // problems; a warning leaves the digest standing and names one item.
    expect(
      KNOWLEDGE_DIGEST.validators.map(({ id, gate, withholds }) => [id, gate, withholds]),
    ).toEqual([
      ['references', 'block', undefined],
      ['limits', 'block', undefined],
      // Borrowing this run's tokens is `run_specific` caught exactly; a kind the
      // evidence cannot support is `wrong_kind` caught exactly. A dimension its
      // evidence does not land on leaves the insight and its evidence standing.
      ['run-specificity', 'warn', 'every-ref'],
      ['dimension', 'warn', 'none'],
      ['kinds', 'warn', 'every-ref'],
    ]);
  });

  it('[QL-33] [QL-49] every declared output cap is a fifth above what its stage is expected to write, and above what it has measurably written', () => {
    // SEEDED from the experience digest's measured calls (its `measured.json`:
    // deriver 9,350 output tokens, producer 31,719, critics to 32,261, its one
    // evaluator 13,321), mapped onto this pipeline's lenses: grounding takes
    // provenance's, generality and novelty take transfer's, both evaluators
    // take attribution's. A cap is also the call's time limit, so one a stage
    // outwrites is a call cut short. This pipeline's own runs replace the
    // seeds through `measured.json` (`pnpm measure:bounds`).
    const seeds = {
      criteria: 9_350,
      producer: 31_719,
      'critic.grounding': 32_261,
      'critic.generality': 19_963,
      'critic.novelty': 19_963,
      'evaluator.coverage': 13_321,
      'evaluator.novelty': 13_321,
    };
    expect(capsAgainstMeasured(KNOWLEDGE_DIGEST, seededCaps(seeds))).toEqual([]);
    const unrecorded =
      measured.runs === 0 ? allStages(KNOWLEDGE_DIGEST, 'no knowledge-digest run recorded') : {};
    expect(capsAgainstMeasured(KNOWLEDGE_DIGEST, measured.caps, { exempt: unrecorded })).toEqual(
      [],
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
    const seeds = { summary: 755, 'memories[].insight': 862, 'memories[].appliesWhen': 235 };
    const schema = knowledgeDigestOutput.schema;
    expect(
      boundsAgainstMeasured(schema, seededFields(seeds), {
        exempt: unseededFields(schema, seeds, 'no knowledge-digest run recorded, and no seed'),
      }),
    ).toEqual([]);
  });

  it('[QL-6] the digest a model answers with contains no number', () => {
    const types = jsonSchemaTypes(knowledgeDigestOutput.schema);
    expect(types).not.toContain('number');
    expect(types).not.toContain('integer');
  });
});
