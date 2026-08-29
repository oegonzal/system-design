/**
 * Reliability: does the design survive the failure of any single box?
 */
import type { GraphPatch, PatchOp } from '@sysdesign/contracts';

import type { EvalRule, RuleFinding } from '../types';
import {
  formatInt,
  frontedByEdgeTier,
  replicasOf,
  sortById,
  SuggestedIds,
  uniqueSorted,
} from './shared';

const singleDbNoReplica: EvalRule = {
  id: 'reliability.single-db-no-replica',
  dimension: 'reliability',
  check({ facts, index }) {
    if (!facts.nfrKinds.includes('availability')) return [];
    const findings: RuleFinding[] = [];
    const ids = new SuggestedIds(index);
    for (const db of sortById(index.byKind('database'))) {
      if (replicasOf(db) > 1) continue;
      if (index.neighbors(db.id).some((neighbor) => neighbor.kind === 'replica')) continue;
      const replicaId = ids.next('replica');
      const suggestion: GraphPatch = {
        description:
          'Add a read replica so the database can fail over instead of failing outright.',
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
      findings.push({
        ruleId: singleDbNoReplica.id,
        dimension: 'reliability',
        severity: 'critical',
        title: 'Single database with no replica',
        message: `"${db.label}" runs as one instance with no replica while the prompt asks for ${facts.scaleTargets.availabilityPct}% availability — a crash or a maintenance window takes every read and write down with it. A replica gives you a failover target and keeps reads alive while the primary recovers.`,
        affectedNodeIds: [db.id],
        affectedEdgeIds: [],
        suggestion,
      });
    }
    return findings;
  },
};

const serviceNoLb: EvalRule = {
  id: 'reliability.service-no-lb',
  dimension: 'reliability',
  check({ facts, index }) {
    const clients = sortById(index.clients());
    const services = sortById(index.byKind('service'));
    if (clients.length === 0 || services.length === 0) return [];
    const offenders: Array<{ clientId: string; serviceId: string }> = [];
    for (const client of clients) {
      for (const service of services) {
        // A client→service path that never passes a balancer or gateway means
        // this service takes raw client traffic on a single instance.
        if (index.pathExists(client.id, service.id, { avoidKinds: ['load-balancer', 'gateway'] })) {
          offenders.push({ clientId: client.id, serviceId: service.id });
        }
      }
    }
    if (offenders.length === 0) return [];

    const first = offenders[0];
    const firstClient = index.byId(first.clientId);
    const firstService = index.byId(first.serviceId);
    if (!firstClient || !firstService) return [];
    const directEdges = sortById(
      index.outEdges(first.clientId).filter((edge) => edge.target === first.serviceId),
    );
    const ids = new SuggestedIds(index);
    const lbId = ids.next('load-balancer');
    const ops: PatchOp[] = [
      { op: 'add-node', node: { id: lbId, kind: 'load-balancer', label: 'Load balancer' } },
      {
        op: 'add-edge',
        edge: {
          id: ids.next('edge-client-lb'),
          source: first.clientId,
          target: lbId,
          kind: 'sync',
        },
      },
      {
        op: 'add-edge',
        edge: {
          id: ids.next('edge-lb-service'),
          source: lbId,
          target: first.serviceId,
          kind: 'sync',
        },
      },
    ];
    if (directEdges.length > 0) ops.push({ op: 'remove-edge', edgeId: directEdges[0].id });

    return [
      {
        ruleId: serviceNoLb.id,
        dimension: 'reliability',
        severity: 'high',
        title: 'Client traffic reaches a service with no load balancer',
        message: `Traffic from "${firstClient.label}" reaches "${firstService.label}" with no load balancer or gateway on the path. At ${formatInt(facts.scaleTargets.requestsPerSecond)} req/s that single instance is both the bottleneck and the single point of failure — and until something spreads traffic, adding a second instance changes nothing.`,
        affectedNodeIds: uniqueSorted(offenders.flatMap((o) => [o.clientId, o.serviceId])),
        affectedEdgeIds: directEdges.length > 0 ? [directEdges[0].id] : [],
        suggestion: {
          description:
            'Route client traffic through a load balancer so the service can scale horizontally.',
          ops,
        },
      },
    ];
  },
};

const lbSingleTarget: EvalRule = {
  id: 'reliability.lb-single-target',
  dimension: 'reliability',
  check({ index }) {
    const findings: RuleFinding[] = [];
    for (const lb of sortById(index.byKind('load-balancer'))) {
      const outs = index.outEdges(lb.id);
      if (outs.length !== 1) continue;
      const target = index.byId(outs[0].target);
      if (!target || replicasOf(target) > 1) continue;
      findings.push({
        ruleId: lbSingleTarget.id,
        dimension: 'reliability',
        severity: 'medium',
        title: 'Load balancer fronting a single replica',
        message: `"${lb.label}" fronts exactly one target, and "${target.label}" runs a single replica — the balancer adds a hop without adding capacity or redundancy. Scale the target to multiple replicas (or targets) so there is something to balance across.`,
        affectedNodeIds: uniqueSorted([lb.id, target.id]),
        affectedEdgeIds: [outs[0].id],
        suggestion: null,
      });
    }
    return findings;
  },
};

/**
 * The complement of `service-no-lb`: traffic IS spread through a balancer or
 * gateway, but the tier behind it still runs one instance — the front door is
 * fine, the room behind it is empty.
 */
const singleServiceInstance: EvalRule = {
  id: 'reliability.single-service-instance',
  dimension: 'reliability',
  check({ facts, index }) {
    if (facts.difficulty === 'intro') return [];
    const clients = sortById(index.clients());
    if (clients.length === 0) return [];
    const findings: RuleFinding[] = [];
    for (const service of sortById(index.byKind('service'))) {
      if (replicasOf(service) >= 2) continue;
      if (!frontedByEdgeTier(index, clients, service)) continue;
      findings.push({
        ruleId: singleServiceInstance.id,
        dimension: 'reliability',
        severity: 'medium',
        title: 'Client-facing service runs a single instance',
        message: `"${service.label}" sits behind the edge tier but runs one instance, so the balancer in front of it has exactly one place to send ${formatInt(facts.scaleTargets.requestsPerSecond)} req/s — a deploy or a crash is a full outage, not a blip. Run at least two replicas so the front door has somewhere to fail over to.`,
        affectedNodeIds: [service.id],
        affectedEdgeIds: [],
        suggestion: {
          description: 'Scale the service to multiple replicas so one instance dying is routine.',
          ops: [
            {
              op: 'update-node',
              nodeId: service.id,
              set: { config: { ...(service.config ?? {}), replicas: 3 } },
            },
          ],
        },
      });
    }
    return findings;
  },
};

const replicaNotWired: EvalRule = {
  id: 'reliability.replica-not-wired',
  dimension: 'reliability',
  check({ index }) {
    const findings: RuleFinding[] = [];
    const databases = sortById(index.byKind('database'));
    const ids = new SuggestedIds(index);
    for (const replica of sortById(index.byKind('replica'))) {
      const replicated = index
        .inEdges(replica.id)
        .some(
          (edge) =>
            index.edgeKind(edge) === 'async' && index.byId(edge.source)?.kind === 'database',
        );
      if (replicated) continue;
      const primary = databases[0];
      const suggestion: GraphPatch | null = primary
        ? {
            description:
              'Wire the replica to its primary over async replication so it actually receives data.',
            ops: [
              {
                op: 'add-edge',
                edge: {
                  id: ids.next('edge-replication'),
                  source: primary.id,
                  target: replica.id,
                  kind: 'async',
                },
              },
            ],
          }
        : null;
      findings.push({
        ruleId: replicaNotWired.id,
        dimension: 'reliability',
        severity: 'medium',
        title: 'Replica receives no replication stream',
        message: `"${replica.label}" has no async edge from a database feeding it, so nothing replicates into it — it is a failover target with no data to fail over to. A replica only buys availability once a replication stream from the primary keeps it current.`,
        affectedNodeIds: [replica.id],
        affectedEdgeIds: [],
        suggestion,
      });
    }
    return findings;
  },
};

/**
 * Gateways carry no replicas knob in the canvas vocabulary, so this is a
 * structural lesson reserved for the advanced tier: one gateway node is one
 * front door, and the design should show a second entrance (or a second
 * gateway) before claiming an availability story at that level.
 */
const singleGatewayAdvanced: EvalRule = {
  id: 'reliability.single-gateway-advanced',
  dimension: 'reliability',
  check({ facts, index }) {
    if (facts.difficulty !== 'advanced') return [];
    const gateways = index.byKind('gateway');
    if (gateways.length !== 1 || index.clients().length === 0) return [];
    const gateway = gateways[0];
    return [
      {
        ruleId: singleGatewayAdvanced.id,
        dimension: 'reliability',
        severity: 'medium',
        title: 'One gateway is the only front door',
        message: `Every client request enters through "${gateway.label}" and nothing else — at the ${facts.scaleTargets.availabilityPct}% availability this prompt demands, the front door itself must survive an instance loss. Show the redundancy explicitly: a second gateway (typically per region) so ingress outlives any single box.`,
        affectedNodeIds: [gateway.id],
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

const circuitBreakerMissing: EvalRule = {
  id: 'reliability.circuit-breaker-missing',
  dimension: 'reliability',
  check({ facts, index }) {
    if (facts.difficulty === 'intro') return [];
    const findings: RuleFinding[] = [];
    for (const api of sortById(index.byKind('external-api'))) {
      if (api.config?.circuitBreaker === true) continue;
      const syncCallers = sortById(
        index.inEdges(api.id).filter((edge) => {
          const sourceKind = index.byId(edge.source)?.kind;
          return (
            index.edgeKind(edge) === 'sync' && (sourceKind === 'service' || sourceKind === 'worker')
          );
        }),
      );
      if (syncCallers.length === 0) continue;
      findings.push({
        ruleId: circuitBreakerMissing.id,
        dimension: 'reliability',
        severity: 'medium',
        title: 'Synchronous external call with no circuit breaker',
        message: `"${api.label}" is called synchronously and nothing breaks the circuit when it degrades, so its bad minute becomes your bad minute: callers stack up waiting on a dependency you do not control. A circuit breaker fails fast once the error rate spikes and lets your capacity serve the traffic that can still succeed.`,
        affectedNodeIds: uniqueSorted([api.id, ...syncCallers.map((edge) => edge.source)]),
        affectedEdgeIds: uniqueSorted(syncCallers.map((edge) => edge.id)),
        suggestion: {
          description:
            'Wrap the external dependency in a circuit breaker so its outages fail fast instead of queueing.',
          ops: [
            {
              op: 'update-node',
              nodeId: api.id,
              set: { config: { ...(api.config ?? {}), circuitBreaker: true } },
            },
          ],
        },
      });
    }
    return findings;
  },
};

const deepSyncNoTimeouts: EvalRule = {
  id: 'reliability.deep-sync-no-timeouts',
  dimension: 'reliability',
  check({ facts, index }) {
    if (facts.difficulty !== 'advanced') return [];
    const clients = sortById(index.clients());
    if (clients.length === 0) return [];
    const chain = index.longestChain(
      clients.map((client) => client.id),
      { edgeKinds: ['sync'] },
    );
    if (chain < 4) return [];
    return [
      {
        ruleId: deepSyncNoTimeouts.id,
        dimension: 'reliability',
        severity: 'low',
        title: 'Deep synchronous chain with no timeout budget',
        message: `The longest synchronous request path runs ${chain} hops, and every hop is a place to hang: without an explicit timeout budget, the caller's deadline is the sum of the worst case at every layer. Give each hop a share of the p99 ${formatInt(facts.scaleTargets.p99LatencyMs)}ms budget — timeouts that shrink as the call goes deeper — so a stall fails fast at the layer that owns it.`,
        affectedNodeIds: clients.map((client) => client.id),
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

const schedulerSinglePoint: EvalRule = {
  id: 'reliability.scheduler-single-point',
  dimension: 'reliability',
  check({ facts, index }) {
    if (facts.archetype !== 'workflow-automation' && facts.archetype !== 'dag-orchestration') {
      return [];
    }
    const owners = sortById([...index.byKind('scheduler'), ...index.byKind('workflow-engine')]);
    if (owners.length !== 1 || index.hasKind('distributed-lock')) return [];
    const owner = owners[0];
    return [
      {
        ruleId: schedulerSinglePoint.id,
        dimension: 'reliability',
        severity: 'medium',
        title: 'The tick has a single owner and no leader election',
        message: `"${owner.label}" is the only component that decides what runs next, and nothing on the canvas makes running a standby safe — when it dies, every workflow simply stops firing. A distributed lock gives you leader election: the standby takes the expiring lease and the tick survives the instance.`,
        affectedNodeIds: [owner.id],
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

const queueProducerOverload: EvalRule = {
  id: 'reliability.queue-producer-overload',
  dimension: 'reliability',
  check({ index }) {
    const findings: RuleFinding[] = [];
    for (const queue of sortById(index.byKind('queue'))) {
      const producerIds = uniqueSorted(index.inEdges(queue.id).map((edge) => edge.source));
      const consumerEdges = index.outEdges(queue.id);
      if (producerIds.length < 3 || consumerEdges.length !== 1) continue;
      findings.push({
        ruleId: queueProducerOverload.id,
        dimension: 'reliability',
        severity: 'low',
        title: 'Many producers funnel into one consumer path',
        message: `${producerIds.length} producers feed "${queue.label}" and exactly one consumer edge drains it, so the queue's depth grows at the sum of every producer's rate while draining at one consumer's. That asymmetry is fine in a lull and a runaway backlog in a burst — add consumers (or split the queue) so drain capacity scales with intake.`,
        affectedNodeIds: uniqueSorted([queue.id, ...producerIds]),
        affectedEdgeIds: [consumerEdges[0].id],
        suggestion: null,
      });
    }
    return findings;
  },
};

export const reliabilityRules: EvalRule[] = [
  singleDbNoReplica,
  serviceNoLb,
  lbSingleTarget,
  singleServiceInstance,
  replicaNotWired,
  singleGatewayAdvanced,
  circuitBreakerMissing,
  deepSyncNoTimeouts,
  schedulerSinglePoint,
  queueProducerOverload,
];
