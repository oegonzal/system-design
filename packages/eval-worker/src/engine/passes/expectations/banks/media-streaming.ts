/**
 * Media streaming pipeline: what a design must demonstrate to take uploads
 * in, transcode them off the request path, and deliver playback from the
 * edge. Intro asks for the load-bearing shapes (durable originals, a CDN, an
 * async transcode lane); standard adds the operating discipline (durability
 * ordering, backlog hygiene, cached manifests, observability); advanced
 * demands regional redundancy, release-gate consistency and storage tiering.
 */
import type { CanvasNode } from '@sysdesign/contracts';

import type { GraphIndex } from '../../../graph-index';
import { formatInt, sortById, SuggestedIds, uniqueSorted } from '../../../rules/shared';
import type { Expectation } from '../types';
import { met, unmet } from '../types';
import {
  dlqCoverage,
  monitoringPresence,
  regionSpread,
  suggestDlq,
  suggestMonitoring,
  suggestReadCache,
} from './shared';

const MEDIA_STREAMING = ['media-streaming-pipeline'] as const;

/** The transcode consumers: pooled workers or event-triggered functions. */
function transcodeConsumers(index: GraphIndex): CanvasNode[] {
  return sortById([...index.byKind('worker'), ...index.byKind('serverless-function')]);
}

/** Buffer channels a transcode job can wait in. */
function bufferChannels(index: GraphIndex): CanvasNode[] {
  return sortById([...index.byKind('queue'), ...index.byKind('event-stream')]);
}

function clientReachable(index: GraphIndex): Set<string> {
  return index.reachableFrom(index.clients().map((client) => client.id));
}

const objectStoreOriginals: Expectation = {
  id: 'exp.msp.object-store-originals',
  dimension: 'data',
  weight: 2,
  severityIfUnmet: 'critical',
  minDifficulty: 'intro',
  archetypes: MEDIA_STREAMING,
  title: 'Uploaded originals have no durable home',
  teach: (facts) =>
    `With ${formatInt(facts.scaleTargets.concurrentUsers)} viewers downstream of every upload, the original file is the one artifact you can never re-derive — renditions are disposable, the master is not. Land uploads in an object store on the upload path itself; a service's local disk is not a home for the catalog.`,
  satisfiedBy: ({ index }) => {
    const stores = sortById(index.byKind('object-store'));
    if (stores.length === 0) return unmet();
    const reachable = clientReachable(index);
    const wired = stores.filter((store) => reachable.has(store.id));
    if (wired.length > 0) return met(wired.map((node) => node.id));
    // The store exists but no upload path reaches it — the fix is a wire.
    return unmet(stores.map((node) => node.id));
  },
  suggest: ({ index }) => {
    if (index.byKind('object-store').length > 0) return null;
    const service = sortById(index.byKind('service'))[0];
    if (!service) return null;
    const ids = new SuggestedIds(index);
    const storeId = ids.next('object-store');
    return {
      description: 'Persist uploaded originals in an object store before anything else runs.',
      ops: [
        { op: 'add-node', node: { id: storeId, kind: 'object-store', label: 'Originals bucket' } },
        {
          op: 'add-edge',
          edge: { id: ids.next('edge-upload'), source: service.id, target: storeId, kind: 'sync' },
        },
      ],
    };
  },
};

