/**
 * Realtime analytics: what a design must demonstrate to swallow an event
 * firehose on one side and answer dashboard queries on the other. Intro asks
 * for the load-bearing shapes (a buffered ingest lane, a split read path, an
 * aggregation tier); standard adds rollups, durable buffering, cached tiles
 * and observability; advanced demands exactly-once counts, regional
 * redundancy and tiered retention.
 */
import type { CanvasNode } from '@sysdesign/contracts';

import type { GraphIndex } from '../../../graph-index';
import {
  configNumber,
  formatInt,
  sortById,
  SuggestedIds,
  uniqueSorted,
} from '../../../rules/shared';
import type { Expectation } from '../types';
import { met, unmet } from '../types';
import {
  monitoringPresence,
  onClientReadPath,
  regionSpread,
  suggestMonitoring,
  suggestReadCache,
} from './shared';

const REALTIME_ANALYTICS = ['realtime-analytics'] as const;

/** Where analytics data can durably land after the buffer. */
function storageNodes(index: GraphIndex): CanvasNode[] {
  return sortById([
    ...index.byKind('database'),
    ...index.byKind('data-warehouse'),
    ...index.byKind('data-lake'),
    ...index.byKind('time-series-db'),
  ]);
}

function ingestChannels(index: GraphIndex): CanvasNode[] {
  return sortById([...index.byKind('event-stream'), ...index.byKind('queue')]);
}

