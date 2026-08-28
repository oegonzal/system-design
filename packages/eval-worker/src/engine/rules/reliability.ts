/**
 * Reliability: does the design survive the failure of any single box?
 */
import type { GraphPatch, PatchOp } from '@sysdesign/contracts';

import type { EvalRule, RuleFinding } from '../types';
import { formatInt, replicasOf, sortById, SuggestedIds, uniqueSorted } from './shared';

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

export const reliabilityRules: EvalRule[] = [singleDbNoReplica, serviceNoLb, lbSingleTarget];
