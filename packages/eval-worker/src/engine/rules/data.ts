/**
 * Data: is the right store doing the right job, and is truth durable?
 */
import type { NodeKind } from '@sysdesign/contracts';

import type { EvalRule, RuleFinding } from '../types';
import { configNumber, formatInt, mayWrite, sortById, SuggestedIds, uniqueSorted } from './shared';

const mixedOltpAnalytics: EvalRule = {
  id: 'data.mixed-oltp-analytics',
  dimension: 'data',
  check({ facts, index }) {
    // Same probe style as no-search-index below: the functional requirements
    // asking for analytical reads are the evidence, not the archetype.
    if (!facts.functionalCapabilities.includes('analytics')) return [];
    const databases = index.byKind('database');
    if (databases.length !== 1) return [];
    if (index.hasKind('replica') || index.hasKind('search-index')) return [];
    const db = databases[0];
    return [
      {
        ruleId: mixedOltpAnalytics.id,
        dimension: 'data',
        severity: 'medium',
        title: 'Dashboards and OLTP share one store',
        message: `Analytical reads — the dashboards and reports the requirements ask for — and transactional writes both hit "${db.label}", and analytical scans are exactly the queries that evict the OLTP working set and hold the longest locks. Split the read path — a replica or a purpose-built analytics store — before the heaviest dashboard query becomes everyone's outage.`,
        affectedNodeIds: [db.id],
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

const noSearchIndex: EvalRule = {
  id: 'data.no-search-index',
  dimension: 'data',
  check({ facts, index }) {
    if (!facts.functionalCapabilities.includes('search')) return [];
    if (index.hasKind('search-index')) return [];
    return [
      {
        ruleId: noSearchIndex.id,
        dimension: 'data',
        severity: 'medium',
        title: 'Search requirement with no search index',
        message: `The requirements call for search, but nothing in the design provides an inverted index — so search degrades to LIKE-style scans against the primary store. With ${formatInt(facts.scaleTargets.concurrentUsers)} concurrent users, full-text scans on the transactional database are a latency cliff.`,
        affectedNodeIds: [],
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

const cacheAsSourceOfTruth: EvalRule = {
  id: 'data.cache-as-source-of-truth',
  dimension: 'data',
  check({ index }) {
    const findings: RuleFinding[] = [];
    const databases = index.byKind('database');
    for (const cache of sortById(index.byKind('cache'))) {
      const writerEdges = sortById(
        index.inEdges(cache.id).filter((edge) => {
          const kind = index.byId(edge.source)?.kind;
          return kind === 'client' || kind === 'service';
        }),
      );
      if (writerEdges.length === 0) continue;
      const durable = databases.some((db) => index.pathExists(cache.id, db.id));
      if (durable) continue;
      findings.push({
        ruleId: cacheAsSourceOfTruth.id,
        dimension: 'data',
        severity: 'high',
        title: 'Cache with no durable store behind it',
        message: `Writes flow into "${cache.label}" but no database is reachable downstream of it, so the cache is acting as the system of record. Caches evict, restart cold, and drop data by design — anything only they hold is already lost.`,
        affectedNodeIds: uniqueSorted([cache.id, ...writerEdges.map((edge) => edge.source)]),
        affectedEdgeIds: uniqueSorted(writerEdges.map((edge) => edge.id)),
        suggestion: null,
      });
    }
    return findings;
  },
};

/**
 * The secondary stores a dual write can leave inconsistent. Cache is
 * deliberately excluded: cache-aside is a read-path idiom, not dual-write.
 */
const DUAL_WRITE_STORE_KINDS: readonly NodeKind[] = [
  'search-index',
  'object-store',
  'kv-store',
  'data-warehouse',
];

const dualWriteNoOutbox: EvalRule = {
  id: 'data.dual-write-no-outbox',
  dimension: 'data',
  check({ index }) {
    if (index.hasKind('queue') || index.hasKind('event-stream') || index.hasKind('cdc-connector')) {
      return [];
    }
    const findings: RuleFinding[] = [];
    const ids = new SuggestedIds(index);
    for (const service of sortById(index.byKind('service'))) {
      const syncOuts = index.outEdges(service.id).filter((edge) => index.edgeKind(edge) === 'sync');
      const dbEdges = sortById(
        syncOuts.filter((edge) => index.byId(edge.target)?.kind === 'database'),
      );
      const storeEdges = sortById(
        syncOuts.filter((edge) => {
          const kind = index.byId(edge.target)?.kind;
          return kind !== undefined && DUAL_WRITE_STORE_KINDS.includes(kind);
        }),
      );
      if (dbEdges.length === 0 || storeEdges.length === 0) continue;
      const dbId = dbEdges[0].target;
      const storeId = storeEdges[0].target;
      const cdcId = ids.next('cdc-connector');
      findings.push({
        ruleId: dualWriteNoOutbox.id,
        dimension: 'data',
        severity: 'high',
        title: 'Dual write with no outbox between stores',
        message: `"${service.label}" writes two stores in the same request, and the second write can always fail after the first commits — no retry loop makes two independent writes atomic. Route the derived store through change-data-capture (or an outbox) so the database commit is the only write the service makes and everything else follows from it.`,
        affectedNodeIds: uniqueSorted([service.id, dbId, storeId]),
        affectedEdgeIds: uniqueSorted([dbEdges[0].id, storeEdges[0].id]),
        suggestion: {
          description:
            'Derive the secondary store from the database commit log instead of writing both.',
          ops: [
            {
              op: 'add-node',
              node: { id: cdcId, kind: 'cdc-connector', label: 'CDC connector' },
            },
            {
              op: 'add-edge',
              edge: { id: ids.next('edge-cdc-source'), source: dbId, target: cdcId, kind: 'async' },
            },
            {
              op: 'add-edge',
              edge: {
                id: ids.next('edge-cdc-sink'),
                source: cdcId,
                target: storeId,
                kind: 'async',
              },
            },
          ],
        },
      });
    }
    return findings;
  },
};

const noIdempotentConsumers: EvalRule = {
  id: 'data.no-idempotent-consumers',
  dimension: 'data',
  nfrKind: 'consistency',
  check({ facts, index }) {
    if (!facts.nfrKinds.includes('consistency')) return [];
    const findings: RuleFinding[] = [];
    for (const worker of sortById(index.byKind('worker'))) {
      if (worker.config?.idempotent === true) continue;
      const feedingQueues = sortById(
        index.producersOf(worker.id).filter((producer) => producer.kind === 'queue'),
      );
      if (feedingQueues.length === 0) continue;
      findings.push({
        ruleId: noIdempotentConsumers.id,
        dimension: 'data',
        severity: 'high',
        title: 'Queue consumer replays without idempotency',
        message: `The prompt demands consistency, and "${worker.label}" consumes "${feedingQueues[0].label}" without being idempotent — at-least-once delivery means every crash or timeout replays messages, and each replay repeats the side effect. Key the work so the same message produces the same single outcome no matter how many times it arrives.`,
        affectedNodeIds: uniqueSorted([worker.id, ...feedingQueues.map((queue) => queue.id)]),
        affectedEdgeIds: [],
        suggestion: {
          description: 'Make the consumer idempotent so redelivery converges instead of repeating.',
          ops: [
            {
              op: 'update-node',
              nodeId: worker.id,
              set: { config: { ...(worker.config ?? {}), idempotent: true } },
            },
          ],
        },
      });
    }
    return findings;
  },
};

const cacheNoInvalidation: EvalRule = {
  id: 'data.cache-no-invalidation',
  dimension: 'data',
  check({ facts, index }) {
    if (facts.difficulty === 'intro') return [];
    const findings: RuleFinding[] = [];
    const flagged = new Set<string>();
    for (const service of sortById(index.byKind('service'))) {
      const outs = index.outEdges(service.id);
      const writesDb = outs.some((edge) => index.byId(edge.target)?.kind === 'database');
      if (!writesDb) continue;
      for (const edge of sortById(outs)) {
        const cache = index.byId(edge.target);
        if (cache?.kind !== 'cache' || flagged.has(cache.id)) continue;
        if (cache.config?.invalidation === true) continue;
        const strategy = cache.config?.['strategy'];
        if (strategy === 'write-through' || strategy === 'write-back') continue;
        flagged.add(cache.id);
        findings.push({
          ruleId: cacheNoInvalidation.id,
          dimension: 'data',
          severity: 'medium',
          title: 'Writer-side cache with no invalidation story',
          message: `"${service.label}" writes the database and populates "${cache.label}", but nothing invalidates the cache when the database changes — readers keep getting the old value for as long as the entry lives. Invalidate on write (or adopt a write-through strategy) so the cache is stale by policy, never by accident.`,
          affectedNodeIds: uniqueSorted([service.id, cache.id]),
          affectedEdgeIds: [edge.id],
          suggestion: {
            description: 'Invalidate cached entries on write so readers never see stale truth.',
            ops: [
              {
                op: 'update-node',
                nodeId: cache.id,
                set: { config: { ...(cache.config ?? {}), invalidation: true } },
              },
            ],
          },
        });
      }
    }
    return findings;
  },
};

const multiWriterInventory: EvalRule = {
  id: 'data.multi-writer-inventory',
  dimension: 'data',
  nfrKind: 'consistency',
  check({ facts, index }) {
    if (!facts.nfrKinds.includes('consistency')) return [];
    const findings: RuleFinding[] = [];
    for (const db of sortById(index.byKind('database'))) {
      const writerEdges = index.inEdges(db.id).filter(
        (edge) =>
          index.edgeKind(edge) === 'sync' &&
          index.byId(edge.source)?.kind === 'service' &&
          // A service the author has declared read-only is not in the race.
          mayWrite(edge),
      );
      const writerIds = uniqueSorted(writerEdges.map((edge) => edge.source));
      if (writerIds.length < 2) continue;
      findings.push({
        ruleId: multiWriterInventory.id,
        dimension: 'data',
        severity: 'high',
        title: 'Multiple services race on one consistency-critical store',
        message: `${writerIds.length} services write "${db.label}" directly while the prompt demands consistency — two writers can read the same count and both decrement it, and no service-level check prevents the race. Serialize the contended writes through one owner (a single writer service, or a queue in front of the store) so the invariant has exactly one enforcer.`,
        affectedNodeIds: uniqueSorted([db.id, ...writerIds]),
        affectedEdgeIds: uniqueSorted(writerEdges.map((edge) => edge.id)),
        suggestion: null,
      });
    }
    return findings;
  },
};

const queueNotDurable: EvalRule = {
  id: 'data.queue-not-durable',
  dimension: 'data',
  nfrKind: 'durability',
  check({ facts, index }) {
    if (!facts.nfrKinds.includes('durability')) return [];
    const databases = index.byKind('database');
    const findings: RuleFinding[] = [];
    for (const queue of sortById(index.byKind('queue'))) {
      // Explicit opt-out only: an unset delivery mode is not an accusation.
      if (queue.config?.['delivery'] !== 'at-most-once') continue;
      if (!databases.some((db) => index.pathExists(queue.id, db.id))) continue;
      findings.push({
        ruleId: queueNotDurable.id,
        dimension: 'data',
        severity: 'medium',
        title: 'At-most-once delivery on the durable path',
        message: `"${queue.label}" is configured at-most-once and feeds the durable store, so a consumer crash between receive and commit silently drops the message — the exact loss the prompt's durability requirement forbids. At-least-once delivery plus an idempotent consumer is the durable spelling: nothing is lost, and replays converge.`,
        affectedNodeIds: [queue.id],
        affectedEdgeIds: [],
        suggestion: {
          description: 'Deliver at-least-once so a crashed consumer redelivers instead of losing.',
          ops: [
            {
              op: 'update-node',
              nodeId: queue.id,
              set: { config: { ...(queue.config ?? {}), delivery: 'at-least-once' } },
            },
          ],
        },
      });
    }
    return findings;
  },
};

const noBackupStrategy: EvalRule = {
  id: 'data.no-backup-strategy',
  dimension: 'data',
  nfrKind: 'durability',
  check({ facts, index }) {
    if (facts.difficulty === 'intro') return [];
    if (!facts.nfrKinds.includes('durability')) return [];
    const findings: RuleFinding[] = [];
    for (const db of sortById(index.byKind('database'))) {
      if (db.config?.backups === true || db.config?.multiRegion === true) continue;
      if (index.neighbors(db.id).some((neighbor) => neighbor.kind === 'replica')) continue;
      findings.push({
        ruleId: noBackupStrategy.id,
        dimension: 'data',
        severity: 'medium',
        title: 'System of record with no recovery story',
        message: `The prompt demands durability, and "${db.label}" shows no backups, no replica, and no second region — replication guards against a dead box, but only backups guard against a bad deploy or a destructive migration that replicates perfectly. Turn on backups so there is a copy that yesterday's mistake cannot touch.`,
        affectedNodeIds: [db.id],
        affectedEdgeIds: [],
        suggestion: {
          description: 'Back up the system of record so corruption has an undo.',
          ops: [
            {
              op: 'update-node',
              nodeId: db.id,
              set: { config: { ...(db.config ?? {}), backups: true } },
            },
          ],
        },
      });
    }
    return findings;
  },
};

const streamNoRetention: EvalRule = {
  id: 'data.stream-no-retention',
  dimension: 'data',
  nfrKind: 'durability',
  check({ facts, index }) {
    if (facts.difficulty !== 'advanced') return [];
    if (!facts.nfrKinds.includes('durability')) return [];
    const findings: RuleFinding[] = [];
    for (const stream of sortById(index.byKind('event-stream'))) {
      if (configNumber(stream, 'retentionHours') !== undefined) continue;
      findings.push({
        ruleId: streamNoRetention.id,
        dimension: 'data',
        severity: 'low',
        title: 'Stream retention left to defaults',
        message: `"${stream.label}" declares no retention window, so how far a consumer can rewind after an outage is whatever the broker defaults to — replay is the recovery mechanism of a streaming pipeline, and its horizon should be a decision, not an accident. State the retention explicitly, sized to the longest outage you intend to replay through.`,
        affectedNodeIds: [stream.id],
        affectedEdgeIds: [],
        suggestion: {
          description: 'Pin the replay horizon so recovery capacity is a stated decision.',
          ops: [
            {
              op: 'update-node',
              nodeId: stream.id,
              set: { config: { ...(stream.config ?? {}), retentionHours: 168 } },
            },
          ],
        },
      });
    }
    return findings;
  },
};

/*
 * NOTE: the once-deferred `data.replica-receives-writes` lesson now lives in
 * the interface pack as `data.replica-receives-commands` (rules/interfaces.ts).
 * Edges can declare the operations they carry, so a write into a replica is
 * provable there instead of presumed here.
 */
const cacheStalenessUnbounded: EvalRule = {
  id: 'data.cache-staleness-unbounded',
  dimension: 'data',
  check({ facts, index }) {
    if (!facts.nfrKinds.includes('consistency')) return [];
    const caches = sortById(index.byKind('cache'));
    // A TTL or a declared invalidation both bound how stale a read can be;
    // neither means the answer is "until something happens to evict it".
    // `invalidation` is a BOOLEAN in the config vocabulary — the panel writes a
    // checkbox — and reading it as a string here meant ticking the box could
    // never satisfy this rule. Caught by driving the real UI.
    const unbounded = caches.filter(
      (cache) =>
        configNumber(cache, 'ttlSeconds') === undefined && cache.config?.invalidation !== true,
    );
    if (unbounded.length === 0) return [];
    return [
      {
        ruleId: cacheStalenessUnbounded.id,
        dimension: 'data',
        severity: 'low',
        title: 'Cached reads with no staleness bound',
        message: `${unbounded.map((cache) => `"${cache.label}"`).join(', ')} declares neither a TTL nor an invalidation strategy, so nothing says how old a cached answer may be — and this prompt states a consistency requirement. "How stale is acceptable, and enforced how" is the question a cache exists to answer.`,
        affectedNodeIds: unbounded.map((cache) => cache.id),
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

const replicaLagUnbounded: EvalRule = {
  id: 'data.replica-lag-unbounded',
  dimension: 'data',
  check({ facts, index }) {
    if (!facts.nfrKinds.includes('consistency')) return [];
    const replicas = sortById(index.byKind('replica'));
    const unbounded = replicas.filter(
      (replica) => configNumber(replica, 'lagToleranceMs') === undefined,
    );
    if (unbounded.length === 0) return [];
    return [
      {
        ruleId: replicaLagUnbounded.id,
        dimension: 'data',
        severity: 'low',
        title: 'Replica reads with no lag budget',
        message: `${unbounded.map((replica) => `"${replica.label}"`).join(', ')} serves reads with no stated lag tolerance, so a read-after-write can return the old value and nothing in the design says how far behind is too far. Naming the budget is what turns "eventually consistent" from a shrug into a promise.`,
        affectedNodeIds: unbounded.map((replica) => replica.id),
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

export const dataRules: EvalRule[] = [
  cacheStalenessUnbounded,
  replicaLagUnbounded,
  mixedOltpAnalytics,
  noSearchIndex,
  cacheAsSourceOfTruth,
  dualWriteNoOutbox,
  noIdempotentConsumers,
  cacheNoInvalidation,
  multiWriterInventory,
  queueNotDurable,
  noBackupStrategy,
  streamNoRetention,
];
