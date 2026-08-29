/**
 * Flash-sale ticketing: what a design must demonstrate to survive an on-sale
 * spike. Intro asks for the load-bearing shapes; standard adds the operating
 * discipline (rate limits, DLQs, admission control); advanced demands the
 * hard guarantees (multi-region, idempotency, partitioning).
 */
import type { CanvasNode } from '@sysdesign/contracts';

import type { GraphIndex } from '../../../graph-index';
import {
  formatInt,
  readsFraction,
  replicasOf,
  sortById,
  SuggestedIds,
} from '../../../rules/shared';
import type { Expectation } from '../types';
import { met, unmet } from '../types';
import {
  declaresIdempotentOps,
  dlqCoverage,
  monitoringPresence,
  suggestDlq,
  suggestMonitoring,
  suggestReadCache,
} from './shared';

const FLASH_SALE = ['flash-sale-ticketing'] as const;

/** Services taking client traffic — the tier that must scale horizontally. */
function clientFacingServices(index: GraphIndex): CanvasNode[] {
  const reachable = index.reachableFrom(index.clients().map((client) => client.id));
  return sortById(index.byKind('service').filter((service) => reachable.has(service.id)));
}

function cachesOnReadPath(index: GraphIndex): CanvasNode[] {
  const clients = index.clients();
  const databases = index.byKind('database');
  return sortById(
    index
      .byKind('cache')
      .filter(
        (cache) =>
          clients.some((client) => index.pathExists(client.id, cache.id)) &&
          databases.some((db) => index.pathExists(cache.id, db.id)),
      ),
  );
}

const edgeFrontDoor: Expectation = {
  id: 'exp.fst.edge-front-door',
  dimension: 'security',
  weight: 2,
  severityIfUnmet: 'high',
  minDifficulty: 'intro',
  archetypes: FLASH_SALE,
  title: 'No protected front door for the on-sale',
  teach: (facts) =>
    `${formatInt(facts.scaleTargets.concurrentUsers)} concurrent users arrive through whatever accepts their connection — today that is raw services, not an edge tier. A gateway or load balancer at the front is where authentication, rate limiting and traffic shedding live; without one, every internal component is the front door.`,
  satisfiedBy: ({ index }) => {
    const edgeTier = sortById([...index.byKind('gateway'), ...index.byKind('load-balancer')]);
    if (edgeTier.length === 0) return unmet(sortById(index.clients()).map((node) => node.id));
    const internals = [
      ...index.byKind('service'),
      ...index.byKind('worker'),
      ...index.byKind('database'),
    ];
    const exposed = sortById(index.clients()).filter((client) =>
      internals.some((internal) =>
        index.pathExists(client.id, internal.id, { avoidKinds: ['gateway', 'load-balancer'] }),
      ),
    );
    if (exposed.length > 0) return unmet(exposed.map((node) => node.id));
    return met(edgeTier.map((node) => node.id));
  },
  suggest: ({ index }) => {
    const client = sortById(index.clients())[0];
    const service = clientFacingServices(index)[0];
    if (!client || !service) return null;
    const ids = new SuggestedIds(index);
    const gatewayId = ids.next('gateway');
    const direct = sortById(
      index.outEdges(client.id).filter((edge) => edge.target === service.id),
    )[0];
    return {
      description: 'Put an API gateway in front so client traffic has one governed entrance.',
      ops: [
        { op: 'add-node', node: { id: gatewayId, kind: 'gateway', label: 'API gateway' } },
        {
          op: 'add-edge',
          edge: {
            id: ids.next('edge-client-gw'),
            source: client.id,
            target: gatewayId,
            kind: 'sync',
          },
        },
        {
          op: 'add-edge',
          edge: {
            id: ids.next('edge-gw-service'),
            source: gatewayId,
            target: service.id,
            kind: 'sync',
          },
        },
        ...(direct ? [{ op: 'remove-edge' as const, edgeId: direct.id }] : []),
      ],
    };
  },
};

