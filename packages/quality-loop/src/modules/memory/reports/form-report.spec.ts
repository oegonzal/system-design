import { describe, expect, it } from 'vitest';

import { memoryPorts, sampleFacts } from '../../../orchestrators/memory/steps.testing';
import { mutedEmbeddings } from '../testing';
import { formRetrievalReport } from './form-report';

describe('the form retrieval report', () => {
  it('[QL-70] reports, per field, its probe, the budget its kind of control takes, each named vector’s ranking, its fused list and which of it the page’s evidence carries — running no pipeline', async () => {
    const ports = memoryPorts({}, sampleFacts);
    const report = await formRetrievalReport(ports, [
      { name: 'Years of Python experience' },
      { name: 'Tell us about a project you led', inputType: 'textarea', ref: 'cover' },
      { name: '   ' },
    ]);
    if (report === null) throw new Error('embeddings are on');

    expect(report.store).toMatchObject({ ready: true, chunks: sampleFacts.length });
    expect(report.fields.map((field) => [field.ref, field.type, field.probe, field.limit])).toEqual(
      [
        ['f1', 'text', 'Years of Python experience', 3],
        ['cover', 'textarea', 'Tell us about a project you led', 6],
        ['f3', 'text', null, 3],
      ],
    );
    const [first, second, third] = report.fields;
    expect(first?.ranked.map((list) => list.using)).toEqual(['condition', 'lesson']);
    for (const list of first?.ranked ?? []) expect(list.hits.length).toBeLessThanOrEqual(3);
    for (const list of second?.ranked ?? []) expect(list.hits.length).toBeLessThanOrEqual(6);
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

  it('[QL-70] a page asking nothing recalls nothing, and unavailable embeddings are null for the service to refuse by name', async () => {
    const quiet = await formRetrievalReport(memoryPorts({}, sampleFacts), [{ name: ' ' }]);
    expect(quiet).toMatchObject({ evidence: [], fields: [{ probe: null, limit: 3 }] });
    expect(
      await formRetrievalReport(memoryPorts({ embeddings: mutedEmbeddings() }, sampleFacts), [
        { name: 'City' },
      ]),
    ).toBeNull();
  });
});
