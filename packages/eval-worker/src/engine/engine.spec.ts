import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SUGGESTED_ID_PREFIX, type CanvasGraph } from '@sysdesign/contracts';

import { runEngine } from './engine';
import { analyticsFacts, flashSaleFacts } from './testing';

function loadFixture(name: string): CanvasGraph {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf-8'),
  ) as CanvasGraph;
}

const naiveFlashSale = loadFixture('naive-flash-sale.graph.json');
const solidFlashSale = loadFixture('solid-flash-sale.graph.json');
const naiveAnalytics = loadFixture('naive-analytics.graph.json');

/**
 * Findings whose lesson is about the whole graph — a capability that simply
 * does not exist yet — so they may carry no affected elements.
 */
const GLOBAL_FINDINGS = new Set([
  'data.no-search-index',
  'performance.no-cdn-static',
  'hygiene.orphan-node',
  'exp.core.entry-service',
  'exp.core.durable-store-reachable',
  'exp.fst.async-worker-drain',
  'exp.fst.rate-limit-edge',
  'exp.fst.dlq-on-queues',
  'exp.fst.cdn-static',
  'exp.nar.present',
]);

function identityOf(finding: { ruleId: string | null; expectationId: string | null }): string {
  return finding.ruleId ?? finding.expectationId ?? '';
}

describe('runEngine', () => {
  it('[EVAL-1] grades a naive flash-sale design with per-dimension scores', () => {
    const result = runEngine(naiveFlashSale, flashSaleFacts());

    // Suppression keeps one lesson to one finding: the paired rules
    // (no-replica, no-queue, no-cache, no-gateway, no-rate-limit) yield to
    // their unmet expectations; only service-no-lb survives as a violation.
    expect(result.findings.map(identityOf)).toEqual([
      'exp.fst.async-worker-drain',
      'exp.fst.cdn-static',
      'exp.fst.db-failover',
      'exp.fst.dlq-on-queues',
      'exp.fst.edge-front-door',
      'exp.fst.low-latency-read-path',
      'exp.fst.payment-isolation',
      'exp.fst.rate-limit-edge',
      'exp.fst.read-cache',
      'exp.fst.stateless-scale-out',
      'exp.fst.waiting-room',
      'exp.fst.write-spike-buffer',
      'exp.nar.present',
      'reliability.service-no-lb',
    ]);

    // Coverage-earned bases: data and hygiene are the only demands this
    // design meets; everything else earned nothing.
    expect(result.dimensionScores).toEqual({
      reliability: 0,
      scalability: 0,
      performance: 0,
      data: 100,
      messaging: 0,
      security: 0,
      hygiene: 100,
      communication: 0,
    });

    expect(result.overallScore).toBe(18);
    expect(result.grade).toBe('F');
    expect(result.summary).toContain('grade F');
  });

  it('[EVAL-2] findings teach — message + affected elements', () => {
    const result = runEngine(naiveFlashSale, flashSaleFacts());
    expect(result.findings.length).toBeGreaterThan(0);
    for (const finding of result.findings) {
      expect(finding.title.length).toBeGreaterThan(0);
      expect(finding.message.length).toBeGreaterThan(20);
      if (!GLOBAL_FINDINGS.has(identityOf(finding))) {
        expect(finding.affectedNodeIds.length + finding.affectedEdgeIds.length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the replica lesson under its historical title with the same ghost fix', () => {
    const result = runEngine(naiveFlashSale, flashSaleFacts());
    const replica = result.findings.find((f) => f.expectationId === 'exp.fst.db-failover');
    expect(replica?.title).toBe('Single database with no replica');
    expect(replica?.affectedNodeIds).toEqual(['database-1']);
    expect(replica?.suggestion?.ops.map((op) => op.op)).toEqual(['add-node', 'add-edge']);
  });

  it('holds the solid flash-sale design at a C — depth is missing and so is the narrative', () => {
    const result = runEngine(solidFlashSale, flashSaleFacts());
    expect(result.findings.map(identityOf)).toEqual([
      'exp.fst.cdn-static',
      'exp.fst.waiting-room',
      'exp.nar.present',
    ]);
    expect(result.overallScore).toBe(77.9);
    expect(result.grade).toBe('C');
  });

  it('is deterministic — two runs deep-equal', () => {
    expect(runEngine(naiveFlashSale, flashSaleFacts())).toEqual(
      runEngine(naiveFlashSale, flashSaleFacts()),
    );
    expect(runEngine(naiveAnalytics, analyticsFacts())).toEqual(
      runEngine(naiveAnalytics, analyticsFacts()),
    );
  });

  it('suggestion patches introduce only suggested- ids and reference existing elements', () => {
    const existingNodeIds = new Set(naiveFlashSale.nodes.map((node) => node.id));
    const existingEdgeIds = new Set(naiveFlashSale.edges.map((edge) => edge.id));
    const result = runEngine(naiveFlashSale, flashSaleFacts());
    const suggestions = result.findings.flatMap((finding) =>
      finding.suggestion ? [finding.suggestion] : [],
    );
    expect(suggestions.length).toBeGreaterThan(0);

    for (const suggestion of suggestions) {
      expect(suggestion.description.length).toBeGreaterThan(0);
      const introduced = new Set<string>();
      for (const op of suggestion.ops) {
        if (op.op === 'add-node') {
          expect(op.node.id.startsWith(SUGGESTED_ID_PREFIX)).toBe(true);
          expect(existingNodeIds.has(op.node.id)).toBe(false);
          introduced.add(op.node.id);
        } else if (op.op === 'add-edge') {
          expect(op.edge.id.startsWith(SUGGESTED_ID_PREFIX)).toBe(true);
          expect(existingEdgeIds.has(op.edge.id)).toBe(false);
          expect(existingNodeIds.has(op.edge.source) || introduced.has(op.edge.source)).toBe(true);
          expect(existingNodeIds.has(op.edge.target) || introduced.has(op.edge.target)).toBe(true);
        } else if (op.op === 'remove-edge' || op.op === 'update-edge') {
          expect(existingEdgeIds.has(op.edgeId)).toBe(true);
        } else {
          expect(existingNodeIds.has(op.nodeId)).toBe(true);
        }
      }
    }
  });

  it('grades an empty canvas an F — a design that demonstrates nothing earns nothing', () => {
    const result = runEngine({ nodes: [], edges: [] }, flashSaleFacts());
    expect(result.overallScore).toBe(0);
    expect(result.grade).toBe('F');
    expect(result.findings.length).toBeGreaterThan(10);
    expect(result.findings.every((finding) => finding.expectationId !== null)).toBe(true);
  });
});
