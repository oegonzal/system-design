import { describe, expect, it } from 'vitest';

import type { TaskContract } from '../../core/contracts';
import { contractOf, sampleRun } from '../../core/testing';
import { KNOWLEDGE_DIGEST } from './definition';
import { fromRun } from './from-run';
import { renderGoal } from './input';
import type { KnowledgeDigest } from './output';
import { sampleDigest, sampleKnown, sampleSource } from './testing';
import {
  dimensionValidator,
  generalityValidator,
  kindsValidator,
  limitsValidator,
  referencesValidator,
} from './validators';

const composedGoal = (): string => {
  const record = fromRun(sampleRun(), sampleSource(), { known: [sampleKnown()] });
  if (record === null) throw new Error('the sample run must compose');
  return renderGoal(record);
};

const contract = (goal = composedGoal()): TaskContract<KnowledgeDigest> =>
  contractOf(KNOWLEDGE_DIGEST.task, goal);

const messages = (artifact: KnowledgeDigest, goal?: string) =>
  Object.fromEntries(
    [
      referencesValidator,
      limitsValidator,
      generalityValidator,
      dimensionValidator,
      kindsValidator,
    ].map((validator) => [
      validator.id,
      validator.validate(artifact, contract(goal)).problems.map((problem) => problem.message),
    ]),
  );

const clean = () => ({
  references: [],
  limits: [],
  'run-specificity': [],
  dimension: [],
  kinds: [],
});

/** The sample item, with one field replaced. */
const itemWith = (patch: Partial<KnowledgeDigest['memories'][number]>): KnowledgeDigest =>
  sampleDigest({ memories: [{ ...sampleDigest().memories[0], ...patch }] });

describe('the knowledge-digest validators', () => {
  it('[QL-3] a digest that places every alias once, names a dimension its evidence earns and a kind its evidence supports passes all five', () => {
    expect(messages(sampleDigest())).toEqual(clean());
    expect(referencesValidator.gate).toBe('block');
    expect(limitsValidator.gate).toBe('block');
    // Content faults one item; they warn so one bad item cannot lose the digest.
    expect(generalityValidator.gate).toBe('warn');
    expect(dimensionValidator.gate).toBe('warn');
    expect(kindsValidator.gate).toBe('warn');
  });

  it('[QL-3] evidence the record never held, placed twice, or left unplaced blocks', () => {
    expect(messages(sampleDigest({ unused: ['f2', 'r2', 'f9'] })).references).toEqual([
      'f9 is not listed evidence',
    ]);
    expect(messages(sampleDigest({ unused: ['f1', 'f2', 'r2'] })).references).toEqual([
      'f1 is placed more than once',
    ]);
    expect(messages(sampleDigest({ unused: ['f2'] })).limits).toEqual([
      'r2 is neither used nor listed as unused',
    ]);
  });

  it('[QL-42] a known alias nobody recalled, or one both confirmed and contradicted, blocks', () => {
    expect(messages(itemWith({ confirms: ['k4'] })).references).toEqual([
      'k4 is not a listed known item',
    ]);
    expect(messages(itemWith({ confirms: ['k1'], contradicts: ['k1'] })).references).toEqual([
      'k1 is both confirmed and contradicted',
    ]);
  });

  it('[QL-42] an item that borrows this run’s vocabulary is faulted at that item, and a lookalike is not', () => {
    // Whole tokens only, only the ids the codec itself listed, read with the
    // grammar every reader of prose shares — a capitalised id is still the id.
    expect(
      messages(itemWith({ insight: 'The wifi1 radio queues f10.' }))['run-specificity'],
    ).toEqual([]);
    expect(
      messages(itemWith({ insight: 'F1 says the upstream fails.' }))['run-specificity'],
    ).toEqual(['memory.1 names f1 (an evidence alias), which another prompt cannot resolve']);

    const alias = itemWith({ insight: 'Do what f1 says about the upstream.' });
    expect(messages(alias)['run-specificity']).toEqual([
      'memory.1 names f1 (an evidence alias), which another prompt cannot resolve',
    ]);
    const place = itemWith({ appliesWhen: 'a read path like flow.1 depends on an upstream' });
    expect(messages(place)['run-specificity'][0]).toContain(
      "flow.1 (a place in this run's artifact)",
    );
    // A topic is judged as the insight is.
    const topic = itemWith({ topics: ['i2'] });
    expect(messages(topic)['run-specificity'][0]).toContain('i2 (an iteration of this run)');
    // And a known item's alias is this run's vocabulary too.
    expect(
      messages(itemWith({ insight: 'As k1 already says, queue the writes.' }))[
        'run-specificity'
      ][0],
    ).toContain('k1 (a known item alias)');
  });

  it('[QL-42] a dimension none of the item’s own evidence lands on is faulted; one the policy maps nowhere is not', () => {
    expect(messages(itemWith({ dimension: 'compliance' })).dimension).toEqual([
      'memory.1 names dimension compliance; its evidence lands on soundness, completeness',
    ]);
    // Evidence whose kinds the source policy maps nowhere earns no dimension,
    // so there is nothing to check the item against.
    const unmapped = fromRun(
      sampleRun(),
      sampleSource({ map: { criterionKinds: {}, findingTypes: {} } }),
      { known: [sampleKnown()] },
    );
    expect(unmapped).not.toBeNull();
    if (unmapped === null) return;
    expect(messages(itemWith({ dimension: 'anything' }), renderGoal(unmapped)).dimension).toEqual(
      [],
    );
  });

  it('[QL-42] a kind its evidence cannot support is faulted, and a fact needs only evidence', () => {
    // f1 resolved, so a procedure resting on it stands; r2 held, so a pattern does.
    expect(messages(itemWith({ kind: 'procedure', evidence: ['f1'] })).kinds).toEqual([]);
    expect(messages(itemWith({ kind: 'pattern', evidence: ['r2'] })).kinds).toEqual([]);
    expect(messages(itemWith({ kind: 'anti_pattern', evidence: ['f2'] })).kinds).toEqual([]);
    expect(messages(itemWith({ kind: 'fact', evidence: ['r1'] })).kinds).toEqual([]);

    // f2 persisted rather than resolved: nothing shows the change was made.
    expect(messages(itemWith({ kind: 'procedure', evidence: ['f2'] })).kinds).toEqual([
      'memory.1 is a procedure, which rests on a finding whose transition says resolved; none of its evidence is',
    ]);
    // r1 only improved; it did not hold throughout.
    expect(messages(itemWith({ kind: 'pattern', evidence: ['r1'] })).kinds).toEqual([
      'memory.1 is a pattern, which rests on a criterion that held throughout, or a finding that resolved; none of its evidence is',
    ]);
    expect(messages(itemWith({ kind: 'anti_pattern', evidence: ['r1'] })).kinds).toEqual([
      'memory.1 is a anti_pattern, which rests on a confirmed finding; none of its evidence is',
    ]);
  });

  it('[QL-3] a goal without an index blocks once; an ill-formed artifact is left to the schema validator', () => {
    expect(messages(sampleDigest(), 'Just a prompt.')).toEqual({
      ...clean(),
      references: ['the goal carries no knowledge-digest index'],
    });
    const broken = { summary: 'x' } as unknown as KnowledgeDigest;
    expect(messages(broken)).toEqual(clean());
  });
});
