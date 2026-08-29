/**
 * Predicate and patch helpers the archetype banks share. Everything here is
 * pure and reads only the canonical config-knob vocabulary; each bank keeps
 * its own teach prose and weights — what they share is the mechanics.
 */
import type { CanvasNode, GraphPatch, NodeKind } from '@sysdesign/contracts';

import type { GraphIndex } from '../../../graph-index';
import { sortById, SuggestedIds } from '../../../rules/shared';
import type { RuleContext } from '../../../types';
import type { ExpectationCheck } from '../types';
import { met, unmet } from '../types';

/**
 * The observability check every archetype asks: a wired monitoring block on
 * the canvas is the only evidence that counts.
 */
export function monitoringPresence({ index }: RuleContext): ExpectationCheck {
  const monitors = sortById(index.byKind('monitoring'));
  if (monitors.length > 0) return met(monitors.map((node) => node.id));
  return unmet();
}

/**
 * Ghost fix for an unobserved pipeline: add a monitoring block. Monitoring is
 * an annotation node, never a traffic hop — the edge from the entry component
 * only records what the block watches.
 */
export function suggestMonitoring({ index }: RuleContext, label: string): GraphPatch {
  const ids = new SuggestedIds(index);
  const anchor =
    sortById(index.byKind('gateway'))[0] ?? sortById(index.byKind('service'))[0] ?? null;
  const monitoringId = ids.next('monitoring');
  return {
    description: 'Add a monitoring block over the pipeline so trouble shows up as an alert.',
    ops: [
      { op: 'add-node', node: { id: monitoringId, kind: 'monitoring', label } },
      ...(anchor
        ? [
            {
              op: 'add-edge' as const,
              edge: {
                id: ids.next('edge-monitor'),
                source: anchor.id,
                target: monitoringId,
                kind: 'async' as const,
              },
            },
          ]
        : []),
    ],
  };
}

/**
 * Mirrors exp.fst.dlq-on-queues: every queue is covered by `config.dlq` or an
 * adjacent queue acting as its dead-letter target. No queues at all is unmet —
 * the capability was never demonstrated.
 */
export function dlqCoverage({ index }: RuleContext): ExpectationCheck {
  const queues = sortById(index.byKind('queue'));
  if (queues.length === 0) return unmet();
  const bare = queues.filter(
    (queue) =>
      queue.config?.dlq !== true &&
      !index.neighbors(queue.id).some((neighbor) => neighbor.kind === 'queue'),
  );
  if (bare.length > 0) return unmet(bare.map((node) => node.id));
  return met(queues.map((node) => node.id));
}

export function suggestDlq({ index }: RuleContext): GraphPatch | null {
  const queue = sortById(index.byKind('queue')).find(
    (candidate) =>
      candidate.config?.dlq !== true &&
      !index.neighbors(candidate.id).some((neighbor) => neighbor.kind === 'queue'),
  );
  if (!queue) return null;
  return {
    description: 'Give the queue a dead-letter target for messages that keep failing.',
    ops: [{ op: 'update-node', nodeId: queue.id, set: { config: { ...queue.config, dlq: true } } }],
  };
}

/**
 * Regional redundancy as the vocabulary can express it: ≥2 distinct
 * `config.region` values across the service/database tier, or a database
 * marked `multiRegion`. Only services and databases carry a region knob, so
 * every bank reads the spread off those two kinds.
 */
export function regionSpread(index: GraphIndex): ExpectationCheck {
  const placed = [...index.byKind('service'), ...index.byKind('database')];
  const regions = new Set(
    placed
      .map((node) => node.config?.region)
      .filter((region): region is string => typeof region === 'string' && region.length > 0),
  );
  const multiRegionDb = index.byKind('database').filter((db) => db.config?.multiRegion === true);
  if (regions.size >= 2 || multiRegionDb.length > 0) {
    const evidence = sortById(
      placed.filter(
        (node) => typeof node.config?.region === 'string' || node.config?.multiRegion === true,
      ),
    );
    return met(evidence.map((node) => node.id));
  }
  return unmet(sortById(placed).map((node) => node.id));
}

/** Nodes of the given kinds that a client can reach — the read-side helpers. */
export function onClientReadPath(index: GraphIndex, kinds: readonly NodeKind[]): CanvasNode[] {
  const clients = index.clients();
  return sortById(
    kinds
      .flatMap((kind) => index.byKind(kind))
      .filter((node) => clients.some((client) => index.pathExists(client.id, node.id))),
  );
}

/**
 * Ghost fix for a bare read path: hang a cache off the client-facing service
 * and wire it through to the primary store, so the accepted patch never
 * leaves a cache posing as the system of record.
 */
export function suggestReadCache({ index }: RuleContext): GraphPatch | null {
  const client = sortById(index.clients())[0];
  if (!client) return null;
  const ids = new SuggestedIds(index);
  const db = sortById(index.byKind('database')).find((candidate) =>
    index.pathExists(client.id, candidate.id),
  );
  const serviceBefore = sortById(index.byKind('service')).find(
    (service) =>
      index.pathExists(client.id, service.id) && (!db || index.pathExists(service.id, db.id)),
  );
  const source = serviceBefore ?? client;
  const cacheId = ids.next('cache');
  return {
    description: 'Put a cache on the read path so repeat reads stop hitting the primary store.',
    ops: [
      { op: 'add-node', node: { id: cacheId, kind: 'cache', label: 'Read cache' } },
      {
        op: 'add-edge',
        edge: { id: ids.next('edge-cache'), source: source.id, target: cacheId, kind: 'sync' },
      },
      ...(db
        ? [
            {
              op: 'add-edge' as const,
              edge: {
                id: ids.next('edge-cache-store'),
                source: cacheId,
                target: db.id,
                kind: 'sync' as const,
              },
            },
          ]
        : []),
    ],
  };
}