const statelessScaleOut: Expectation = {
  id: 'exp.fst.stateless-scale-out',
  dimension: 'scalability',
  weight: 2,
  severityIfUnmet: 'high',
  citesNfrKind: 'throughput',
  minDifficulty: 'intro',
  archetypes: FLASH_SALE,
  title: 'The serving tier cannot scale out',
  teach: (facts) =>
    `Every client-facing service here runs a single instance. The on-sale front-loads ${formatInt(facts.scaleTargets.requestsPerSecond)} req/s into the first minutes — horizontal scale-out (multiple replicas behind a balancer) is the only way the serving tier absorbs that, and it only works when the tier is stateless.`,
  satisfiedBy: ({ index }) => {
    const services = clientFacingServices(index);
    if (services.length === 0) return unmet();
    const single = services.filter((service) => replicasOf(service) < 2);
    if (single.length > 0) return unmet(single.map((node) => node.id));
    return met(services.map((node) => node.id));
  },
  suggest: ({ index }) => {
    const target = clientFacingServices(index).find((service) => replicasOf(service) < 2);
    if (!target) return null;
    return {
      description: 'Run the serving tier at multiple replicas so the spike spreads out.',
      ops: [
        {
          op: 'update-node',
          nodeId: target.id,
          set: { config: { ...target.config, replicas: 3 } },
        },
      ],
    };
  },
};

const dbFailover: Expectation = {
  id: 'exp.fst.db-failover',
  dimension: 'reliability',
  weight: 2,
  severityIfUnmet: 'critical',
  nfrKind: 'availability',
  minDifficulty: 'intro',
  archetypes: FLASH_SALE,
  // Title and patch deliberately match the retired rule's — the canvas flow
  // (click finding → highlight database → preview replica) is unchanged.
  title: 'Single database with no replica',
  teach: (facts) =>
    `The database runs as one instance with no replica while the prompt asks for ${facts.scaleTargets.availabilityPct}% availability — a crash or a maintenance window takes every read and write down with it, mid-on-sale. A replica gives you a failover target and keeps reads alive while the primary recovers.`,
  satisfiedBy: ({ index }) => {
    const databases = sortById(index.byKind('database'));
    if (databases.length === 0) return unmet();
    const fragile = databases.filter(
      (db) =>
        replicasOf(db) <= 1 &&
        !index.neighbors(db.id).some((neighbor) => neighbor.kind === 'replica'),
    );
    if (fragile.length > 0) return unmet(fragile.map((node) => node.id));
    return met(databases.map((node) => node.id));
  },
  suggest: ({ index }) => {
    const db = sortById(index.byKind('database')).find(
      (candidate) =>
        replicasOf(candidate) <= 1 &&
        !index.neighbors(candidate.id).some((neighbor) => neighbor.kind === 'replica'),
    );
    if (!db) return null;
    const ids = new SuggestedIds(index);
    const replicaId = ids.next('replica');
    return {
      description: 'Add a read replica so the database can fail over instead of failing outright.',
      ops: [
        { op: 'add-node', node: { id: replicaId, kind: 'replica', label: 'Read replica' } },
        {
          op: 'add-edge',
          edge: {
            id: ids.next('edge-replication'),
            source: db.id,
            target: replicaId,
            kind: 'async',
          },
        },
      ],
    };
  },
};

