/**
 * Scalability: does throughput grow without a single component melting first?
 */
import { cacheFronts, type CanvasNode, type PatchOp } from '@sysdesign/contracts';

import { mechanismGraphOf } from '../mechanisms';

import type { EvalRule, RuleFinding } from '../types';
import {
  configNumber,
  formatInt,
  frontedByEdgeTier,
  readsFraction,
  replicasOf,
  sortById,
  SuggestedIds,
  uniqueSorted,
} from './shared';

/**
 * Order-of-magnitude throughput each replica of a tier is assumed to sustain.
 * Deliberately generous — real numbers depend on the workload, and the point
 * of the capacity rules is the back-of-envelope habit (does replicas × rate
 * cover the prompt's peak?), not queueing theory. Reference designs sized
 * sanely must pass; only designs off by a multiple should hear about it.
 */
export const PER_REPLICA_RPS = { service: 3000, gateway: 10000, worker: 1000 } as const;

/**
 * What one instance of this node serves — the author's number when they state
 * one, ours when they do not.
 *
 * The engine used to assert 3000 req/s per service replica and grade the
 * arithmetic against its own assumption, which is the one number in a capacity
 * argument an engineer would actually have measured. Declaring
 * `rpsPerInstance` moves the check from "does your replica count match OUR
 * assumption" to "does it match YOUR arithmetic" — which is the same move the
 * design brief made one level up: the author supplies the claim, the engine
 * checks it holds.
 */
export function perInstanceRps(node: CanvasNode, fallback: number): number {
  const declared = configNumber(node, 'rpsPerInstance');
  return declared !== undefined && declared > 0 ? declared : fallback;
}

/**
 * Writes/s a single unsharded primary is assumed to absorb before write
 * buffering or sharding becomes the lesson. Generous for the same reason.
 */
export const SINGLE_PRIMARY_WRITE_RPS = 5000;

const noCacheReadHeavy: EvalRule = {
  id: 'scalability.no-cache-read-heavy',
  dimension: 'scalability',
  check({ facts, index }) {
    const fraction = readsFraction(facts.scaleTargets.readWriteRatio);
    if (fraction === null || fraction < 0.8) return [];
    const caches = index.byKind('cache');
    const graph = mechanismGraphOf(index);
    const offenders: Array<{ clientId: string; dbId: string }> = [];
    for (const client of sortById(index.clients())) {
      for (const db of sortById(index.byKind('database'))) {
        if (!index.pathExists(client.id, db.id)) continue;
        const cacheOnPath = caches.some(
          (cache) => index.pathExists(client.id, cache.id) && cacheFronts(graph, cache.id, db.id),
        );
        if (!cacheOnPath) offenders.push({ clientId: client.id, dbId: db.id });
      }
    }
    if (offenders.length === 0) return [];

    const first = offenders[0];
    const db = index.byId(first.dbId);
    if (!db) return [];
    const ids = new SuggestedIds(index);
    // Hang the cache off the service closest to the read path when one exists;
    // otherwise suggest it directly on the client's path.
    const serviceBefore = sortById(index.byKind('service')).find(
      (service) =>
        index.pathExists(first.clientId, service.id) && index.pathExists(service.id, first.dbId),
    );
    const cacheId = ids.next('cache');
    const cacheSourceId = serviceBefore ? serviceBefore.id : first.clientId;
    const ops: PatchOp[] = [
      { op: 'add-node', node: { id: cacheId, kind: 'cache', label: 'Read cache' } },
      {
        op: 'add-edge',
        edge: { id: ids.next('edge-cache'), source: cacheSourceId, target: cacheId, kind: 'sync' },
      },
    ];

    return [
      {
        ruleId: noCacheReadHeavy.id,
        dimension: 'scalability',
        severity: 'high',
        title: 'Read-heavy workload with no cache',
        message: `The workload is ${facts.scaleTargets.readWriteRatio} reads to writes, yet every read travels the full path to "${db.label}" — the hardest component in the graph to scale. At ${formatInt(facts.scaleTargets.requestsPerSecond)} req/s a cache absorbs the repeat reads and protects the p99 ${formatInt(facts.scaleTargets.p99LatencyMs)}ms target.`,
        affectedNodeIds: uniqueSorted(offenders.flatMap((o) => [o.clientId, o.dbId])),
        affectedEdgeIds: [],
        suggestion: {
          description:
            'Put a cache in front of the database so repeated reads stop paying the full storage round trip.',
          ops,
        },
      },
    ];
  },
};