const cdnDelivery: Expectation = {
  id: 'exp.msp.cdn-delivery',
  dimension: 'performance',
  weight: 2,
  severityIfUnmet: 'critical',
  minDifficulty: 'intro',
  archetypes: MEDIA_STREAMING,
  title: 'Playback streams from origin',
  teach: (facts) =>
    `${formatInt(facts.scaleTargets.concurrentUsers)} concurrent viewers pulling segments from origin turns every popular title into a bandwidth incident. A CDN serves the same bytes from the edge, so origin pays for each rendition roughly once instead of once per viewer.`,
  satisfiedBy: ({ index }) => {
    const cdns = sortById(index.byKind('cdn'));
    if (cdns.length === 0) return unmet(sortById(index.clients()).map((node) => node.id));
    const reachable = clientReachable(index);
    const delivering = cdns.filter((cdn) => reachable.has(cdn.id));
    if (delivering.length > 0) return met(delivering.map((node) => node.id));
    return unmet(cdns.map((node) => node.id));
  },
  suggest: ({ index }) => {
    const client = sortById(index.clients())[0];
    if (!client) return null;
    const ids = new SuggestedIds(index);
    const existing = sortById(index.byKind('cdn'))[0];
    if (existing) {
      return {
        description: 'Wire playback through the CDN so viewers stream from the edge.',
        ops: [
          {
            op: 'add-edge',
            edge: {
              id: ids.next('edge-cdn'),
              source: client.id,
              target: existing.id,
              kind: 'sync',
            },
          },
        ],
      };
    }
    const cdnId = ids.next('cdn');
    return {
      description: 'Serve playback through a CDN so origin only handles what the edge cannot.',
      ops: [
        { op: 'add-node', node: { id: cdnId, kind: 'cdn', label: 'CDN' } },
        {
          op: 'add-edge',
          edge: { id: ids.next('edge-cdn'), source: client.id, target: cdnId, kind: 'sync' },
        },
      ],
    };
  },
};

const asyncTranscode: Expectation = {
  id: 'exp.msp.async-transcode',
  dimension: 'messaging',
  weight: 2,
  severityIfUnmet: 'high',
  minDifficulty: 'intro',
  archetypes: MEDIA_STREAMING,
  title: 'Transcoding rides the upload request',
  teach: () =>
    'Transcoding is minutes of CPU per upload, and the upload request is not the place to spend it. Enqueue the job and let a worker pool (or event-triggered functions) transcode off the request path — the uploader gets an instant acknowledgement and the pipeline absorbs bursts at its own pace.',
  satisfiedBy: ({ index }) => {
    const channels = bufferChannels(index);
    const services = index.byKind('service');
    const consumers = transcodeConsumers(index);
    const lanes = channels.filter(
      (channel) =>
        services.some((service) => index.pathExists(service.id, channel.id)) &&
        consumers.some((consumer) => index.pathExists(channel.id, consumer.id)),
    );
    if (lanes.length > 0) return met(lanes.map((node) => node.id));
    return unmet(sortById(services).map((node) => node.id));
  },
  suggest: ({ index }) => {
    const service = sortById(index.byKind('service'))[0];
    if (!service) return null;
    const ids = new SuggestedIds(index);
    const queueId = ids.next('queue');
    const workerId = ids.next('worker');
    return {
      description: 'Move transcoding behind a queue so uploads acknowledge instantly.',
      ops: [
        {
          op: 'add-node',
          node: { id: queueId, kind: 'queue', label: 'Transcode queue', config: { dlq: true } },
        },
        { op: 'add-node', node: { id: workerId, kind: 'worker', label: 'Transcode worker' } },
        {
          op: 'add-edge',
          edge: {
            id: ids.next('edge-enqueue'),
            source: service.id,
            target: queueId,
            kind: 'async',
          },
        },
        {
          op: 'add-edge',
          edge: { id: ids.next('edge-drain'), source: queueId, target: workerId, kind: 'async' },
        },
      ],
    };
  },
};