const writeSpikeBuffer: Expectation = {
  id: 'exp.fst.write-spike-buffer',
  dimension: 'messaging',
  weight: 2,
  severityIfUnmet: 'critical',
  citesNfrKind: 'throughput',
  minDifficulty: 'intro',
  archetypes: FLASH_SALE,
  title: 'No buffer between the spike and the database',
  teach: (facts) =>
    `A flash sale front-loads demand: ${formatInt(facts.scaleTargets.requestsPerSecond)} req/s arrive in a burst and this design lets that burst hit the database directly. Buffering writes through a queue or event stream lets the system accept the surge instantly and process it at a rate the store survives.`,
  satisfiedBy: ({ index }) => {
    const channels = sortById([...index.byKind('queue'), ...index.byKind('event-stream')]);
    const services = index.byKind('service');
    const databases = index.byKind('database');
    const workers = index.byKind('worker');
    const buffering = channels.filter((channel) => {
      const fedByService = services.some((service) => index.pathExists(service.id, channel.id));
      const drainsToDb = databases.some((db) => index.pathExists(channel.id, db.id));
      const drainsToWorker = workers.some((worker) => index.pathExists(channel.id, worker.id));
      return fedByService && (drainsToDb || drainsToWorker);
    });
    if (buffering.length > 0) return met(buffering.map((node) => node.id));
    return unmet(sortById(databases).map((node) => node.id));
  },
  suggest: ({ index }) => {
    const client = sortById(index.clients())[0];
    const db = sortById(index.byKind('database'))[0];
    const ids = new SuggestedIds(index);
    const serviceBefore = sortById(index.byKind('service')).find(
      (service) =>
        (!client || index.pathExists(client.id, service.id)) &&
        (!db || index.pathExists(service.id, db.id)),
    );
    const source = serviceBefore ?? client;
    if (!source) return null;
    const queueId = ids.next('queue');
    return {
      description:
        'Buffer order writes through a queue so the burst lands on it, not the database.',
      ops: [
        {
          op: 'add-node',
          node: { id: queueId, kind: 'queue', label: 'Order queue', config: { dlq: true } },
        },
        {
          op: 'add-edge',
          edge: { id: ids.next('edge-enqueue'), source: source.id, target: queueId, kind: 'async' },
        },
        ...(db
          ? [
              {
                op: 'add-edge' as const,
                edge: {
                  id: ids.next('edge-dequeue'),
                  source: queueId,
                  target: db.id,
                  kind: 'async' as const,
                },
              },
            ]
          : []),
      ],
    };
  },
};

const asyncWorkerDrain: Expectation = {
  id: 'exp.fst.async-worker-drain',
  dimension: 'reliability',
  weight: 1,
  severityIfUnmet: 'medium',
  minDifficulty: 'intro',
  archetypes: FLASH_SALE,
  title: 'Nothing drains the async work',
  teach: () =>
    'Buffered work needs a consumer: a worker pool draining the queue is what turns "we accepted your order" into "your order exists", at a pace the database tolerates. Without one, the buffer is a place orders go to wait forever.',
  satisfiedBy: ({ index }) => {
    const drains = sortById(index.byKind('queue')).flatMap((queue) =>
      index
        .outEdges(queue.id)
        .filter(
          (edge) => index.edgeKind(edge) === 'async' && index.byId(edge.target)?.kind === 'worker',
        ),
    );
    if (drains.length > 0) {
      return {
        met: true,
        evidenceNodeIds: sortById(
          drains.flatMap((edge) => {
            const worker = index.byId(edge.target);
            return worker ? [worker] : [];
          }),
        ).map((node) => node.id),
        evidenceEdgeIds: drains.map((edge) => edge.id).sort(),
      };
    }
    return unmet(sortById(index.byKind('queue')).map((node) => node.id));
  },
  suggest: ({ index }) => {
    const queue = sortById(index.byKind('queue'))[0];
    if (!queue) return null;
    const ids = new SuggestedIds(index);
    const workerId = ids.next('worker');
    return {
      description: 'Add a worker pool that drains the queue asynchronously.',
      ops: [
        { op: 'add-node', node: { id: workerId, kind: 'worker', label: 'Order worker' } },
        {
          op: 'add-edge',
          edge: { id: ids.next('edge-drain'), source: queue.id, target: workerId, kind: 'async' },
        },
      ],
    };
  },
};

const readCache: Expectation = {
  id: 'exp.fst.read-cache',
  dimension: 'scalability',
  weight: 1.5,
  severityIfUnmet: 'high',
  minDifficulty: 'intro',
  archetypes: FLASH_SALE,
  appliesWhen: (facts) => {
    const fraction = readsFraction(facts.scaleTargets.readWriteRatio);
    return fraction !== null && fraction >= 0.6;
  },
  title: 'Availability reads pound the database',
  teach: (facts) =>
    `The workload is ${facts.scaleTargets.readWriteRatio} reads to writes — mostly fans refreshing availability — and every one of those reads travels to the database, the hardest component to scale. A cache on the read path absorbs the repeats and keeps the p99 ${formatInt(facts.scaleTargets.p99LatencyMs)}ms target survivable.`,
  satisfiedBy: ({ index }) => {
    const caches = cachesOnReadPath(index);
    if (caches.length > 0) return met(caches.map((node) => node.id));
    return unmet(sortById(index.byKind('database')).map((node) => node.id));
  },
  suggest: suggestReadCache,
};

