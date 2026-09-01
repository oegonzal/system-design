import { describe, expect, it } from 'vitest';

import { runExpectations } from '../expectations.pass';
import { brief, edge, flashSaleFacts, graph, indexFor, node } from '../../../testing';
import { briefExpectations } from './brief';

/**
 * A canvas whose configuration decides every verdict below. Nothing here is
 * matched as text — the labels are deliberately unhelpful to prove it.
 */
const canvas = graph(
  [
    node('n-1', 'client', { label: 'aaa' }),
    node('n-2', 'service', { label: 'bbb' }),
    node('n-3', 'database', { label: 'ccc', config: { backups: true } }),
    node('n-4', 'replica', { label: 'ddd' }),
  ],
  [
    edge('e-1', 'n-1', 'n-2', 'sync'),
    edge('e-2', 'n-2', 'n-3', 'sync'),
    edge('e-3', 'n-3', 'n-4', 'async'),
  ],
);

function run(design = brief()) {
  const [coverage, findings] = runExpectations(
    { graph: canvas, facts: flashSaleFacts(), index: indexFor(canvas), brief: design },
    briefExpectations,
  );
  return {
    met: new Map(coverage.entries.map((entry) => [entry.expectationId, entry.met])),
    entries: coverage.entries,
    findings: findings.findings,
  };
}

describe('brief expectations bank', () => {
  it('[EVAL-11] silence is graded: only the presence check applies, and it is unmet', () => {
    const { entries, findings } = run();
    expect(entries.map((entry) => entry.expectationId)).toEqual(['exp.brf.present']);
    expect(entries[0].met).toBe(false);
    // One finding, not one per unwritten claim — the lesson is singular.
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('The design explains nothing');
  });

  it('[EVAL-9] a component no flow and no corroborated binding accounts for becomes a finding', () => {
    const { met, findings } = run(
      brief([{ nfrId: 'fst-avail-sale-window', nodeIds: ['n-3'], mechanism: 'backups' }]),
    );
    expect(met.get('exp.brf.components-accounted')).toBe(false);

    const finding = findings.find(
      (candidate) => candidate.expectationId === 'exp.brf.components-accounted',
    );
    // n-3 is vouched for by a corroborated binding; the rest are not.
    expect(finding?.affectedNodeIds).toEqual(['n-1', 'n-2', 'n-4']);
    expect(finding?.message).toContain('nothing');
  });

  it('[EVAL-9] a responsibility accounts for a component too', () => {
    const annotated = graph(
      [
        node('n-1', 'client', { responsibilities: ['starts the purchase'] }),
        node('n-2', 'service', { responsibilities: ['owns checkout'] }),
        node('n-3', 'database', {
          config: { backups: true },
          responsibilities: ['system of record'],
        }),
        node('n-4', 'replica', { responsibilities: ['serves reads'] }),
      ],
      canvas.edges,
    );
    const [coverage] = runExpectations(
      {
        graph: annotated,
        facts: flashSaleFacts(),
        index: indexFor(annotated),
        brief: brief([{ nfrId: 'fst-avail-sale-window', nodeIds: ['n-3'], mechanism: 'backups' }]),
      },
      briefExpectations,
    );
    const met = new Map(coverage.entries.map((entry) => [entry.expectationId, entry.met]));
    expect(met.get('exp.brf.components-accounted')).toBe(true);
  });

  it('[EVAL-10] a binding earns its requirement kind only when the canvas corroborates it', () => {
    const backed = run(
      brief([{ nfrId: 'fst-avail-sale-window', nodeIds: ['n-3'], mechanism: 'backups' }]),
    );
    expect(backed.met.get('exp.brf.binds-availability')).toBe(true);

    // A claim about a store that declares no second region at all.
    const unbacked = run(
      brief([{ nfrId: 'fst-avail-sale-window', nodeIds: ['n-3'], mechanism: 'multi-region' }]),
    );
    expect(unbacked.met.get('exp.brf.binds-availability')).toBe(false);
  });

  it('[EVAL-10] the per-kind finding cites the requirement it enforces', () => {
    const { findings } = run(
      brief([{ nfrId: 'fst-avail-sale-window', nodeIds: ['n-3'], mechanism: 'backups' }]),
    );
    const latency = findings.find((finding) => finding.expectationId === 'exp.brf.binds-latency');
    expect(latency?.nfrId).toBe('fst-lat-read-spike');
    expect(latency?.message).toContain('Availability reads stay fast');
  });

  it('traces a flow only when the walk connects a client to something durable', () => {
    const complete = run(brief([], [{ id: 'f-1', requirementIndex: 0, path: ['e-1', 'e-2'] }]));
    expect(complete.met.get('exp.brf.flows-traced')).toBe(true);

    // Same edges, wrong order — a bag of hops, not a walk.
    const broken = run(brief([], [{ id: 'f-1', requirementIndex: 0, path: ['e-2', 'e-1'] }]));
    expect(broken.met.get('exp.brf.flows-traced')).toBe(false);
  });

  it('is indifferent to what the components are called', () => {
    const renamed = graph(
      canvas.nodes.map((original) => ({ ...original, label: `✨ ${original.id} ✨` })),
      canvas.edges,
    );
    const design = brief([
      { nfrId: 'fst-avail-sale-window', nodeIds: ['n-3'], mechanism: 'backups' },
    ]);
    const [before] = runExpectations(
      { graph: canvas, facts: flashSaleFacts(), index: indexFor(canvas), brief: design },
      briefExpectations,
    );
    const [after] = runExpectations(
      { graph: renamed, facts: flashSaleFacts(), index: indexFor(renamed), brief: design },
      briefExpectations,
    );
    expect(after.entries).toEqual(before.entries);
  });
});
