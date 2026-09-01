/**
 * Hygiene: is the diagram itself honest — every box participating, and no
 * edge that a reviewer would circle in red before reading anything else?
 */
import type { EvalRule, RuleFinding } from '../types';
import { sortById, uniqueSorted } from './shared';

const orphanNode: EvalRule = {
  id: 'hygiene.orphan-node',
  dimension: 'hygiene',
  check({ index }) {
    const orphans = sortById(index.nodes().filter((node) => index.degree(node.id) === 0));
    if (orphans.length === 0) return [];
    const labels = orphans.map((node) => `"${node.label}"`).join(', ');
    const plural = orphans.length > 1;
    return [
      {
        ruleId: orphanNode.id,
        dimension: 'hygiene',
        /**
         * One lesson, one finding — but magnitude still has to register. A
         * single stray box is an oversight; a canvas with several is a habit,
         * and scoring them identically was how twenty spare nodes used to cost
         * exactly what one did.
         */
        severity: orphans.length >= 3 ? 'medium' : 'low',
        title: 'Disconnected nodes',
        message: `${labels} ${plural ? 'are' : 'is'} connected to nothing, so ${plural ? 'they play' : 'it plays'} no part in the design being evaluated. Wire ${plural ? 'them' : 'it'} in or remove ${plural ? 'them' : 'it'} — a reviewer reads dangling boxes as unfinished thinking.`,
        affectedNodeIds: orphans.map((node) => node.id),
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

const clientToDb: EvalRule = {
  id: 'hygiene.client-to-db',
  dimension: 'hygiene',
  check({ index }) {
    const findings: RuleFinding[] = [];
    for (const edge of sortById(index.edges())) {
      const source = index.byId(edge.source);
      const target = index.byId(edge.target);
      if (source?.kind !== 'client') continue;
      if (target?.kind !== 'database' && target?.kind !== 'cache') continue;
      findings.push({
        ruleId: clientToDb.id,
        dimension: 'hygiene',
        severity: 'critical',
        title: 'Client talks directly to the data layer',
        message: `"${source.label}" reaches "${target.label}" directly, handing untrusted callers a connection to the layer that holds everyone's data. Every data access must pass through a service that authenticates the caller and scopes the query — that boundary is the difference between "my orders" and "all orders".`,
        affectedNodeIds: uniqueSorted([edge.source, edge.target]),
        affectedEdgeIds: [edge.id],
        suggestion: null,
      });
    }
    return findings;
  },
};

const syncCycle: EvalRule = {
  id: 'hygiene.sync-cycle',
  dimension: 'hygiene',
  check({ index }) {
    if (!index.hasCycle({ edgeKinds: ['sync'] })) return [];
    // The lesson is about the whole call graph, so no single element is
    // singled out — the cycle may thread any number of components.
    return [
      {
        ruleId: syncCycle.id,
        dimension: 'hygiene',
        severity: 'high',
        title: 'Synchronous calls form a cycle',
        message: `Somewhere in this design a chain of synchronous calls loops back onto itself, which means a component is blocked waiting on a call that is transitively waiting on it. Under load that shape deadlocks, and under failure it retry-storms — every member of the loop amplifies the others' retries. Break the cycle: one of those calls must become an async hand-off or disappear.`,
        affectedNodeIds: [],
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

const disconnectedClusters: EvalRule = {
  id: 'hygiene.disconnected-clusters',
  dimension: 'hygiene',
  check({ index }) {
    // Lone nodes are orphan-node territory; this rule is about whole islands.
    const clusters = index.components().filter((component) => component.length >= 2);
    if (clusters.length < 2) return [];
    const largest = clusters.reduce((best, candidate) =>
      candidate.length > best.length ? candidate : best,
    );
    const islands = clusters.filter((component) => component !== largest);
    return [
      {
        ruleId: disconnectedClusters.id,
        dimension: 'hygiene',
        severity: 'low',
        title: 'The design splits into disconnected islands',
        message: `${clusters.length} separate clusters share this canvas and nothing connects them, so at least one of them plays no part in the flow being evaluated. If the island is a real subsystem, draw the edge that feeds it; if it is a leftover sketch, remove it — a reviewer cannot grade an arrow that is not there.`,
        affectedNodeIds: uniqueSorted(
          islands.flatMap((component) => component.map((member) => member.id)),
        ),
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

const duplicateEdges: EvalRule = {
  id: 'hygiene.duplicate-edges',
  dimension: 'hygiene',
  check({ index }) {
    // Group by source+target+resolved kind; the first edge in canvas order is
    // the one kept, everything after it is the duplicate to remove.
    const groups = new Map<string, { source: string; target: string; edgeIds: string[] }>();
    for (const edge of index.edges()) {
      const key = JSON.stringify([edge.source, edge.target, index.edgeKind(edge)]);
      const bucket = groups.get(key);
      if (bucket) {
        bucket.edgeIds.push(edge.id);
      } else {
        groups.set(key, { source: edge.source, target: edge.target, edgeIds: [edge.id] });
      }
    }
    const findings: RuleFinding[] = [];
    for (const [, { source, target, edgeIds }] of [...groups.entries()].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      if (edgeIds.length < 2) continue;
      const sourceNode = index.byId(source);
      const targetNode = index.byId(target);
      if (!sourceNode || !targetNode) continue;
      const duplicates = edgeIds.slice(1);
      findings.push({
        ruleId: duplicateEdges.id,
        dimension: 'hygiene',
        severity: 'low',
        title: 'Duplicate edges between the same nodes',
        message: `"${sourceNode.label}" connects to "${targetNode.label}" ${edgeIds.length} times with the same edge kind — the extra arrows say nothing the first one did not, and a reviewer will wonder which one carries the meaning. One edge per relationship keeps the diagram legible.`,
        affectedNodeIds: uniqueSorted([source, target]),
        affectedEdgeIds: [...duplicates].sort(),
        suggestion: {
          description: 'Remove the redundant duplicate edges — one arrow already says it.',
          ops: duplicates.map((edgeId) => ({ op: 'remove-edge', edgeId })),
        },
      });
    }
    return findings;
  },
};

const meshOverkill: EvalRule = {
  id: 'hygiene.mesh-overkill',
  dimension: 'hygiene',
  check({ index }) {
    const meshes = sortById(index.byKind('service-mesh'));
    if (meshes.length === 0 || index.byKind('service').length >= 3) return [];
    return [
      {
        ruleId: meshOverkill.id,
        dimension: 'hygiene',
        severity: 'low',
        title: 'A service mesh with almost nothing to mesh',
        message: `A service mesh earns its sidecar tax when many services need uniform mTLS, retries and discovery — this design runs fewer than three, so the mesh adds a proxy hop and an operations burden to traffic a direct call handles fine. Save the mesh for the graph that actually sprawls.`,
        affectedNodeIds: meshes.map((mesh) => mesh.id),
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

export const hygieneRules: EvalRule[] = [
  orphanNode,
  clientToDb,
  syncCycle,
  disconnectedClusters,
  duplicateEdges,
  meshOverkill,
];