const rateLimitEdge: Expectation = {
  id: 'exp.fst.rate-limit-edge',
  dimension: 'security',
  weight: 1.5,
  severityIfUnmet: 'high',
  minDifficulty: 'standard',
  archetypes: FLASH_SALE,
  title: 'No rate limiting at the edge',
  teach: (facts) =>
    `An on-sale attracts bots and refresh storms beyond the honest ${formatInt(facts.scaleTargets.concurrentUsers)} fans. Rate limiting at the gateway is the difference between shedding abusive traffic at the front door and letting it compete with real buyers for the same database.`,
  satisfiedBy: ({ index }) => {
    const edgeTier = sortById([...index.byKind('gateway'), ...index.byKind('load-balancer')]);
    const limited = edgeTier.filter((node) => node.config?.rateLimit === true);
    if (limited.length > 0) return met(limited.map((node) => node.id));
    return unmet(edgeTier.map((node) => node.id));
  },
  suggest: ({ index }) => {
    const target = sortById([...index.byKind('gateway'), ...index.byKind('load-balancer')])[0];
    if (!target) return null;
    return {
      description: 'Turn on rate limiting at the edge so abuse is shed before it costs anything.',
      ops: [
        {
          op: 'update-node',
          nodeId: target.id,
          set: { config: { ...target.config, rateLimit: true } },
        },
      ],
    };
  },
};

const dlqOnQueues: Expectation = {
  id: 'exp.fst.dlq-on-queues',
  dimension: 'messaging',
  weight: 1,
  severityIfUnmet: 'medium',
  minDifficulty: 'standard',
  archetypes: FLASH_SALE,
  title: 'Failed messages have nowhere to go',
  teach: () =>
    'When an order message fails processing mid-sale, redelivery alone turns one poison message into a stuck queue. A dead-letter queue quarantines failures so the rest of the backlog keeps draining — and gives you a place to replay from once the bug is fixed.',
  satisfiedBy: dlqCoverage,
  suggest: suggestDlq,
};

const lowLatencyReadPath: Expectation = {
  id: 'exp.fst.low-latency-read-path',
  dimension: 'performance',
  weight: 1.5,
  severityIfUnmet: 'high',
  nfrKind: 'latency',
  minDifficulty: 'standard',
  archetypes: FLASH_SALE,
  title: 'Reads ride the write path',
  teach: (facts) =>
    `The prompt holds reads to p99 ≤ ${formatInt(facts.scaleTargets.p99LatencyMs)}ms at peak, but reads here share every hop with writes all the way to the primary. Offload them — a cache, or reads served from a replica — so browse latency stops depending on checkout contention.`,
  satisfiedBy: ({ index }) => {
    const caches = cachesOnReadPath(index);
    if (caches.length > 0) return met(caches.map((node) => node.id));
    const replicaReads = sortById(index.byKind('service')).flatMap((service) =>
      index.outEdges(service.id).filter((edge) => index.byId(edge.target)?.kind === 'replica'),
    );
    if (replicaReads.length > 0) {
      return {
        met: true,
        evidenceNodeIds: sortById(
          replicaReads.flatMap((edge) => {
            const replica = index.byId(edge.target);
            return replica ? [replica] : [];
          }),
        ).map((node) => node.id),
        evidenceEdgeIds: replicaReads.map((edge) => edge.id).sort(),
      };
    }
    return unmet(sortById(index.byKind('database')).map((node) => node.id));
  },
  suggest: suggestReadCache,
};

const cdnStatic: Expectation = {
  id: 'exp.fst.cdn-static',
  dimension: 'performance',
  weight: 1,
  severityIfUnmet: 'medium',
  minDifficulty: 'standard',
  archetypes: FLASH_SALE,
  title: 'Static assets ship from origin',
  teach: (facts) =>
    `Event pages, seat maps and images are identical for all ${formatInt(facts.scaleTargets.concurrentUsers)} fans, yet origin serves every copy. A CDN moves that traffic to the edge, and during the spike the bandwidth it absorbs is capacity your API keeps.`,
  satisfiedBy: ({ index }) => {
    const cdns = sortById(index.byKind('cdn'));
    if (cdns.length > 0) return met(cdns.map((node) => node.id));
    return unmet();
  },
  suggest: ({ index }) => {
    const ids = new SuggestedIds(index);
    const client = sortById(index.clients())[0];
    const cdnId = ids.next('cdn');
    return {
      description: 'Serve static assets from a CDN so origin only handles real API work.',
      ops: [
        { op: 'add-node', node: { id: cdnId, kind: 'cdn', label: 'CDN' } },
        ...(client
          ? [
              {
                op: 'add-edge' as const,
                edge: {
                  id: ids.next('edge-cdn'),
                  source: client.id,
                  target: cdnId,
                  kind: 'sync' as const,
                },
              },
            ]
          : []),
      ],
    };
  },
};