const syncToSlowConsumer: EvalRule = {
  id: 'scalability.sync-to-slow-consumer',
  dimension: 'scalability',
  check({ index }) {
    const findings: RuleFinding[] = [];
    const ids = new SuggestedIds(index);
    for (const edge of sortById(index.edges())) {
      if (index.edgeKind(edge) !== 'sync') continue;
      const source = index.byId(edge.source);
      const target = index.byId(edge.target);
      if (source?.kind !== 'service') continue;
      if (target?.kind !== 'worker' && target?.kind !== 'external-api') continue;
      const queueId = ids.next('queue');
      findings.push({
        ruleId: syncToSlowConsumer.id,
        dimension: 'scalability',
        severity: 'high',
        title: 'Synchronous call into a slow consumer',
        message: `"${source.label}" calls "${target.label}" synchronously, chaining its latency and error budget to the slowest dependency downstream. A queue in between lets the caller acknowledge fast while "${target.label}" drains work at its own pace.`,
        affectedNodeIds: uniqueSorted([source.id, target.id]),
        affectedEdgeIds: [edge.id],
        suggestion: {
          description:
            'Buffer this call through a queue so a slow consumer cannot stall the caller.',
          ops: [
            { op: 'add-node', node: { id: queueId, kind: 'queue', label: 'Work queue' } },
            {
              op: 'add-edge',
              edge: {
                id: ids.next('edge-enqueue'),
                source: source.id,
                target: queueId,
                kind: 'async',
              },
            },
            {
              op: 'add-edge',
              edge: {
                id: ids.next('edge-dequeue'),
                source: queueId,
                target: target.id,
                kind: 'async',
              },
            },
            { op: 'remove-edge', edgeId: edge.id },
          ],
        },
      });
    }
    return findings;
  },
};

const sharedDbManyServices: EvalRule = {
  id: 'scalability.shared-db-many-services',
  dimension: 'scalability',
  check({ index }) {
    const findings: RuleFinding[] = [];
    for (const db of sortById(index.byKind('database'))) {
      const serviceEdges = index
        .inEdges(db.id)
        .filter((edge) => index.byId(edge.source)?.kind === 'service');
      const serviceIds = uniqueSorted(serviceEdges.map((edge) => edge.source));
      if (serviceIds.length < 3) continue;
      findings.push({
        ruleId: sharedDbManyServices.id,
        dimension: 'scalability',
        severity: 'medium',
        title: 'Many services share one database',
        message: `${serviceIds.length} services write into "${db.label}", making its schema, locks, and capacity shared state that couples all of them. One noisy service can starve the rest, and none of them can evolve its data model independently.`,
        affectedNodeIds: uniqueSorted([...serviceIds, db.id]),
        affectedEdgeIds: uniqueSorted(serviceEdges.map((edge) => edge.id)),
        suggestion: null,
      });
    }
    return findings;
  },
};

