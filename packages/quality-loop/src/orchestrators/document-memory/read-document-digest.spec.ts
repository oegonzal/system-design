import { resumeChunk, type ConfirmedFinding, type DocumentChunk } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { outputsOf } from '../../core/outputs';
import { InMemoryMemoryStore } from '../../modules/memory/testing';
import type { DocumentDigest } from '../../pipelines/document-digest/output';
import {
  documentCriteria,
  documentGoal,
  sampleDocumentDigest,
} from '../../pipelines/document-digest/testing';
import { childRun, memoryPorts } from '../memory/steps.testing';
import { indexMemories } from '../memory/store/index-memories';
import { ACCEPT_AT, FAKE_MODEL, faulting, passed, readoutTrace } from '../memory/testing';
import { readDocumentDigest, UNIT_UNNAMED } from './read-document-digest';
import { DOCUMENT_MEMORY_OWNED } from './steps';

/** A judged document-digest run over the digest given, with these findings confirmed against it. */
const judged = (
  digest: DocumentDigest,
  findings: ConfirmedFinding[],
  chunk: DocumentChunk = resumeChunk(),
) => {
  const trace = readoutTrace({
    pipeline: 'document-digest',
    goal: documentGoal(chunk),
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
  it('[QL-40] withholds by what a finding says about the fact, not by how many facts it names, and a duplicate set withholds none', () => {
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
    // A wrong fact goes, however many it names; every member of a duplicate set
    // stays, since any may be a bystander; a true fact faulted for its wording
    // stays; an undeclared fault withholds what it names.
    expect(readout.memories.map((memory) => memory.position)).toEqual([1, 3, 4, 6]);
    expect(readout.withheld.map((item) => [item.ref, item.by]).sort()).toEqual([
      ['memory.2', 'invented_fact'],
      ['memory.5', 'invented_fact'],
      ['memory.7', 'a_type_no_table_names'],
    ]);
  });

  it('[QL-40] a digest with a withheld memory between two kinded memories stores each survivor with its own kind and its own location', async () => {
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

  it('[QL-71] a document that names its unit of work stamps it on each memory bound to one, and on no other — whether the digest or the document scoped it — and the store keeps it', async () => {
    const digest = sampleDocumentDigest({ memories: [role, { ...home, scope: 'unit' }] });
    const named = { ...resumeChunk(), unitKey: 'U' };
    const readout = readDocumentDigest(judged(digest, [], named).outputs, ACCEPT_AT);
    expect(readout.memories.map((memory) => [memory.scope, memory.unitKey])).toEqual([
      ['subject', undefined],
      ['unit', 'U'],
    ]);
    expect(readout.memories[0]).not.toHaveProperty('unitKey');
    expect(readout.withheld).toEqual([]);
    // A document declaring every memory bound to the unit it names: every memory carries it.
    const declared = readDocumentDigest(
      judged(digest, [], { ...named, scope: 'unit' }).outputs,
      ACCEPT_AT,
    );
    expect(declared.memories.map((memory) => [memory.scope, memory.unitKey])).toEqual([
      ['unit', 'U'],
      ['unit', 'U'],
    ]);

    const { trace } = judged(digest, [], named);
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
      .map((chunk) => [chunk.source.ref, chunk.scope, chunk.unitKey])
      .sort();
    expect(stored).toEqual([
      ['memory.1', 'subject', undefined],
      ['memory.2', 'unit', 'U'],
    ]);
  });

  it('[QL-71] a memory bound to a unit of work, of a document that names none, is withheld by the index — never stored where no search reads it — and every other memory is kept', () => {
    const digest = sampleDocumentDigest({ memories: [role, { ...home, scope: 'unit' }] });
    const readout = readDocumentDigest(judged(digest, []).outputs, ACCEPT_AT);
    expect(readout.memories.map((memory) => memory.position)).toEqual([1]);
    expect(readout.withheld).toEqual([{ ref: 'memory.2', ...UNIT_UNNAMED }]);
    expect(UNIT_UNNAMED.source).toBe('index');
  });
});
