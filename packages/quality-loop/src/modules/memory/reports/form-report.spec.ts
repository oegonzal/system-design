import { describe, expect, it } from 'vitest';

import { HITS_PER_FIELD_TYPE } from '../../../orchestrators/form-memory/probes';
import type { MemoryHit } from '../../../orchestrators/memory/ports';
import { memoryPorts, sampleFacts } from '../../../orchestrators/memory/steps.testing';
import { hitOf } from '../../../orchestrators/memory/testing';
import { mutedEmbeddings } from '../testing';
import { formRetrievalReport } from './form-report';

/** A fact a document taught, held under the scope and unit given. */
const taught = (text: string, ref: string, held: Pick<MemoryHit, 'scope' | 'unitKey'>) => {
  const hit = hitOf(text, 'run-a', ref);
  return {
    ...hit,
    source: { ...hit.source, pipeline: 'document-digest', kind: 'profile_fact' as const },
    ...held,
  };
};

describe('the form retrieval report', () => {
  it('[QL-70] reports, per field, its probe, the budget its kind of control takes, each named vector’s ranking, its fused list and which of it the page’s evidence carries — running no pipeline', async () => {
    const ports = memoryPorts({}, sampleFacts);
    const report = await formRetrievalReport(
      ports,
      [
        { name: 'Years of Python experience' },
        { name: 'Tell us about a project you led', inputType: 'textarea', ref: 'cover' },
        { name: '   ' },
      ],
      undefined,
    );
    if (report === null) throw new Error('embeddings are on');

    expect(report.store).toMatchObject({ ready: true, chunks: sampleFacts.length });
    expect(report.fields.map((field) => [field.ref, field.type, field.probe, field.limit])).toEqual(
      [
        ['f1', 'text', 'Years of Python experience', 3],
        ['cover', 'textarea', 'Tell us about a project you led', HITS_PER_FIELD_TYPE.textarea],
        ['f3', 'text', null, 3],
      ],
    );
    const [first, second, third] = report.fields;
    expect(first?.ranked.map((list) => list.using)).toEqual(['condition', 'lesson']);
    for (const list of first?.ranked ?? []) expect(list.hits.length).toBeLessThanOrEqual(3);
    for (const list of second?.ranked ?? []) {
      expect(list.hits.length).toBeLessThanOrEqual(HITS_PER_FIELD_TYPE.textarea);
    }
    expect(third).toMatchObject({ ranked: [], fused: [] });
    // Every hit the evidence carries is named by its alias in the field that fused it, and the aliases are the goal's.
    const aliased = report.fields.flatMap((field) =>
      field.fused.flatMap((hit) => (hit.alias === null ? [] : [hit.alias])),
    );
    expect(new Set(aliased)).toEqual(new Set(report.evidence.map((item) => item.alias)));
    expect(report.evidence.map((item) => item.alias)).toEqual(
      report.evidence.map((_, position) => `m${position + 1}`),
    );
    for (const hit of first?.fused ?? []) {
      expect(hit).toMatchObject({ runId: 'run-a', score: expect.any(Number) });
    }
  });

  it('[QL-71] searches under the unit of work the request names, as the recall does, and lists every hit with the kind, scope and unit the store holds it under', async () => {
    const ports = memoryPorts({}, [
      taught('Alex Example has never worked for any organization but Acme', 'memory.1', {}),
      taught('Alex Example answers No to knowing anyone there', 'memory.2', {
        scope: 'unit',
        unitKey: 'company=acme',
      }),
      taught('Alex Example heard of the opening from a recruiter', 'memory.3', {
        scope: 'unit',
        unitKey: 'company=globex',
      }),
      taught('Alex Example consents to text messages', 'memory.4', { scope: 'unit' }),
    ]);
    const field = { name: 'Do you know anyone who works here?', inputType: 'textarea' };
    const heldBy = async (unitKey: string | undefined) => {
      const report = await formRetrievalReport(ports, [field], unitKey);
      if (report === null) throw new Error('embeddings are on');
      const [listed] = report.fields;
      const hits = [
        ...(listed?.ranked ?? []).flatMap((list) => list.hits),
        ...(listed?.fused ?? []),
      ];
      return {
        held: [
          ...new Set(hits.map((hit) => `${hit.ref} ${hit.kind} ${hit.scope} ${hit.unitKey}`)),
        ].sort(),
        evidence: report.evidence.map((item) => item.source.ref).sort(),
      };
    };
    expect(await heldBy('company=acme')).toEqual({
      held: ['memory.1 profile_fact null null', 'memory.2 profile_fact unit company=acme'],
      evidence: ['run-a#memory.1', 'run-a#memory.2'],
    });
    // A page naming no unit reads no unit's memories, and one naming another reads only its.
    expect(await heldBy(undefined)).toEqual({
      held: ['memory.1 profile_fact null null'],
      evidence: ['run-a#memory.1'],
    });
    expect((await heldBy('company=globex')).evidence).toEqual(['run-a#memory.1', 'run-a#memory.3']);
  });

  it('[QL-70] a page asking nothing recalls nothing, and unavailable embeddings are null for the service to refuse by name', async () => {
    const quiet = await formRetrievalReport(
      memoryPorts({}, sampleFacts),
      [{ name: ' ' }],
      undefined,
    );
    expect(quiet).toMatchObject({ evidence: [], fields: [{ probe: null, limit: 3 }] });
    expect(
      await formRetrievalReport(
        memoryPorts({ embeddings: mutedEmbeddings() }, sampleFacts),
        [{ name: 'City' }],
        undefined,
      ),
    ).toBeNull();
  });
});