const unboundedFanout: EvalRule = {
  id: 'scalability.unbounded-fanout',
  dimension: 'scalability',
  check({ index }) {
    const findings: RuleFinding[] = [];
    const ids = new SuggestedIds(index);
    for (const node of sortById(index.nodes())) {
      const syncOut = index.outEdges(node.id).filter((edge) => index.edgeKind(edge) === 'sync');
      if (syncOut.length <= 4) continue;
      const streamId = ids.next('event-stream');
      findings.push({
        ruleId: unboundedFanout.id,
        dimension: 'scalability',
        severity: 'medium',
        title: 'Unbounded synchronous fan-out',
        message: `"${node.label}" fans out ${syncOut.length} synchronous calls, so its latency is the sum of its slowest branches and any single failure fails the whole operation. Publishing one event and letting consumers subscribe decouples those paths.`,
        affectedNodeIds: [node.id],
        affectedEdgeIds: uniqueSorted(syncOut.map((edge) => edge.id)),
        suggestion: {
          description:
            'Publish once to an event stream and let each consumer subscribe independently instead of fanning out synchronous calls.',
          ops: [
            { op: 'add-node', node: { id: streamId, kind: 'event-stream', label: 'Event stream' } },
            {
              op: 'add-edge',
              edge: {
                id: ids.next('edge-publish'),
                source: node.id,
                target: streamId,
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

const capacityReplicasInsufficient: EvalRule = {
  id: 'scalability.capacity-replicas-insufficient',
  dimension: 'scalability',
  check({ facts, index }) {
    const clients = sortById(index.clients());
    if (clients.length === 0) return [];
    const rps = facts.scaleTargets.requestsPerSecond;
    const findings: RuleFinding[] = [];
    for (const service of sortById(index.byKind('service'))) {
      if (!frontedByEdgeTier(index, clients, service)) continue;
      const replicas = replicasOf(service);
      const perInstance = perInstanceRps(service, PER_REPLICA_RPS.service);
      if (rps <= replicas * perInstance) continue;
      const needed = Math.ceil(rps / perInstance);
      const declared = configNumber(service, 'rpsPerInstance') !== undefined;
      findings.push({
        ruleId: capacityReplicasInsufficient.id,
        dimension: 'scalability',
        severity: 'high',
        title: 'Service tier undersized for the stated peak',
        message: `The prompt peaks at ${formatInt(rps)} req/s and "${service.label}" runs ${replicas} replica${replicas === 1 ? '' : 's'} at ${formatInt(perInstance)} req/s each${declared ? ' — your own figure' : ', a generous default since none is stated'} — ${formatInt(replicas * perInstance)} req/s of capacity, short of the peak before any headroom. Back-of-envelope: peak ÷ per-instance rate says at least ${needed} replicas.`,
        affectedNodeIds: [service.id],
        affectedEdgeIds: [],
        suggestion: {
          description: 'Size the service tier so replicas × per-replica rate covers the peak.',
          ops: [
            {
              op: 'update-node',
              nodeId: service.id,
              set: { config: { ...(service.config ?? {}), replicas: needed } },
            },
          ],
        },
      });
    }
    return findings;
  },
};

const dbWriteBottleneck: EvalRule = {
  id: 'scalability.db-write-bottleneck',
  dimension: 'scalability',
  check({ facts, index }) {
    const fraction = readsFraction(facts.scaleTargets.readWriteRatio);
    if (fraction === null) return [];
    const writesPerSecond = facts.scaleTargets.requestsPerSecond * (1 - fraction);
    if (writesPerSecond <= SINGLE_PRIMARY_WRITE_RPS) return [];
    const buffers = [...index.byKind('queue'), ...index.byKind('event-stream')];
    const services = sortById(index.byKind('service'));
    const findings: RuleFinding[] = [];
    for (const db of sortById(index.byKind('database'))) {
      const sharding = db.config?.['sharding'];
      if (sharding !== undefined && sharding !== 'none') continue;
      const unbuffered = services.some(
        (service) =>
          index.pathExists(service.id, db.id) &&
          !buffers.some(
            (buffer) =>
              index.pathExists(service.id, buffer.id) && index.pathExists(buffer.id, db.id),
          ),
      );
      if (!unbuffered) continue;
      findings.push({
        ruleId: dbWriteBottleneck.id,
        dimension: 'scalability',
        severity: 'high',
        title: 'Write volume exceeds one primary with no buffer',
        message: `At ${facts.scaleTargets.readWriteRatio} reads to writes, ${formatInt(facts.scaleTargets.requestsPerSecond)} req/s is ${formatInt(writesPerSecond)} writes/s — beyond what a single unsharded primary like "${db.label}" absorbs, and the writes arrive with nothing to smooth them. Buffer the write path through a queue or stream, or shard the store, before the primary becomes the ceiling of the whole design.`,
        affectedNodeIds: [db.id],
        affectedEdgeIds: [],
        suggestion: null,
      });
    }
    return findings;
  },
};

/**
 * Advanced-only on purpose: the standard-tier reference designs run single
 * workers behind their queues and are frozen by calibration — at standard,
 * a lone worker draining a buffered queue is an accepted starting point.
 */
const workerPoolUnderscaled: EvalRule = {
  id: 'scalability.worker-pool-underscaled',
  dimension: 'scalability',
  check({ facts, index }) {
    if (facts.difficulty !== 'advanced') return [];
    const findings: RuleFinding[] = [];
    for (const worker of sortById(index.byKind('worker'))) {
      if (replicasOf(worker) > 1) continue;
      const hotQueue = sortById(
        index
          .producersOf(worker.id)
          .filter(
            (producer) =>
              producer.kind === 'queue' &&
              index
                .producersOf(producer.id)
                .some((source) => source.kind === 'service' && replicasOf(source) >= 3),
          ),
      )[0];
      if (!hotQueue) continue;
      findings.push({
        ruleId: workerPoolUnderscaled.id,
        dimension: 'scalability',
        severity: 'medium',
        title: 'Scaled producers drain into a single worker',
        message: `A service tier of 3+ replicas feeds "${hotQueue.label}", and "${worker.label}" drains it alone — the queue hides the imbalance until the backlog is hours deep. Consumers must scale with producers: at roughly ${formatInt(PER_REPLICA_RPS.worker)} jobs/s per worker replica, one instance cannot keep pace with a tier sized for the front-door peak.`,
        affectedNodeIds: uniqueSorted([hotQueue.id, worker.id]),
        affectedEdgeIds: [],
        suggestion: {
          description: 'Scale the worker pool so drain capacity keeps pace with the producers.',
          ops: [
            {
              op: 'update-node',
              nodeId: worker.id,
              set: { config: { ...(worker.config ?? {}), replicas: 3 } },
            },
          ],
        },
      });
    }
    return findings;
  },
};

const noShardingHotWrites: EvalRule = {
  id: 'scalability.no-sharding-hot-writes',
  dimension: 'scalability',
  check({ facts, index }) {
    if (facts.difficulty !== 'advanced') return [];
    const fraction = readsFraction(facts.scaleTargets.readWriteRatio);
    if (fraction === null) return [];
    const writesPerSecond = facts.scaleTargets.requestsPerSecond * (1 - fraction);
    if (writesPerSecond < 50000) return [];
    const findings: RuleFinding[] = [];
    for (const db of sortById(index.byKind('database'))) {
      const sharding = db.config?.['sharding'];
      if (sharding !== undefined && sharding !== 'none') continue;
      findings.push({
        ruleId: noShardingHotWrites.id,
        dimension: 'scalability',
        severity: 'medium',
        title: 'Write volume this hot demands sharding',
        message: `${formatInt(writesPerSecond)} writes/s is past what any single primary sustains, buffered or not — "${db.label}" needs the write load split across shards, each owning a slice of the key space. Hash sharding spreads a uniform key evenly; the deliberate choice of shard key is the design decision this scale exists to test.`,
        affectedNodeIds: [db.id],
        affectedEdgeIds: [],
        suggestion: {
          description:
            'Shard the store by hash so write load divides across independent primaries.',
          ops: [
            {
              op: 'update-node',
              nodeId: db.id,
              set: { config: { ...(db.config ?? {}), sharding: 'hash' } },
            },
          ],
        },
      });
    }
    return findings;
  },
};

const hotPartitionRisk: EvalRule = {
  id: 'scalability.hot-partition-risk',
  dimension: 'scalability',
  check({ facts, index }) {
    if (facts.difficulty !== 'advanced') return [];
    const shardedDbs = index
      .byKind('database')
      .filter((db) => db.config?.['sharding'] === 'hash' || db.config?.['sharding'] === 'range');
    if (shardedDbs.length > 0) return [];
    const partitionedStreams = index
      .byKind('event-stream')
      .filter((stream) => (configNumber(stream, 'partitions') ?? 0) >= 2);
    if (partitionedStreams.length > 0) return [];
    const candidates = sortById([...index.byKind('database'), ...index.byKind('event-stream')]);
    return [
      {
        ruleId: hotPartitionRisk.id,
        dimension: 'scalability',
        severity: 'medium',
        title: 'Nothing spreads the hot key',
        message: `This workload concentrates on a few keys at once — the drop everyone wants, the dashboard everyone watches — and no store is sharded and no stream is partitioned, so the hottest key lands on one box at the worst moment. Partitioning only helps if the hot key's traffic is spread deliberately: shard the store or partition the stream, and choose the key so the spike divides instead of piling up.`,
        affectedNodeIds: candidates.map((node) => node.id),
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

/**
 * Only services carry the autoscaling knob in the canvas vocabulary (workers
 * declare `concurrency` instead), so cost-elasticity is evidenced by an
 * autoscaled service tier or by serverless compute — which scales to zero by
 * construction. Suppression-paired with the cost expectations
 * (exp.fst.cost-scale-down, exp.dag.scale-to-zero) so the lesson lands once.
 */
const noAutoscaling: EvalRule = {
  id: 'scalability.no-autoscaling',
  dimension: 'scalability',
  nfrKind: 'cost',
  check({ facts, index }) {
    if (!facts.nfrKinds.includes('cost')) return [];
    if (index.hasKind('serverless-function')) return [];
    const services = sortById(index.byKind('service'));
    if (services.some((service) => service.config?.autoscaling === true)) return [];
    const first = services[0];
    return [
      {
        ruleId: noAutoscaling.id,
        dimension: 'scalability',
        severity: 'medium',
        title: 'Fixed capacity while the prompt caps spend',
        message: `The prompt makes cost a requirement, and every tier here is provisioned statically — the fleet sized for the ${formatInt(facts.scaleTargets.requestsPerSecond)} req/s peak burns the same money at 3am. Autoscale the stateless tiers (or run the bursty work on serverless compute) so capacity, and the bill, follow demand instead of the peak.`,
        affectedNodeIds: services.map((service) => service.id),
        affectedEdgeIds: [],
        suggestion: first
          ? {
              description: 'Autoscale the stateless tier so capacity follows demand.',
              ops: [
                {
                  op: 'update-node',
                  nodeId: first.id,
                  set: { config: { ...(first.config ?? {}), autoscaling: true } },
                },
              ],
            }
          : null,
      },
    ];
  },
};

const shardKeyUnnamed: EvalRule = {
  id: 'scalability.shard-key-unnamed',
  dimension: 'scalability',
  check({ index }) {
    const partitioned = sortById([
      ...index
        .byKind('database')
        .filter((db) => db.config?.['sharding'] === 'hash' || db.config?.['sharding'] === 'range'),
      ...index.byKind('event-stream').filter((s) => (configNumber(s, 'partitions') ?? 0) >= 2),
    ]);
    const unnamed = partitioned.filter((store) => {
      const key = store.config?.['partitionKey'];
      return typeof key !== 'string' || key.trim().length === 0;
    });
    if (unnamed.length === 0) return [];
    return [
      {
        ruleId: shardKeyUnnamed.id,
        dimension: 'scalability',
        severity: 'medium',
        title: 'Partitioned, but the key is unnamed',
        message: `${unnamed.map((store) => `"${store.label}"`).join(', ')} splits its load across partitions without saying what it splits on. The strategy is the easy half — the key is the decision: it fixes which queries stay single-partition, which become scatter-gather, and whether one hot value can put a whole shard underwater. Name it.`,
        affectedNodeIds: unnamed.map((store) => store.id),
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

const overengineeredIntro: EvalRule = {
  id: 'scalability.overengineered-intro',
  dimension: 'scalability',
  check({ facts, index }) {
    // Scale decides, not the difficulty label: heavy machinery at 400 req/s is
    // the same over-build whether the prompt calls itself intro or standard.
    if (facts.scaleTargets.requestsPerSecond >= 500) return [];
    const caches = sortById(index.byKind('cache'));
    const meshes = sortById(index.byKind('service-mesh'));
    const regional = sortById(
      index
        .nodes()
        .filter((node) => typeof node.config?.region === 'string' && node.config.region.length > 0),
    );
    const excess = [...(caches.length >= 2 ? caches : []), ...meshes, ...regional];
    if (excess.length === 0) return [];
    return [
      {
        ruleId: overengineeredIntro.id,
        dimension: 'scalability',
        severity: 'low',
        title: 'More machinery than the prompt asks for',
        message: `This prompt plays at ${formatInt(facts.scaleTargets.requestsPerSecond)} req/s, and layered caches, a service mesh, or regional placement each add an operational surface no requirement here pays for. Right-sizing is the senior skill: every component must buy a stated requirement, and at this scale a simple tier does — save the heavy machinery for the prompt that demands it.`,
        affectedNodeIds: uniqueSorted(excess.map((node) => node.id)),
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

export const scalabilityRules: EvalRule[] = [
  noCacheReadHeavy,
  syncToSlowConsumer,
  sharedDbManyServices,
  unboundedFanout,
  capacityReplicasInsufficient,
  dbWriteBottleneck,
  workerPoolUnderscaled,
  noShardingHotWrites,
  hotPartitionRisk,
  noAutoscaling,
  shardKeyUnnamed,
  overengineeredIntro,
];