const waitingRoom: Expectation = {
  id: 'exp.fst.waiting-room',
  dimension: 'scalability',
  weight: 1.5,
  severityIfUnmet: 'high',
  minDifficulty: 'standard',
  archetypes: FLASH_SALE,
  title: 'No admission control before checkout',
  teach: (facts) =>
    `When ${formatInt(facts.scaleTargets.concurrentUsers)} people arrive for fewer tickets than that, letting everyone into checkout simultaneously guarantees contention and heartbreak at the worst moment. A waiting room — a queue between the edge and checkout, admitting buyers at a survivable rate — turns the stampede into a line.`,
  satisfiedBy: ({ index }) => {
    const admissions = sortById([
      ...index.byKind('gateway'),
      ...index.byKind('load-balancer'),
    ]).filter((node) => node.config?.admissionControl === true);
    if (admissions.length > 0) return met(admissions.map((node) => node.id));
    const clients = index.clients();
    const services = index.byKind('service');
    const waiting = sortById(index.byKind('queue')).filter(
      (queue) =>
        clients.some((client) => index.pathExists(client.id, queue.id)) &&
        services.some((service) => index.pathExists(queue.id, service.id)),
    );
    if (waiting.length > 0) return met(waiting.map((node) => node.id));
    return unmet(clientFacingServices(index).map((node) => node.id));
  },
  suggest: ({ index }) => {
    const client = sortById(index.clients())[0];
    const service = clientFacingServices(index)[0];
    if (!client || !service) return null;
    const ids = new SuggestedIds(index);
    const queueId = ids.next('queue');
    return {
      description: 'Admit buyers through a waiting room so checkout sees a line, not a stampede.',
      ops: [
        {
          op: 'add-node',
          node: { id: queueId, kind: 'queue', label: 'Waiting room', config: { dlq: true } },
        },
        {
          op: 'add-edge',
          edge: { id: ids.next('edge-admit'), source: client.id, target: queueId, kind: 'async' },
        },
        {
          op: 'add-edge',
          edge: {
            id: ids.next('edge-admitted'),
            source: queueId,
            target: service.id,
            kind: 'async',
          },
        },
      ],
    };
  },
};

const oversellGuard: Expectation = {
  id: 'exp.fst.oversell-guard',
  dimension: 'data',
  weight: 2,
  severityIfUnmet: 'critical',
  nfrKind: 'consistency',
  minDifficulty: 'standard',
  archetypes: FLASH_SALE,
  title: 'Nothing serializes inventory writes',
  teach: () =>
    'Overselling is a write-ordering problem: two buyers, one seat, both writes accepted. Inventory decrements must serialize somewhere — one writer draining a queue, or transactions with strong consistency at the store — and this design never forces that ordering.',
  satisfiedBy: ({ index }) => {
    const databases = sortById(index.byKind('database'));
    if (databases.length === 0) return unmet();
    const guarded = databases.filter((db) => {
      const strong = db.config?.consistency === 'strong';
      const serializedWriter = index.inEdges(db.id).some((edge) => {
        const writer = index.byId(edge.source);
        if (!writer) return false;
        if (writer.kind === 'queue') return true;
        return (
          (writer.kind === 'worker' || writer.kind === 'service') &&
          index.byKind('queue').some((queue) => index.pathExists(queue.id, writer.id))
        );
      });
      return strong || serializedWriter;
    });
    if (guarded.length === databases.length) return met(databases.map((node) => node.id));
    return unmet(databases.filter((db) => !guarded.includes(db)).map((node) => node.id));
  },
};