const metadataStore: Expectation = {
  id: 'exp.msp.metadata-store',
  dimension: 'data',
  weight: 1,
  severityIfUnmet: 'medium',
  minDifficulty: 'intro',
  archetypes: MEDIA_STREAMING,
  title: 'No metadata store beside the media',
  teach: () =>
    'Titles, renditions, owners and processing state are relational facts, and an object store cannot answer queries about them. Add a metadata database beside the media bytes — "which renditions exist for this title" has to be one indexed lookup, not a bucket listing.',
  satisfiedBy: ({ index }) => {
    const databases = sortById(index.byKind('database'));
    if (databases.length > 0) return met(databases.map((node) => node.id));
    return unmet(sortById(index.byKind('object-store')).map((node) => node.id));
  },
  suggest: ({ index }) => {
    if (index.byKind('database').length > 0) return null;
    const writer = sortById(index.byKind('service'))[0] ?? sortById(index.byKind('worker'))[0];
    if (!writer) return null;
    const ids = new SuggestedIds(index);
    const databaseId = ids.next('database');
    return {
      description: 'Track titles and renditions in a metadata database beside the object store.',
      ops: [
        { op: 'add-node', node: { id: databaseId, kind: 'database', label: 'Metadata DB' } },
        {
          op: 'add-edge',
          edge: {
            id: ids.next('edge-metadata'),
            source: writer.id,
            target: databaseId,
            kind: 'sync',
          },
        },
      ],
    };
  },
};

/**
 * The ordering half of durability: the original must be persisted before (or
 * as) the transcode job is picked up. Two acceptable shapes, kept simple on
 * purpose: the object store feeds the transcode consumer directly (the worker
 * reads the master from the bucket), or the service that writes the store
 * also reaches the consumer — meaning the upload lands durably on the same
 * path that enqueues the job, so a crashed worker re-reads instead of
 * re-asking the uploader.
 */
const durableBeforeTranscode: Expectation = {
  id: 'exp.msp.durable-before-transcode',
  dimension: 'data',
  weight: 1.5,
  severityIfUnmet: 'high',
  nfrKind: 'durability',
  minDifficulty: 'standard',
  archetypes: MEDIA_STREAMING,
  title: 'Transcoding starts before the original is safe',
  teach: () =>
    'The prompt demands durability, and an upload accepted then lost mid-transcode is a broken promise — the uploader already closed the tab. Persist the original to the object store first and let the transcode consumer read from there; a crashed worker then re-reads the master instead of losing the upload.',
  satisfiedBy: ({ index }) => {
    const stores = sortById(index.byKind('object-store'));
    if (stores.length === 0) return unmet();
    const consumers = transcodeConsumers(index);
    const feeding = stores.filter((store) =>
      consumers.some((consumer) => index.pathExists(store.id, consumer.id)),
    );
    if (feeding.length > 0) return met(feeding.map((node) => node.id));
    const writers = sortById(index.byKind('service')).filter((service) =>
      index.outEdges(service.id).some((edge) => index.byId(edge.target)?.kind === 'object-store'),
    );
    const persisted = writers.filter((writer) =>
      consumers.some((consumer) => index.pathExists(writer.id, consumer.id)),
    );
    if (persisted.length > 0) {
      const storeIds = persisted.flatMap((writer) =>
        index
          .outEdges(writer.id)
          .filter((edge) => index.byId(edge.target)?.kind === 'object-store')
          .map((edge) => edge.target),
      );
      return met(uniqueSorted([...persisted.map((writer) => writer.id), ...storeIds]));
    }
    if (consumers.length > 0) return unmet(consumers.map((node) => node.id));
    return unmet(stores.map((node) => node.id));
  },
};

const transcodeBacklogBuffer: Expectation = {
  id: 'exp.msp.transcode-backlog-buffer',
  dimension: 'messaging',
  weight: 1,
  severityIfUnmet: 'medium',
  citesNfrKind: 'throughput',
  minDifficulty: 'standard',
  archetypes: MEDIA_STREAMING,
  title: 'Failed transcode jobs have nowhere to go',
  teach: () =>
    'A poison upload — corrupt container, unsupported codec — will fail transcode forever. Without a dead-letter target it recycles through the queue and stalls every honest job behind it; a DLQ quarantines the failure and keeps renditions flowing.',
  satisfiedBy: dlqCoverage,
  suggest: suggestDlq,
};

