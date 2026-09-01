import { describe, expect, it } from 'vitest';

import { runExpectations } from '../expectations.pass';
import { edge, flashSaleFacts, graph, indexFor, node } from '../../../testing';
import { narrativeExpectations } from './narrative';

/** A canvas whose labels the test narratives can cover or skip on purpose. */
const canvas = graph(
  [
    node('n-1', 'client', { label: 'Client' }),
    node('n-2', 'service', { label: 'Order Service' }),
    node('n-3', 'database', { label: 'Orders DB' }),
  ],
  [edge('e-1', 'n-1', 'n-2', 'sync'), edge('e-2', 'n-2', 'n-3', 'sync')],
);

function run(narrative: string | null) {
  const [coverage, findings] = runExpectations(
    { graph: canvas, facts: flashSaleFacts(), index: indexFor(canvas), narrative },
    narrativeExpectations,
  );
  return { entries: coverage.entries, findings: findings.findings };
}

describe('narrative expectations bank', () => {
  it('[EVAL-11] silence is graded: only the presence check applies, and it is unmet', () => {
    for (const nothing of [null, '   ']) {
      const { entries, findings } = run(nothing);
      expect(entries.map((entry) => entry.expectationId)).toEqual(['exp.nar.present']);
      expect(entries[0].met).toBe(false);
      // One finding, not one per unwritten sentence — the lesson is singular.
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toBe('The design ships without a narrative');
    }
  });

  it('[EVAL-10] a covering story meets every applicable expectation', () => {
    const { entries, findings } = run(
      'The Client calls the Order Service, which writes each order to the Orders DB. ' +
        'The service replicates reads for failover so availability holds, keeps p99 latency ' +
        'inside budget on the hot path, and absorbs the flash-sale burst without dropping requests.',
    );

    // flash-sale facts carry availability/latency/throughput → 5 structural
    // (present, components, flow, substance, prose) + 3 per-kind.
    expect(entries).toHaveLength(8);
    expect(entries.every((entry) => entry.met)).toBe(true);
    expect(findings).toEqual([]);
  });

  it('names the skipped components in the unmet finding, with their node ids', () => {
    const { findings } = run(
      'The Client calls the Order Service; writes land in persistent storage. Reads ride the ' +
        'failover replica within the p99 latency budget, and the burst is absorbed upstream.',
    );

    const unexplained = findings.find(
      (finding) => finding.expectationId === 'exp.nar.components-explained',
    );
    expect(unexplained?.title).toBe('Components the narrative never explains');
    expect(unexplained?.message).toContain('"Orders DB"');
    expect(unexplained?.affectedNodeIds).toEqual(['n-3']);
  });

  it('per-kind expectations gate on the prompt and cite the NFR they enforce', () => {
    // The story covers components and flow but never engages the latency NFR.
    const { entries, findings } = run(
      'The Client calls the Order Service, which writes orders to the Orders DB. The replica ' +
        'gives failover during an outage, and the design absorbs the checkout burst comfortably.',
    );

    const latency = entries.find((entry) => entry.expectationId === 'exp.nar.addresses-latency');
    expect(latency?.met).toBe(false);
    expect(latency?.nfrId).toBe('fst-lat-read-spike');

    const finding = findings.find(
      (candidate) => candidate.expectationId === 'exp.nar.addresses-latency',
    );
    expect(finding?.nfrId).toBe('fst-lat-read-spike');
    expect(finding?.message).toContain('never engages');

    // Kinds the prompt does not carry never apply.
    expect(entries.some((entry) => entry.expectationId === 'exp.nar.addresses-cost')).toBe(false);
  });

  it('a thin, flowless story leaves the structural expectations unmet', () => {
    const { entries, findings } = run('Nice architecture overall.');

    const byId = new Map(entries.map((entry) => [entry.expectationId, entry.met]));
    expect(byId.get('exp.nar.substance')).toBe(false);
    expect(byId.get('exp.nar.flow-story')).toBe(false);
    expect(byId.get('exp.nar.components-explained')).toBe(false);

    // Too short to be prose at all, so the content checks report the gate
    // rather than a word count they could not honestly measure.
    const substance = findings.find((finding) => finding.expectationId === 'exp.nar.substance');
    expect(substance?.message).toContain('never puts them in sentences');
  });

  it('[EVAL-11] a keyword list satisfies every substring probe and still earns nothing', () => {
    // Every label plus the requirement vocabulary — the best possible list.
    const { entries } = run(
      'Client Order Service Orders DB calls latency availability throughput failover persist burst',
    );

    const byId = new Map(entries.map((entry) => [entry.expectationId, entry.met]));
    expect(byId.get('exp.nar.present')).toBe(true);
    expect(byId.get('exp.nar.written-as-prose')).toBe(false);
    // The substrings are all there; none of them count.
    expect(byId.get('exp.nar.components-explained')).toBe(false);
    expect(byId.get('exp.nar.addresses-latency')).toBe(false);
    expect(byId.get('exp.nar.addresses-availability')).toBe(false);
  });

  it('[EVAL-12] prose that wholesale contradicts the canvas earns none of its coverage', () => {
    const configured = graph(
      [
        node('n-1', 'gateway', {
          label: 'Edge gateway',
          config: { rateLimit: true, authMode: 'jwt' },
        }),
        node('n-2', 'worker', { label: 'Order worker', config: { idempotent: true } }),
        node('n-3', 'database', {
          label: 'Orders DB',
          config: { consistency: 'strong', backups: true },
        }),
      ],
      [edge('e-1', 'n-1', 'n-2', 'sync'), edge('e-2', 'n-2', 'n-3', 'sync')],
    );
    const liar =
      'The Edge gateway does no rate limiting and no authentication, so anyone reaches through. ' +
      'The Order worker is not idempotent, and the Orders DB is eventually consistent with no backups. ' +
      'Reads miss the latency budget, availability suffers, and the burst is never absorbed.';

    const [coverage] = runExpectations(
      { graph: configured, facts: flashSaleFacts(), index: indexFor(configured), narrative: liar },
      narrativeExpectations,
    );
    const byId = new Map(coverage.entries.map((entry) => [entry.expectationId, entry.met]));
    // It is fluent prose that names every component and every requirement —
    // and describes a different system, so none of that is credited.
    expect(byId.get('exp.nar.written-as-prose')).toBe(true);
    expect(byId.get('exp.nar.components-explained')).toBe(false);
    expect(byId.get('exp.nar.addresses-latency')).toBe(false);
  });

  it('forgives flow on an edgeless canvas and length on a tiny one', () => {
    const tiny = graph([node('n-1', 'service', { label: 'Only Service' })]);
    const [coverage] = runExpectations(
      { graph: tiny, facts: flashSaleFacts(), index: indexFor(tiny), narrative: 'Only Service.' },
      narrativeExpectations,
    );
    const byId = new Map(coverage.entries.map((entry) => [entry.expectationId, entry.met]));
    expect(byId.get('exp.nar.flow-story')).toBe(true);
    expect(byId.get('exp.nar.substance')).toBe(true);
  });
});