const orderPipelineObserved: Expectation = {
  id: 'exp.fst.order-pipeline-observed',
  dimension: 'reliability',
  weight: 1,
  severityIfUnmet: 'medium',
  nfrKind: 'observability',
  minDifficulty: 'standard',
  archetypes: FLASH_SALE,
  title: 'The order pipeline runs blind',
  teach: () =>
    'The prompt asks for observability, and during an on-sale the first sign of trouble should be a dashboard, not social media. Put a monitoring block on the pipeline — queue depth, error rate, p99 — so saturation is something you see coming.',
  satisfiedBy: monitoringPresence,
  suggest: (ctx) => suggestMonitoring(ctx, 'Pipeline monitoring'),
};

const paymentIsolation: Expectation = {
  id: 'exp.fst.payment-isolation',
  dimension: 'reliability',
  weight: 1,
  severityIfUnmet: 'medium',
  minDifficulty: 'standard',
  archetypes: FLASH_SALE,
  appliesWhen: (facts) => /purchase|checkout|payment/.test(facts.functionalText),
  title: 'Order finalization blocks on synchronous calls',
  teach: () =>
    'Checkout is the flow that must not die when a downstream dependency slows: finalize orders asynchronously (accept, enqueue, confirm) and never call an external processor synchronously on the request path — its bad minute becomes your outage.',
  satisfiedBy: ({ index }) => {
    const drains = index
      .byKind('queue')
      .flatMap((queue) =>
        index.outEdges(queue.id).filter((edge) => index.byId(edge.target)?.kind === 'worker'),
      );
    const syncExternal = sortById(index.byKind('service')).flatMap((service) =>
      index
        .outEdges(service.id)
        .filter(
          (edge) =>
            index.edgeKind(edge) === 'sync' && index.byId(edge.target)?.kind === 'external-api',
        ),
    );
    if (drains.length > 0 && syncExternal.length === 0) {
      return {
        met: true,
        evidenceNodeIds: sortById(
          drains.flatMap((edge) => {
            const worker = index.byId(edge.target);
            return worker ? [worker] : [];
          }),
        ).map((node) => node.id),
        evidenceEdgeIds: drains.map((edge) => edge.id).sort(),
      };
    }
    if (syncExternal.length > 0) {
      return {
        met: false,
        evidenceNodeIds: sortById(
          syncExternal.flatMap((edge) => {
            const source = index.byId(edge.source);
            return source ? [source] : [];
          }),
        ).map((node) => node.id),
        evidenceEdgeIds: syncExternal.map((edge) => edge.id).sort(),
      };
    }
    return unmet(clientFacingServices(index).map((node) => node.id));
  },
};

const multiRegion: Expectation = {
  id: 'exp.fst.multi-region',
  dimension: 'reliability',
  weight: 2,
  severityIfUnmet: 'critical',
  nfrKind: 'availability',
  minDifficulty: 'advanced',
  archetypes: FLASH_SALE,
  title: 'One region holds the whole on-sale',
  teach: (facts) =>
    `At advanced scale the availability target (${facts.scaleTargets.availabilityPct}%) stops being achievable in one region — a regional outage during the sale window is a total outage. Run the serving tier in at least two regions and decide, explicitly, how the data layer follows.`,
  satisfiedBy: ({ index }) => {
    const placed = [...index.byKind('service'), ...index.byKind('database')];
    const regions = new Set(
      placed
        .map((node) => node.config?.region)
        .filter((region): region is string => typeof region === 'string' && region.length > 0),
    );
    const multiRegionDb = sortById(
      index.byKind('database').filter((db) => db.config?.multiRegion === true),
    );
    if (regions.size >= 2 || multiRegionDb.length > 0) {
      const evidence = sortById(
        placed.filter(
          (node) => typeof node.config?.region === 'string' || node.config?.multiRegion === true,
        ),
      );
      return met(evidence.map((node) => node.id));
    }
    return unmet(sortById(placed).map((node) => node.id));
  },
};

