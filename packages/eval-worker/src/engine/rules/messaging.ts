/**
 * Messaging: are bursts absorbed and consumers decoupled, or is everything a
 * synchronous chain that fails together?
 */
import type { NodeKind, PatchOp } from '@sysdesign/contracts';

import type { EvalRule, RuleFinding } from '../types';
import { formatInt, sortById, SuggestedIds, uniqueSorted } from './shared';

const noQueueForSpike: EvalRule = {
  id: 'messaging.no-queue-for-spike',
  dimension: 'messaging',
  check({ facts, index }) {
    if (facts.archetype !== 'flash-sale-ticketing') return [];
    if (index.hasKind('queue') || index.hasKind('event-stream')) return [];
    const offenders: Array<{ clientId: string; dbId: string }> = [];
    for (const client of sortById(index.clients())) {
      for (const db of sortById(index.byKind('database'))) {
        if (index.pathExists(client.id, db.id)) {
          offenders.push({ clientId: client.id, dbId: db.id });
        }
      }
    }
    if (offenders.length === 0) return [];

    const first = offenders[0];
    const db = index.byId(first.dbId);
    if (!db) return [];
    const ids = new SuggestedIds(index);
    const serviceBefore = sortById(index.byKind('service')).find(
      (service) =>
        index.pathExists(first.clientId, service.id) && index.pathExists(service.id, first.dbId),
    );
    const queueId = ids.next('queue');
    const ops: PatchOp[] = [
      {
        op: 'add-node',
        node: { id: queueId, kind: 'queue', label: 'Order queue', config: { dlq: true } },
      },
    ];
    if (serviceBefore) {
      ops.push(
        {
          op: 'add-edge',
          edge: {
            id: ids.next('edge-enqueue'),
            source: serviceBefore.id,
            target: queueId,
            kind: 'async',
          },
        },
        {
          op: 'add-edge',
          edge: {
            id: ids.next('edge-dequeue'),
            source: queueId,
            target: first.dbId,
            kind: 'async',
          },
        },
      );
    } else {
      ops.push({
        op: 'add-edge',
        edge: {
          id: ids.next('edge-enqueue'),
          source: first.clientId,
          target: queueId,
          kind: 'async',
        },
      });
    }

    return [
      {
        ruleId: noQueueForSpike.id,
        dimension: 'messaging',
        severity: 'critical',
        title: 'No buffer between the spike and the database',
        message: `A flash sale front-loads demand: ${formatInt(facts.scaleTargets.requestsPerSecond)} req/s arrive in a burst, and this design lets that burst hit "${db.label}" directly. Without a queue or event stream to absorb the spike, the database saturates at the exact moment every user shows up. Buffering writes lets the system accept the surge instantly and process it at a rate the store survives.`,
        affectedNodeIds: uniqueSorted(offenders.flatMap((o) => [o.clientId, o.dbId])),
        affectedEdgeIds: [],
        suggestion: {
          description:
            'Absorb the on-sale burst in a queue so the database drains at a rate it survives.',
          ops,
        },
      },
    ];
  },
};

const noEventStreamFanout: EvalRule = {
  id: 'messaging.no-event-stream-fanout',
  dimension: 'messaging',
  check({ index }) {
    if (index.hasKind('event-stream')) return [];
    const findings: RuleFinding[] = [];
    const producers = [...index.byKind('service'), ...index.byKind('worker')];
    for (const producer of sortById(producers)) {
      const syncEdges = index
        .outEdges(producer.id)
        .filter((edge) => index.edgeKind(edge) === 'sync' && index.byId(edge.target) !== undefined);
      const consumerIds = uniqueSorted(syncEdges.map((edge) => edge.target));
      if (consumerIds.length < 3) continue;
      findings.push({
        ruleId: noEventStreamFanout.id,
        dimension: 'messaging',
        severity: 'medium',
        title: 'Point-to-point fan-out with no event stream',
        message: `"${producer.label}" pushes work to ${consumerIds.length} consumers over point-to-point synchronous calls, so adding a consumer means changing the producer and one slow consumer slows them all. An event stream inverts that relationship: publish once, and consumers attach without touching the producer.`,
        affectedNodeIds: uniqueSorted([producer.id, ...consumerIds]),
        affectedEdgeIds: uniqueSorted(syncEdges.map((edge) => edge.id)),
        suggestion: null,
      });
    }
    return findings;
  },
};

const queueNoDlq: EvalRule = {
  id: 'messaging.queue-no-dlq',
  dimension: 'messaging',
  check({ index }) {
    const findings: RuleFinding[] = [];
    for (const queue of sortById(index.byKind('queue'))) {
      if (queue.config?.dlq === true) continue;
      const adjacentQueue = index
        .neighbors(queue.id)
        .some((neighbor) => neighbor.kind === 'queue' && neighbor.id !== queue.id);
      if (adjacentQueue) continue;
      findings.push({
        ruleId: queueNoDlq.id,
        dimension: 'messaging',
        severity: 'low',
        title: 'Queue without a dead-letter queue',
        message: `"${queue.label}" has nowhere to put a message that keeps failing, so one poison message can be retried forever and block everything queued behind it. A dead-letter queue quarantines repeated failures for inspection while the main queue keeps draining.`,
        affectedNodeIds: [queue.id],
        affectedEdgeIds: [],
        suggestion: {
          description:
            'Enable a dead-letter queue so poison messages are quarantined instead of retried forever.',
          ops: [
            {
              op: 'update-node',
              nodeId: queue.id,
              set: { config: { ...(queue.config ?? {}), dlq: true } },
            },
          ],
        },
      });
    }
    return findings;
  },
};

