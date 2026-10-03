import type { ConfirmedFinding } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { outputsOf, WITHHOLDINGS } from '../../core/outputs';
import { InMemoryMemoryStore } from '../../modules/memory/testing';
import { DOCUMENT_DIGEST } from '../../pipelines/document-digest/definition';
import type { DocumentDigest } from '../../pipelines/document-digest/output';
import {
  documentCriteria,
  documentGoal,
  sampleDocumentDigest,
} from '../../pipelines/document-digest/testing';
import { childRun, memoryPorts } from '../memory/steps.testing';
import { indexMemories } from '../memory/store/index-memories';
import { ACCEPT_AT, FAKE_MODEL, faulting, passed, readoutTrace } from '../memory/testing';
import { DOCUMENT_WITHHOLDS, readDocumentDigest } from './read-document-digest';
import { DOCUMENT_MEMORY_OWNED } from './steps';

describe('what a document digest withholds', () => {
  it('[QL-40] declares a rule for every finding type the pipeline can report, and for none it cannot', () => {
    // The count first, and the count expected rather than a floor at zero: the
    // equality below holds just as happily over two empty objects, and what
    // saves it today is six pins in the case beneath — a different block, which
    // a migration could move or rewrite while leaving this one green. Vacuity is
    // not a property of one-sided assertions; any assertion that quantifies owes
    // a count, however many sides it has.
    expect(Object.keys(DOCUMENT_DIGEST.task.findingTypes)).toHaveLength(6);
    // A finding type with no declared rule falls to the strict default and silently
    // costs facts; one declared for a type the pipeline cannot report is dead data.
    expect(Object.keys(DOCUMENT_WITHHOLDS).sort()).toEqual(
      Object.keys(DOCUMENT_DIGEST.task.findingTypes).sort(),
    );
    for (const rule of Object.values(DOCUMENT_WITHHOLDS)) expect(WITHHOLDINGS).toContain(rule);
  });

  it('[QL-40] withholds a fact its sections do not support, and keeps a true one faulted only for its wording', () => {
    // These two say the fact is wrong — storing it would have the corpus assert
    // what the subject's own documents do not — and they are the gated pair.
    expect(DOCUMENT_WITHHOLDS['invented_fact']).toBe('every-ref');
    expect(DOCUMENT_WITHHOLDS['misread_section']).toBe('every-ref');
    for (const type of ['invented_fact', 'misread_section'] as const) {
      expect(DOCUMENT_DIGEST.policy.findingTypes[type]?.gate).toBe(true);
    }
    // These say a true fact is written weakly. Dropping it loses a detail the
    // corpus can never answer with again, so it is kept and the wording stands.
    for (const type of ['missed_fact', 'unusable_fact', 'vague_condition'] as const) {
      expect(DOCUMENT_WITHHOLDS[type]).toBe('none');
      expect(DOCUMENT_DIGEST.policy.findingTypes[type]?.gate).toBe(false);
    }
    // A duplicate is repaired by keeping one of the pair, not by losing both.
    expect(DOCUMENT_WITHHOLDS['duplicate_fact']).toBe('all-but-one');
  });
});

/** A judged document-digest run over the digest given, with these findings confirmed against it. */
const judged = (digest: DocumentDigest, findings: ConfirmedFinding[]) => {
  const trace = readoutTrace({
    pipeline: 'document-digest',
    goal: documentGoal(),
    artifact: digest,
    locations: ['summary', ...digest.memories.map((_, position) => `memory.${position + 1}`)],
    criteria: documentCriteria(),
    results: [passed('c1', 'fact', ['memory.1'])],
    findings,
  });
  return { trace, outputs: outputsOf(trace) };
};

const [role, home] = sampleDocumentDigest().memories;

describe('what a document digest endorses', () => {
  it('[QL-40] withholds by what a finding says about the fact, not by how many facts it names', () => {
    const digest = sampleDocumentDigest({
      memories: [role, home, { ...role }, { ...role }, { ...home }, { ...home }, { ...home }],
    });
    const { outputs } = judged(digest, [
      faulting('invented_fact', ['memory.2', 'memory.5']),
      faulting('duplicate_fact', ['memory.1', 'memory.3', 'memory.4']),
      faulting('unusable_fact', ['memory.6']),
      // A type the pipeline does not declare is strict until someone decides it is not.
      faulting('a_type_no_table_names', ['memory.7']),
    ]);
    const readout = readDocumentDigest(outputs, ACCEPT_AT);
    // A wrong fact goes, however many it names; a duplicate keeps one of its set;
    // a true fact faulted for its wording stays; an undeclared fault withholds what it names.
    expect(readout.memories.map((memory) => memory.position)).toEqual([1, 6]);
    expect(readout.withheld.map((item) => [item.ref, item.by]).sort()).toEqual([
      ['memory.2', 'invented_fact'],
      ['memory.3', 'duplicate_fact'],
      ['memory.4', 'duplicate_fact'],
      ['memory.5', 'invented_fact'],
      ['memory.7', 'a_type_no_table_names'],
    ]);
  });

  it('[QL-40] stores each fact standing beside a withheld one under its own kind and its own location', async () => {
    // A withheld item shifts every later index: a survivor re-read by its index
    // in the filtered list would take its neighbour's kind and place.
    const digest = sampleDocumentDigest({
      memories: [
        { ...role, kind: 'profile_fact' },
        { ...home, kind: 'claim_boundary' },
        { ...role, kind: 'profile_story', insight: `${role.insight} The move took a year.` },
      ],
    });
    const { trace, outputs } = judged(digest, [faulting('invented_fact', ['memory.2'])]);
    const readout = readDocumentDigest(outputs, ACCEPT_AT);
    expect(readout.memories.map((memory) => [memory.position, memory.kind])).toEqual([
      [1, 'profile_fact'],
      [3, 'profile_story'],
    ]);

    const ports = memoryPorts();
    const source = { ...childRun('document-digest', trace), trace };
    await indexMemories(
      ports,
      source,
      { digestRunId: source.runId, memories: readout.memories },
      FAKE_MODEL,
      DOCUMENT_MEMORY_OWNED,
    );
    const stored = [...(ports.store as InMemoryMemoryStore).points.values()]
      .filter((chunk) => chunk.source.runId === source.runId)
      .map((chunk) => [chunk.source.ref, chunk.source.kind, chunk.keys.lesson])
      .sort();
    expect(stored).toEqual([
      ['memory.1', 'profile_fact', role.insight],
      ['memory.3', 'profile_story', `${role.insight} The move took a year.`],
    ]);
  });
});