const idempotentCheckout: Expectation = {
  id: 'exp.fst.idempotent-checkout',
  dimension: 'data',
  weight: 2,
  severityIfUnmet: 'critical',
  nfrKind: 'consistency',
  minDifficulty: 'advanced',
  archetypes: FLASH_SALE,
  title: 'Checkout is not idempotent',
  teach: () =>
    'Retry storms, double-clicks and at-least-once delivery all replay checkout. Unless the operation is idempotent — same order key, same single outcome — every replay risks a double charge or a double-sold seat. Mark the checkout path idempotent and enforce it with an idempotency key at the store.',
  satisfiedBy: ({ index }) => {
    const handlers = sortById([...index.byKind('service'), ...index.byKind('worker')]);
    const idempotent = handlers.filter(
      (node) => node.config?.idempotent === true || declaresIdempotentOps(node),
    );
    if (idempotent.length > 0) return met(idempotent.map((node) => node.id));
    return unmet(handlers.map((node) => node.id));
  },
  suggest: ({ index }) => {
    const worker = sortById(index.byKind('worker'))[0] ?? sortById(index.byKind('service'))[0];
    if (!worker) return null;
    return {
      description: 'Make the checkout handler idempotent so replays cannot double-sell.',
      ops: [
        {
          op: 'update-node',
          nodeId: worker.id,
          set: { config: { ...worker.config, idempotent: true } },
        },
      ],
    };
  },
};

const costScaleDown: Expectation = {
  id: 'exp.fst.cost-scale-down',
  dimension: 'scalability',
  weight: 1,
  severityIfUnmet: 'medium',
  nfrKind: 'cost',
  minDifficulty: 'advanced',
  archetypes: FLASH_SALE,
  title: 'Peak capacity runs all year',
  teach: () =>
    'The fleet sized for the biggest on-sale is idle the other 99% of the time, and the prompt caps spend. Autoscale the stateless tiers so capacity follows the sale calendar instead of being provisioned for it permanently.',
  satisfiedBy: ({ index }) => {
    const compute = sortById([...index.byKind('service'), ...index.byKind('worker')]);
    const scaled = compute.filter((node) => node.config?.autoscaling === true);
    if (scaled.length > 0) return met(scaled.map((node) => node.id));
    return unmet(compute.map((node) => node.id));
  },
  suggest: ({ index }) => {
    const target = sortById(index.byKind('service'))[0] ?? sortById(index.byKind('worker'))[0];
    if (!target) return null;
    return {
      description: 'Autoscale the stateless tier so capacity follows demand.',
      ops: [
        {
          op: 'update-node',
          nodeId: target.id,
          set: { config: { ...target.config, autoscaling: true } },
        },
      ],
    };
  },
};

const hotPartitionMitigation: Expectation = {
  id: 'exp.fst.hot-partition-mitigation',
  dimension: 'scalability',
  weight: 1.5,
  severityIfUnmet: 'high',
  minDifficulty: 'advanced',
  archetypes: FLASH_SALE,
  title: 'One hot event melts one partition',
  teach: () =>
    'A flash sale is the definition of a hot key: one event receives the entire write volume. Without partitioning designed around that (sharded inventory, partitioned streams), adding hardware just moves where the single hot partition burns.',
  satisfiedBy: ({ index }) => {
    const shardedDbs = sortById(
      index
        .byKind('database')
        .filter((db) => typeof db.config?.sharding === 'string' && db.config.sharding !== 'none'),
    );
    const partitionedStreams = sortById(
      index
        .byKind('event-stream')
        .filter((stream) => ((stream.config?.partitions as number | undefined) ?? 0) >= 2),
    );
    const evidence = [...shardedDbs, ...partitionedStreams];
    if (evidence.length > 0) return met(evidence.map((node) => node.id));
    return unmet(
      sortById([...index.byKind('database'), ...index.byKind('event-stream')]).map(
        (node) => node.id,
      ),
    );
  },
};

export const flashSaleExpectations: Expectation[] = [
  edgeFrontDoor,
  statelessScaleOut,
  dbFailover,
  writeSpikeBuffer,
  asyncWorkerDrain,
  readCache,
  rateLimitEdge,
  dlqOnQueues,
  lowLatencyReadPath,
  cdnStatic,
  waitingRoom,
  oversellGuard,
  orderPipelineObserved,
  paymentIsolation,
  multiRegion,
  idempotentCheckout,
  costScaleDown,
  hotPartitionMitigation,
];