const ingestStream: Expectation = {
  id: 'exp.rta.ingest-stream',
  dimension: 'messaging',
  weight: 2,
  severityIfUnmet: 'critical',
  citesNfrKind: 'throughput',
  minDifficulty: 'intro',
  archetypes: REALTIME_ANALYTICS,
  title: 'The firehose writes straight to storage',
  teach: (facts) =>
    `${formatInt(facts.scaleTargets.requestsPerSecond)} events per second arrive whether or not storage is keeping up, and this design gives them nowhere to wait. An event stream between the producers and the stores absorbs the firehose at wire speed and lets every consumer read at its own pace.`,
  satisfiedBy: ({ index }) => {
    const channels = ingestChannels(index);
    const producers = [...index.clients(), ...index.byKind('gateway'), ...index.byKind('service')];
    const stores = storageNodes(index);
    const buffering = channels.filter(
      (channel) =>
        producers.some((producer) => index.pathExists(producer.id, channel.id)) &&
        stores.some((store) => index.pathExists(channel.id, store.id)),
    );
    if (buffering.length > 0) return met(buffering.map((node) => node.id));
    return unmet(stores.map((node) => node.id));
  },
  suggest: ({ index }) => {
    const client = sortById(index.clients())[0];
    const source =
      sortById(index.byKind('service')).find(
        (service) => !client || index.pathExists(client.id, service.id),
      ) ??
      sortById(index.byKind('gateway'))[0] ??
      client;
    if (!source) return null;
    const ids = new SuggestedIds(index);
    const streamId = ids.next('event-stream');
    const db = sortById(index.byKind('database'))[0];
    return {
      description: 'Land events on a stream so ingest absorbs the firehose, not the database.',
      ops: [
        { op: 'add-node', node: { id: streamId, kind: 'event-stream', label: 'Event stream' } },
        {
          op: 'add-edge',
          edge: { id: ids.next('edge-ingest'), source: source.id, target: streamId, kind: 'async' },
        },
        ...(db
          ? [
              {
                op: 'add-edge' as const,
                edge: {
                  id: ids.next('edge-sink'),
                  source: streamId,
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

const readWriteSplit: Expectation = {
  id: 'exp.rta.read-write-split',
  dimension: 'data',
  weight: 2,
  severityIfUnmet: 'high',
  minDifficulty: 'intro',
  archetypes: REALTIME_ANALYTICS,
  title: 'Dashboards query the ingest store',
  teach: (facts) =>
    `Dashboard queries and the ingest firehose land on the same store, and analytical scans are exactly the queries that evict the working set while ${formatInt(facts.scaleTargets.requestsPerSecond)} events/s keep writing. Serve reads from a replica, cache, or purpose-built analytics store so the heaviest tile query cannot stall ingest.`,
  satisfiedBy: ({ index }) => {
    const readSide = onClientReadPath(index, [
      'replica',
      'cache',
      'search-index',
      'data-warehouse',
    ]);
    if (readSide.length > 0) return met(readSide.map((node) => node.id));
    return unmet(sortById(index.byKind('database')).map((node) => node.id));
  },
  suggest: ({ index }) => {
    const db = sortById(index.byKind('database'))[0];
    if (!db) return null;
    const ids = new SuggestedIds(index);
    const client = sortById(index.clients())[0];
    const reader = sortById(index.byKind('service')).find(
      (service) => !client || index.pathExists(client.id, service.id),
    );
    const replicaId = ids.next('replica');
    return {
      description: 'Serve dashboard reads from a replica so queries stop contending with ingest.',
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
        ...(reader
          ? [
              {
                op: 'add-edge' as const,
                edge: {
                  id: ids.next('edge-read'),
                  source: reader.id,
                  target: replicaId,
                  kind: 'sync' as const,
                },
              },
            ]
          : []),
      ],
    };
  },
};

const aggregationWorker: Expectation = {
  id: 'exp.rta.aggregation-worker',
  dimension: 'scalability',
  weight: 1.5,
  severityIfUnmet: 'high',
  minDifficulty: 'intro',
  archetypes: REALTIME_ANALYTICS,
  title: 'Nothing aggregates the raw events',
  teach: () =>
    'Dashboards do not read raw events — they read counts, windows and percentiles, and computing those per query multiplies every tile by the full event volume. A stream processor (or worker pool) consuming the ingest channel keeps aggregates continuously current, so queries read answers instead of recomputing them.',
  satisfiedBy: ({ index }) => {
    const channels = ingestChannels(index);
    const drains = channels.flatMap((channel) =>
      index.outEdges(channel.id).filter((edge) => {
        const kind = index.byId(edge.target)?.kind;
        return kind === 'stream-processor' || kind === 'worker';
      }),
    );
    if (drains.length > 0) {
      return {
        met: true,
        evidenceNodeIds: uniqueSorted(drains.map((edge) => edge.target)),
        evidenceEdgeIds: drains.map((edge) => edge.id).sort(),
      };
    }
    return unmet(channels.map((node) => node.id));
  },
  suggest: ({ index }) => {
    const channel = ingestChannels(index)[0];
    if (!channel) return null;
    const ids = new SuggestedIds(index);
    const processorId = ids.next('stream-processor');
    return {
      description: 'Aggregate the stream continuously so dashboards read answers, not raw events.',
      ops: [
        {
          op: 'add-node',
          node: { id: processorId, kind: 'stream-processor', label: 'Aggregation processor' },
        },
        {
          op: 'add-edge',
          edge: {
            id: ids.next('edge-consume'),
            source: channel.id,
            target: processorId,
            kind: 'async',
          },
        },
      ],
    };
  },
};

const rollupPipeline: Expectation = {
  id: 'exp.rta.rollup-pipeline',
  dimension: 'data',
  weight: 1,
  severityIfUnmet: 'medium',
  minDifficulty: 'standard',
  archetypes: REALTIME_ANALYTICS,
  title: 'No rollup path for historical queries',
  teach: () =>
    'Raw events age into history, and historical dashboards should read pre-computed rollups, not re-scan months of events. Something has to own that computation — a stream processor writing aggregates forward, or a scheduled batch job compacting into a database or warehouse.',
  satisfiedBy: ({ index }) => {
    const engines = sortById([
      ...index.byKind('scheduler'),
      ...index.byKind('batch-job'),
      ...index.byKind('stream-processor'),
    ]);
    const stores = [...index.byKind('database'), ...index.byKind('data-warehouse')];
    const wired = engines.filter((engine) =>
      stores.some((store) => index.pathExists(engine.id, store.id)),
    );
    if (wired.length > 0) return met(wired.map((node) => node.id));
    return unmet(engines.map((node) => node.id));
  },
};

/**
 * Durable buffering as the vocabulary spells it: an event stream declares its
 * replay window via `retentionHours`; a queue is lossy only when explicitly
 * marked `delivery: at-most-once` (brokers default to at-least-once, so an
 * unset knob is not treated as data loss).
 */
const ingestBufferDurable: Expectation = {
  id: 'exp.rta.ingest-buffer-durable',
  dimension: 'data',
  weight: 1.5,
  severityIfUnmet: 'high',
  nfrKind: 'durability',
  minDifficulty: 'standard',
  archetypes: REALTIME_ANALYTICS,
  title: 'The ingest buffer can drop events',
  teach: () =>
    'The prompt demands durability, and the buffer is where events live between arrival and aggregation — if it cannot replay, a crashed consumer means silent gaps in every count downstream. Set retention on the stream (and keep queue delivery at-least-once) so the buffer is a replayable log, not a leaky pipe.',
  satisfiedBy: ({ index }) => {
    const streams = sortById(index.byKind('event-stream'));
    const queues = sortById(index.byKind('queue'));
    if (streams.length === 0 && queues.length === 0) return unmet();
    const lossy = sortById([
      ...streams.filter((stream) => configNumber(stream, 'retentionHours') === undefined),
      ...queues.filter((queue) => queue.config?.delivery === 'at-most-once'),
    ]);
    if (lossy.length > 0) return unmet(lossy.map((node) => node.id));
    return met(sortById([...streams, ...queues]).map((node) => node.id));
  },
  suggest: ({ index }) => {
    const stream = sortById(index.byKind('event-stream')).find(
      (candidate) => configNumber(candidate, 'retentionHours') === undefined,
    );
    if (stream) {
      return {
        description: 'Give the stream a retention window so consumers can replay after a crash.',
        ops: [
          {
            op: 'update-node',
            nodeId: stream.id,
            set: { config: { ...stream.config, retentionHours: 24 } },
          },
        ],
      };
    }
    const queue = sortById(index.byKind('queue')).find(
      (candidate) => candidate.config?.delivery === 'at-most-once',
    );
    if (!queue) return null;
    return {
      description: 'Deliver at least once so a crashed consumer re-reads instead of losing events.',
      ops: [
        {
          op: 'update-node',
          nodeId: queue.id,
          set: { config: { ...queue.config, delivery: 'at-least-once' } },
        },
      ],
    };
  },
};

const dashboardCache: Expectation = {
  id: 'exp.rta.dashboard-cache',
  dimension: 'performance',
  weight: 1.5,
  severityIfUnmet: 'high',
  nfrKind: 'latency',
  minDifficulty: 'standard',
  archetypes: REALTIME_ANALYTICS,
  title: 'Every dashboard tile recomputes on view',
  teach: (facts) =>
    `A dashboard fires a query per tile per refresh, and most tiles show the same answer to everyone watching. With a p99 budget of ${formatInt(facts.scaleTargets.p99LatencyMs)}ms, a cache (or KV store) on the read path serves the repeat views and saves the store for queries that actually changed.`,
  satisfiedBy: ({ index }) => {
    const readSide = onClientReadPath(index, ['cache', 'kv-store']);
    if (readSide.length > 0) return met(readSide.map((node) => node.id));
    return unmet(sortById(index.byKind('database')).map((node) => node.id));
  },
  suggest: suggestReadCache,
};

const pipelineObserved: Expectation = {
  id: 'exp.rta.pipeline-observed',
  dimension: 'reliability',
  weight: 1,
  severityIfUnmet: 'medium',
  nfrKind: 'observability',
  minDifficulty: 'standard',
  archetypes: REALTIME_ANALYTICS,
  title: 'The analytics pipeline runs blind',
  teach: () =>
    'The prompt asks for observability, and an analytics pipeline degrades silently: consumers lag, dashboards quietly show stale numbers, and nobody is paged. A monitoring block watching consumer lag and ingest error rate makes staleness a first-class alert.',
  satisfiedBy: monitoringPresence,
  suggest: (ctx) => suggestMonitoring(ctx, 'Pipeline monitoring'),
};

/**
 * Exactly-once counting as the vocabulary spells it: a stream processor that
 * checkpoints (replay resumes without double-counting), or failing that a
 * consumer tier that is idempotent end-to-end. Only workers carry the
 * idempotent knob, so the fallback reads channel-consuming workers.
 */
const exactlyOnceCounts: Expectation = {
  id: 'exp.rta.exactly-once-counts',
  dimension: 'data',
  weight: 2,
  severityIfUnmet: 'critical',
  nfrKind: 'consistency',
  minDifficulty: 'advanced',
  archetypes: REALTIME_ANALYTICS,
  title: 'Replays double-count events',
  teach: () =>
    'At-least-once delivery means every crash replays events, and replayed events become double-counted metrics unless something de-duplicates. Checkpoint the stream processor — or make every consumer idempotent — so a replay converges on the same counts instead of inflating them.',
  satisfiedBy: ({ index }) => {
    const checkpointed = sortById(
      index.byKind('stream-processor').filter((node) => node.config?.checkpointing === true),
    );
    if (checkpointed.length > 0) return met(checkpointed.map((node) => node.id));
    const channels = ingestChannels(index);
    const consumers = sortById(
      index
        .byKind('worker')
        .filter((worker) =>
          channels.some((channel) =>
            index.outEdges(channel.id).some((edge) => edge.target === worker.id),
          ),
        ),
    );
    if (consumers.length > 0 && consumers.every((worker) => worker.config?.idempotent === true)) {
      return met(consumers.map((node) => node.id));
    }
    return unmet(
      sortById([...index.byKind('stream-processor'), ...consumers]).map((node) => node.id),
    );
  },
  suggest: ({ index }) => {
    const processor = sortById(index.byKind('stream-processor')).find(
      (node) => node.config?.checkpointing !== true,
    );
    if (processor) {
      return {
        description: 'Checkpoint the processor so replays resume instead of double-counting.',
        ops: [
          {
            op: 'update-node',
            nodeId: processor.id,
            set: { config: { ...processor.config, checkpointing: true } },
          },
        ],
      };
    }
    const worker = sortById(index.byKind('worker')).find(
      (node) => node.config?.idempotent !== true,
    );
    if (!worker) return null;
    return {
      description: 'Make the consumer idempotent so replayed events converge on the same counts.',
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

const multiRegionIngest: Expectation = {
  id: 'exp.rta.multi-region-ingest',
  dimension: 'reliability',
  weight: 2,
  severityIfUnmet: 'critical',
  nfrKind: 'availability',
  minDifficulty: 'advanced',
  archetypes: REALTIME_ANALYTICS,
  title: 'One region swallows the whole firehose',
  teach: (facts) =>
    `Events not ingested are gone — there is no retry from the past — so at ${facts.scaleTargets.availabilityPct}% availability the ingest edge cannot live in one region. Take events in from at least two regions and decide explicitly how the aggregate stores converge.`,
  satisfiedBy: (ctx) => regionSpread(ctx.index),
};

const tieredStorage: Expectation = {
  id: 'exp.rta.tiered-storage',
  dimension: 'scalability',
  weight: 1,
  severityIfUnmet: 'medium',
  nfrKind: 'cost',
  minDifficulty: 'advanced',
  archetypes: REALTIME_ANALYTICS,
  title: 'All history lives on the hot tier',
  teach: () =>
    'An event firehose accumulates forever, and the prompt caps spend — keeping every month of history on the serving tier pays hot-storage prices for data nobody queries live. Age events into a lake or warehouse, or bound the time-series store with a retention window, so cost tracks the query pattern.',
  satisfiedBy: ({ index }) => {
    const tiers = sortById([
      ...index.byKind('data-lake'),
      ...index.byKind('data-warehouse'),
      ...index
        .byKind('time-series-db')
        .filter((node) => configNumber(node, 'retentionDays') !== undefined),
    ]);
    if (tiers.length > 0) return met(tiers.map((node) => node.id));
    return unmet(sortById(index.byKind('database')).map((node) => node.id));
  },
  suggest: ({ index }) => {
    const source =
      sortById(index.byKind('event-stream'))[0] ??
      sortById(index.byKind('stream-processor'))[0] ??
      sortById(index.byKind('worker'))[0] ??
      sortById(index.byKind('service'))[0];
    if (!source) return null;
    const ids = new SuggestedIds(index);
    const lakeId = ids.next('data-lake');
    return {
      description: 'Age raw events into a data lake so the hot tier only holds live data.',
      ops: [
        { op: 'add-node', node: { id: lakeId, kind: 'data-lake', label: 'Event archive' } },
        {
          op: 'add-edge',
          edge: { id: ids.next('edge-archive'), source: source.id, target: lakeId, kind: 'async' },
        },
      ],
    };
  },
};

export const realtimeAnalyticsExpectations: Expectation[] = [
  ingestStream,
  readWriteSplit,
  aggregationWorker,
  rollupPipeline,
  ingestBufferDurable,
  dashboardCache,
  pipelineObserved,
  exactlyOnceCounts,
  multiRegionIngest,
  tieredStorage,
];