const searchBrowseIndex: Expectation = {
  id: 'exp.msp.search-browse-index',
  dimension: 'data',
  weight: 1,
  severityIfUnmet: 'medium',
  minDifficulty: 'standard',
  archetypes: MEDIA_STREAMING,
  appliesWhen: (facts) => facts.functionalText.includes('search'),
  title: 'Catalog search with no search index',
  teach: (facts) =>
    `The requirements call for catalog search, and LIKE-scans against the metadata database are a latency cliff at ${formatInt(facts.scaleTargets.concurrentUsers)} concurrent viewers. A search index answers text queries off the transactional store — browse stays fast no matter what the pipeline is doing.`,
  satisfiedBy: ({ index }) => {
    const indexes = sortById(index.byKind('search-index'));
    if (indexes.length > 0) return met(indexes.map((node) => node.id));
    return unmet(sortById(index.byKind('database')).map((node) => node.id));
  },
  suggest: ({ index }) => {
    const service = sortById(index.byKind('service'))[0];
    if (!service) return null;
    const ids = new SuggestedIds(index);
    const indexId = ids.next('search-index');
    return {
      description: 'Serve catalog search from a search index instead of scanning the database.',
      ops: [
        { op: 'add-node', node: { id: indexId, kind: 'search-index', label: 'Catalog search' } },
        {
          op: 'add-edge',
          edge: { id: ids.next('edge-search'), source: service.id, target: indexId, kind: 'sync' },
        },
      ],
    };
  },
};

const cacheManifests: Expectation = {
  id: 'exp.msp.cache-manifests',
  dimension: 'performance',
  weight: 1,
  severityIfUnmet: 'medium',
  citesNfrKind: 'latency',
  minDifficulty: 'standard',
  archetypes: MEDIA_STREAMING,
  title: 'Every manifest request travels to origin',
  teach: (facts) =>
    `Playback starts with manifests and title metadata that barely change between requests, yet every player refetch travels to the origin stores. A cache or CDN between ${formatInt(facts.scaleTargets.concurrentUsers)} viewers and the stores keeps startup latency inside the p99 ${formatInt(facts.scaleTargets.p99LatencyMs)}ms budget.`,
  satisfiedBy: ({ index }) => {
    const clients = index.clients();
    const origins = [...index.byKind('database'), ...index.byKind('object-store')];
    const shields = sortById([...index.byKind('cache'), ...index.byKind('cdn')]).filter(
      (node) =>
        clients.some((client) => index.pathExists(client.id, node.id)) &&
        origins.some((origin) => index.pathExists(node.id, origin.id)),
    );
    if (shields.length > 0) return met(shields.map((node) => node.id));
    return unmet(sortById(origins).map((node) => node.id));
  },
  suggest: suggestReadCache,
};

const pipelineObserved: Expectation = {
  id: 'exp.msp.pipeline-observed',
  dimension: 'reliability',
  weight: 1,
  severityIfUnmet: 'medium',
  nfrKind: 'observability',
  minDifficulty: 'standard',
  archetypes: MEDIA_STREAMING,
  title: 'The transcode pipeline runs blind',
  teach: () =>
    'The prompt asks for observability, and a transcode pipeline fails quietly — uploads accepted, renditions never appearing. A monitoring block watching queue depth and job failure rate turns a silent backlog into an alert.',
  satisfiedBy: monitoringPresence,
  suggest: (ctx) => suggestMonitoring(ctx, 'Pipeline monitoring'),
};

const multiCdnRegion: Expectation = {
  id: 'exp.msp.multi-cdn-region',
  dimension: 'reliability',
  weight: 2,
  severityIfUnmet: 'critical',
  nfrKind: 'availability',
  minDifficulty: 'advanced',
  archetypes: MEDIA_STREAMING,
  title: 'One region holds all of playback',
  teach: (facts) =>
    `At advanced scale the ${facts.scaleTargets.availabilityPct}% availability target outgrows a single region and a single CDN — a regional outage takes playback down globally. Deliver from at least two CDNs or regions, and decide explicitly how the catalog data follows.`,
  satisfiedBy: (ctx) => {
    const cdns = sortById(ctx.index.byKind('cdn'));
    if (cdns.length >= 2) return met(cdns.map((node) => node.id));
    return regionSpread(ctx.index);
  },
};

