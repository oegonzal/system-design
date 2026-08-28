import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { EVAL_DIMENSIONS, SUGGESTED_ID_PREFIX, type CanvasGraph } from '@sysdesign/contracts';

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

/** Rules whose lesson is about the whole graph, so they may carry no affected elements. */
const GLOBAL_RULES = new Set([
  'security.no-rate-limit',
  'data.no-search-index',
  'performance.no-cdn-static',
  'hygiene.orphan-node',
]);

describe('runEngine', () => {
  it('[EVAL-1] grades a naive flash-sale design with per-dimension scores', () => {
    const result = runEngine(naiveFlashSale, flashSaleFacts());

    expect(result.findings.map((finding) => finding.ruleId)).toEqual([
      'messaging.no-queue-for-spike',
      'reliability.service-no-lb',
      'reliability.single-db-no-replica',
      'scalability.no-cache-read-heavy',
      'security.no-gateway',
      'security.no-rate-limit',
    ]);

    expect(result.dimensionScores).toEqual({
      reliability: 35,
      scalability: 75,
      performance: 100,
      data: 100,
      messaging: 60,
      security: 75,
      hygiene: 100,
    });
    for (const dimension of EVAL_DIMENSIONS) {
      expect(result.dimensionScores[dimension]).toBeTypeOf('number');
    }

    expect(result.overallScore).toBe(74.3);
    expect(result.grade).toBe('C');
    expect(result.summary).toContain('grade C');
  });

  it('[EVAL-2] findings teach — message + affected elements', () => {
    const result = runEngine(naiveFlashSale, flashSaleFacts());
    expect(result.findings.length).toBeGreaterThan(0);
    for (const finding of result.findings) {
      expect(finding.title.length).toBeGreaterThan(0);
      expect(finding.message.length).toBeGreaterThan(20);
      if (!GLOBAL_RULES.has(finding.ruleId)) {
        expect(finding.affectedNodeIds.length + finding.affectedEdgeIds.length).toBeGreaterThan(0);
      }
    }
  });

  it('scores the solid flash-sale design an A with nothing above info', () => {
    const result = runEngine(solidFlashSale, flashSaleFacts());
    expect(result.findings.filter((finding) => finding.severity !== 'info')).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.overallScore).toBe(100);
    expect(result.grade).toBe('A');
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
        } else if (op.op === 'remove-edge') {
          expect(existingEdgeIds.has(op.edgeId)).toBe(true);
        } else {
          expect(existingNodeIds.has(op.nodeId)).toBe(true);
        }
      }
    }
  });

  it('handles an empty graph without crashing', () => {
    const result = runEngine({ nodes: [], edges: [] }, flashSaleFacts());
    expect(result.findings.map((finding) => finding.ruleId)).toEqual(['security.no-rate-limit']);
    expect(result.overallScore).toBe(100);
    expect(result.grade).toBe('A');
  });
});
