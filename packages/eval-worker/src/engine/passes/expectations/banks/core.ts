/**
 * Universal expectations: what every archetype must demonstrate before the
 * archetype-specific banks even start asking questions. These are what make
 * an empty canvas an F instead of an A.
 */
import { formatInt, sortById, SuggestedIds } from '../../../rules/shared';
import type { Expectation } from '../types';
import { met, unmet } from '../types';

const entryService: Expectation = {
  id: 'exp.core.entry-service',
  dimension: 'hygiene',
  weight: 1,
  severityIfUnmet: 'critical',
  minDifficulty: 'intro',
  archetypes: 'all',
  title: 'No compute serves the workload',
  teach: (facts) =>
    `Nothing on this canvas does the work: at ${formatInt(facts.scaleTargets.requestsPerSecond)} req/s there is no service or worker a client can reach to absorb a single request. Start with the component that owns the core flow and grow the design outward from it.`,
  satisfiedBy: ({ index }) => {
    const compute = sortById([...index.byKind('service'), ...index.byKind('worker')]);
    const reachable = index.reachableFrom(index.clients().map((client) => client.id));
    const serving = compute.filter((node) => reachable.has(node.id));
    if (serving.length > 0) return met(serving.map((node) => node.id));
    // Compute may exist but hang unreachable — point at it so the fix is a wire, not a node.
    return unmet(compute.map((node) => node.id));
  },
  suggest: ({ index }) => {
    if (index.byKind('service').length > 0 || index.byKind('worker').length > 0) return null;
    const ids = new SuggestedIds(index);
    const client = sortById(index.clients())[0];
    const serviceId = ids.next('service');
    return {
      description: 'Add the service that owns the core request flow.',
      ops: [
        { op: 'add-node', node: { id: serviceId, kind: 'service', label: 'Core service' } },
        ...(client
          ? [
              {
                op: 'add-edge' as const,
                edge: {
                  id: ids.next('edge-entry'),
                  source: client.id,
                  target: serviceId,
                  kind: 'sync' as const,
                },
              },
            ]
          : []),
      ],
    };
  },
};

const durableStoreReachable: Expectation = {
  id: 'exp.core.durable-store-reachable',
  dimension: 'data',
  weight: 2,
  severityIfUnmet: 'critical',
  minDifficulty: 'intro',
  archetypes: 'all',
  title: 'No durable store behind the workload',
  teach: (facts) =>
    `State has nowhere durable to live: no database is reachable from the client-facing side of this design, so anything the system accepts is gone on the first restart. The prompt's ${facts.scaleTargets.availabilityPct}% availability target starts with data that survives a crash.`,
  satisfiedBy: ({ index }) => {
    const databases = sortById(index.byKind('database'));
    const reachable = index.reachableFrom(index.clients().map((client) => client.id));
    const backing = databases.filter((db) => reachable.has(db.id));
    if (backing.length > 0) return met(backing.map((db) => db.id));
    return unmet(databases.map((db) => db.id));
  },
  suggest: ({ index }) => {
    if (index.byKind('database').length > 0) return null;
    const ids = new SuggestedIds(index);
    const writer =
      sortById(index.byKind('service'))[0] ??
      sortById(index.byKind('worker'))[0] ??
      sortById(index.clients())[0];
    const databaseId = ids.next('database');
    return {
      description: 'Add the system of record the workload writes to and reads from.',
      ops: [
        { op: 'add-node', node: { id: databaseId, kind: 'database', label: 'Primary database' } },
        ...(writer
          ? [
              {
                op: 'add-edge' as const,
                edge: {
                  id: ids.next('edge-store'),
                  source: writer.id,
                  target: databaseId,
                  kind: 'sync' as const,
                },
              },
            ]
          : []),
      ],
    };
  },
};

export const coreExpectations: Expectation[] = [entryService, durableStoreReachable];