/**
 * The release-gate mechanism: a drop must unlock at one strongly consistent
 * control point rather than by trusting caches to expire simultaneously. The
 * vocabulary offers three spellings: a config service (feature flag), a
 * distributed lock, or a KV store configured for strong consistency.
 */
const dropGateConsistency: Expectation = {
  id: 'exp.msp.drop-gate-consistency',
  dimension: 'data',
  weight: 1.5,
  severityIfUnmet: 'high',
  nfrKind: 'consistency',
  minDifficulty: 'advanced',
  archetypes: MEDIA_STREAMING,
  title: 'Nothing gates the release moment',
  teach: () =>
    'A premiere is a consistency problem: the moment a title unlocks must be the same moment for every region and cache. Gate availability on one strongly consistent control point — a config service, a distributed lock, or a strongly consistent KV store — instead of trusting every cache to expire at once.',
  satisfiedBy: ({ index }) => {
    const gates = sortById([
      ...index.byKind('config-service'),
      ...index.byKind('distributed-lock'),
      ...index.byKind('kv-store').filter((node) => node.config?.consistency === 'strong'),
    ]);
    if (gates.length > 0) return met(gates.map((node) => node.id));
    return unmet(sortById(index.byKind('cdn')).map((node) => node.id));
  },
};

/**
 * The vocabulary has no storage-class knob on object-store (only versioning),
 * so tiering is evidenced structurally: an explicit cold tier (data-lake), or
 * an edge shield (CDN/cache in front of the store) that keeps the hot set off
 * origin — the archive/serve split a cost NFR is really asking for.
 */
const storageTiering: Expectation = {
  id: 'exp.msp.storage-tiering',
  dimension: 'scalability',
  weight: 1,
  severityIfUnmet: 'medium',
  nfrKind: 'cost',
  minDifficulty: 'advanced',
  archetypes: MEDIA_STREAMING,
  title: 'The whole library lives on the hot tier',
  teach: () =>
    'The prompt caps spend, and a media library is cold-heavy: most titles stream rarely while a small hot set dominates traffic. Tier the storage — archive cold originals to a data lake and shield the hot set behind the CDN or a cache — so cost follows the access pattern instead of the catalog size.',
  satisfiedBy: ({ index }) => {
    const lakes = sortById(index.byKind('data-lake'));
    if (lakes.length > 0) return met(lakes.map((node) => node.id));
    const stores = index.byKind('object-store');
    const shields = sortById([...index.byKind('cdn'), ...index.byKind('cache')]).filter((shield) =>
      stores.some((store) => index.pathExists(shield.id, store.id)),
    );
    if (shields.length > 0) return met(shields.map((node) => node.id));
    return unmet(sortById(stores).map((node) => node.id));
  },
  suggest: ({ index }) => {
    const store = sortById(index.byKind('object-store'))[0];
    if (!store) return null;
    const ids = new SuggestedIds(index);
    const lakeId = ids.next('data-lake');
    return {
      description: 'Archive cold originals to a data lake so the hot tier only holds the hot set.',
      ops: [
        { op: 'add-node', node: { id: lakeId, kind: 'data-lake', label: 'Cold archive' } },
        {
          op: 'add-edge',
          edge: { id: ids.next('edge-archive'), source: store.id, target: lakeId, kind: 'async' },
        },
      ],
    };
  },
};

export const mediaStreamingExpectations: Expectation[] = [
  objectStoreOriginals,
  cdnDelivery,
  asyncTranscode,
  metadataStore,
  durableBeforeTranscode,
  transcodeBacklogBuffer,
  searchBrowseIndex,
  cacheManifests,
  pipelineObserved,
  multiCdnRegion,
  dropGateConsistency,
  storageTiering,
];
