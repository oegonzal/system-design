import { describe, expect, it } from 'vitest';

import { SUGGESTED_ID_PREFIX, type CanvasGraph, type Grade } from '@sysdesign/contracts';

import { runEngine } from '../../../engine';
import { contextFor, edge, graph, mediaFacts, node } from '../../../testing';
import { mediaStreamingExpectations } from './media-streaming';

const GRADE_RANK: Record<Grade, number> = { F: 0, D: 1, C: 2, B: 3, A: 4 };

/** The three-box starting point every author draws first. */
const naiveGraph: CanvasGraph = graph(
  [
    node('client-1', 'client', { label: 'Creator app' }),
    node('service-1', 'service', { label: 'Media service' }),
    node('database-1', 'database', { label: 'Media DB' }),
  ],
  [edge('edge-1', 'client-1', 'service-1'), edge('edge-2', 'service-1', 'database-1')],
);

/**
 * The reference design that meets every intro and standard expectation:
 * uploads land in the object store, transcoding drains a DLQ'd queue, the CDN
 * is the front door for playback and API traffic alike (so no client path
 * pulls media from origin), browse hits cache + search index, the metadata
 * store is backed up, and monitoring watches it.
 */
const solidGraph: CanvasGraph = graph(
  [
    node('client-1', 'client', { label: 'Viewer app' }),
    node('gateway-1', 'gateway', { label: 'API gateway' }),
    node('service-1', 'service', { label: 'Playback API', config: { replicas: 3 } }),
    node('service-2', 'service', { label: 'Upload service', config: { replicas: 3 } }),
    node('cdn-1', 'cdn', { label: 'CDN' }),
    node('object-store-1', 'object-store', { label: 'Originals bucket' }),
    node('queue-1', 'queue', { label: 'Transcode queue', config: { dlq: true } }),
    node('worker-1', 'worker', { label: 'Transcode worker' }),
    node('database-1', 'database', { label: 'Metadata DB', config: { backups: true } }),
    node('search-index-1', 'search-index', { label: 'Catalog search' }),
    node('cache-1', 'cache', { label: 'Manifest cache' }),
    node('monitoring-1', 'monitoring', { label: 'Pipeline monitoring' }),
  ],
  [
    edge('edge-1', 'cdn-1', 'gateway-1'),
    edge('edge-2', 'gateway-1', 'service-1'),
    edge('edge-3', 'gateway-1', 'service-2'),
    edge('edge-4', 'client-1', 'cdn-1'),
    edge('edge-5', 'cdn-1', 'object-store-1'),
    edge('edge-6', 'service-2', 'object-store-1'),
    edge('edge-7', 'service-2', 'queue-1', 'async'),
    edge('edge-8', 'queue-1', 'worker-1', 'async'),
    edge('edge-9', 'worker-1', 'database-1'),
    edge('edge-10', 'service-1', 'cache-1'),
    edge('edge-11', 'cache-1', 'database-1'),
    edge('edge-12', 'service-1', 'search-index-1'),
    edge('edge-13', 'service-1', 'monitoring-1', 'async'),
  ],
);

/** Expected `satisfiedBy` verdict per expectation on each fixture. */
const TABLE: Array<{ id: string; onNaive: boolean; onSolid: boolean }> = [
  { id: 'exp.msp.object-store-originals', onNaive: false, onSolid: true },
  { id: 'exp.msp.cdn-delivery', onNaive: false, onSolid: true },
  { id: 'exp.msp.async-transcode', onNaive: false, onSolid: true },
  { id: 'exp.msp.metadata-store', onNaive: true, onSolid: true },
  { id: 'exp.msp.durable-before-transcode', onNaive: false, onSolid: true },
  { id: 'exp.msp.transcode-backlog-buffer', onNaive: false, onSolid: true },
  { id: 'exp.msp.search-browse-index', onNaive: false, onSolid: true },
  { id: 'exp.msp.cache-manifests', onNaive: false, onSolid: true },
  { id: 'exp.msp.pipeline-observed', onNaive: false, onSolid: true },
  { id: 'exp.msp.multi-cdn-region', onNaive: false, onSolid: false },
  { id: 'exp.msp.drop-gate-consistency', onNaive: false, onSolid: false },
  // The CDN shielding the object store is itself the hot/cold split.
  { id: 'exp.msp.storage-tiering', onNaive: false, onSolid: true },
];

function expectationById(id: string) {
  const expectation = mediaStreamingExpectations.find((candidate) => candidate.id === id);
  if (!expectation) throw new Error(`unknown expectation: ${id}`);
  return expectation;
}

describe('media-streaming expectation bank', () => {
  it('declares well-formed expectations gated to the archetype', () => {
    const ids = mediaStreamingExpectations.map((expectation) => expectation.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const expectation of mediaStreamingExpectations) {
      expect(expectation.id).toMatch(/^exp\.msp\.[a-z-]+$/);
      expect(expectation.id.length).toBeLessThanOrEqual(60);
      expect(expectation.archetypes).toEqual(['media-streaming-pipeline']);
    }
  });

  it('covers every expectation in the verdict table exactly once', () => {
    expect(TABLE.map((row) => row.id).sort()).toEqual(
      mediaStreamingExpectations.map((expectation) => expectation.id).sort(),
    );
  });

  it.each(TABLE)('$id: naive=$onNaive solid=$onSolid', ({ id, onNaive, onSolid }) => {
    const expectation = expectationById(id);
    for (const [fixture, expected] of [
      [naiveGraph, onNaive],
      [solidGraph, onSolid],
    ] as const) {
      const check = expectation.satisfiedBy(contextFor(fixture, mediaFacts()));
      expect(check.met).toBe(expected);
      expect(check.evidenceNodeIds).toEqual([...check.evidenceNodeIds].sort());
      expect(check.evidenceEdgeIds).toEqual([...check.evidenceEdgeIds].sort());
    }
  });

  it('grades the naive three-box no better than D', () => {
    const result = runEngine(naiveGraph, mediaFacts());
    expect(GRADE_RANK[result.grade]).toBeLessThanOrEqual(GRADE_RANK.D);
  });

  it('grades the solid pipeline at least a B', () => {
    const result = runEngine(solidGraph, mediaFacts());
    expect(GRADE_RANK[result.grade]).toBeGreaterThanOrEqual(GRADE_RANK.B);
  });

  it('teaches on every unmet expectation — messages carry the lesson', () => {
    const result = runEngine(naiveGraph, mediaFacts());
    const bankFindings = result.findings.filter((finding) =>
      finding.expectationId?.startsWith('exp.msp.'),
    );
    expect(bankFindings.length).toBeGreaterThan(0);
    for (const finding of bankFindings) {
      expect(finding.title.length).toBeGreaterThan(0);
      expect(finding.message.length).toBeGreaterThan(20);
    }
  });

  it('suggestion patches introduce only suggested- ids and reference existing elements', () => {
    const ctx = contextFor(naiveGraph, mediaFacts());
    const existingNodeIds = new Set(naiveGraph.nodes.map((graphNode) => graphNode.id));
    const existingEdgeIds = new Set(naiveGraph.edges.map((graphEdge) => graphEdge.id));
    const patches = mediaStreamingExpectations.flatMap((expectation) => {
      const patch = expectation.suggest?.(ctx);
      return patch ? [patch] : [];
    });
    expect(patches.length).toBeGreaterThan(0);

    for (const patch of patches) {
      expect(patch.description.length).toBeGreaterThan(0);
      const introduced = new Set<string>();
      for (const op of patch.ops) {
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
});