const pubSubSingleSubscriber: EvalRule = {
  id: 'messaging.pub-sub-single-subscriber',
  dimension: 'messaging',
  check({ index }) {
    const findings: RuleFinding[] = [];
    for (const topic of sortById(index.byKind('pub-sub'))) {
      const outs = index.outEdges(topic.id);
      if (outs.length !== 1) continue;
      findings.push({
        ruleId: pubSubSingleSubscriber.id,
        dimension: 'messaging',
        severity: 'info',
        title: 'Pub/sub topic with a single subscriber',
        message: `"${topic.label}" fans out to exactly one subscriber, which is the shape of a queue wearing a topic's costume. A topic pays for fan-out semantics — every subscriber gets every message — and with one consumer that buys nothing a queue does not do better: queues give you competing consumers, per-message acknowledgement, and a natural DLQ story.`,
        affectedNodeIds: [topic.id],
        affectedEdgeIds: [outs[0].id],
        suggestion: null,
      });
    }
    return findings;
  },
};

/** The stores and channels a CDC relay can legitimately feed. */
const CDC_SINK_KINDS: readonly NodeKind[] = [
  'queue',
  'event-stream',
  'search-index',
  'data-warehouse',
  'object-store',
  'kv-store',
];

const cdcDangling: EvalRule = {
  id: 'messaging.cdc-dangling',
  dimension: 'messaging',
  check({ index }) {
    const findings: RuleFinding[] = [];
    for (const connector of sortById(index.byKind('cdc-connector'))) {
      const hasSource = index
        .inEdges(connector.id)
        .some((edge) => index.byId(edge.source)?.kind === 'database');
      const hasSink = index.outEdges(connector.id).some((edge) => {
        const kind = index.byId(edge.target)?.kind;
        return kind !== undefined && CDC_SINK_KINDS.includes(kind);
      });
      if (hasSource && hasSink) continue;
      findings.push({
        ruleId: cdcDangling.id,
        dimension: 'messaging',
        severity: 'medium',
        title: 'CDC connector wired to nothing it can relay',
        message: `"${connector.label}" ${hasSource ? 'reads a commit log but delivers it nowhere — no stream, queue, or derived store consumes what it captures' : 'has no database feeding it, so there is no commit log to capture changes from'}. A CDC relay is a pipe with two mandatory ends: the database whose commits it tails, and the stream or derived store those commits become.`,
        affectedNodeIds: [connector.id],
        affectedEdgeIds: [],
        suggestion: null,
      });
    }
    return findings;
  },
};

const notificationOnRequestPath: EvalRule = {
  id: 'messaging.notification-on-request-path',
  dimension: 'messaging',
  check({ index }) {
    const findings: RuleFinding[] = [];
    for (const edge of sortById(index.edges())) {
      if (index.edgeKind(edge) !== 'sync') continue;
      const source = index.byId(edge.source);
      const target = index.byId(edge.target);
      if (source?.kind !== 'service' || target?.kind !== 'notification-service') continue;
      findings.push({
        ruleId: notificationOnRequestPath.id,
        dimension: 'messaging',
        severity: 'medium',
        title: 'Notifications dispatched on the request path',
        message: `"${source.label}" calls "${target.label}" synchronously, so every request waits on push/email/SMS providers — the flakiest, most rate-limited dependencies in the graph — before it can answer. Nobody's checkout should fail because an email was slow: enqueue the notification and let a consumer dispatch it off the request path.`,
        affectedNodeIds: uniqueSorted([edge.source, edge.target]),
        affectedEdgeIds: [edge.id],
        suggestion: null,
      });
    }
    return findings;
  },
};

const paymentWebhooksDirect: EvalRule = {
  id: 'messaging.payment-webhooks-direct',
  dimension: 'messaging',
  check({ index }) {
    const findings: RuleFinding[] = [];
    for (const provider of sortById(index.byKind('payment-provider'))) {
      if (provider.config?.webhooks !== true) continue;
      const direct = sortById(
        index.outEdges(provider.id).filter((edge) => {
          const kind = index.byId(edge.target)?.kind;
          return kind === 'service' || kind === 'worker';
        }),
      );
      if (direct.length === 0) continue;
      findings.push({
        ruleId: paymentWebhooksDirect.id,
        dimension: 'messaging',
        severity: 'medium',
        title: 'Payment webhooks land directly on compute',
        message: `"${provider.label}" delivers webhooks straight into your handlers with no queue or topic between, so the provider's retry storm after your next deploy arrives as a burst your compute must absorb mid-restart — and every callback missed in that window is a payment state you no longer know about. Land webhooks on a buffer: acknowledge fast, process at your own pace, and replay what the outage missed.`,
        affectedNodeIds: uniqueSorted([provider.id, ...direct.map((edge) => edge.target)]),
        affectedEdgeIds: uniqueSorted(direct.map((edge) => edge.id)),
        suggestion: null,
      });
    }
    return findings;
  },
};

export const messagingRules: EvalRule[] = [
  noQueueForSpike,
  noEventStreamFanout,
  queueNoDlq,
  pubSubSingleSubscriber,
  cdcDangling,
  notificationOnRequestPath,
  paymentWebhooksDirect,
];
