/**
 * Security: is there a trust boundary between untrusted callers and the
 * systems that hold everyone's data?
 */
import type { EvalRule } from '../types';
import { formatInt, sortById, uniqueSorted } from './shared';

const INTERNAL_TARGETS = new Set(['service', 'worker', 'database']);

const noGateway: EvalRule = {
  id: 'security.no-gateway',
  dimension: 'security',
  check({ index }) {
    const offending = sortById(
      index.edges().filter((edge) => {
        const sourceKind = index.byId(edge.source)?.kind;
        const targetKind = index.byId(edge.target)?.kind;
        return (
          sourceKind === 'client' && targetKind !== undefined && INTERNAL_TARGETS.has(targetKind)
        );
      }),
    );
    if (offending.length === 0) return [];
    return [
      {
        ruleId: noGateway.id,
        dimension: 'security',
        severity: 'high',
        title: 'Clients bypass the trust boundary',
        message: `Client traffic lands directly on internal components with no gateway or load balancer in front to authenticate, rate-limit, or shed abusive traffic. That makes every internal component an internet-facing surface that must reimplement edge concerns it should never own.`,
        affectedNodeIds: uniqueSorted(offending.flatMap((edge) => [edge.source, edge.target])),
        affectedEdgeIds: uniqueSorted(offending.map((edge) => edge.id)),
        suggestion: null,
      },
    ];
  },
};

const noRateLimit: EvalRule = {
  id: 'security.no-rate-limit',
  dimension: 'security',
  check({ facts, index }) {
    if (facts.archetype !== 'flash-sale-ticketing') return [];
    const edgeNodes = sortById([...index.byKind('gateway'), ...index.byKind('load-balancer')]);
    if (edgeNodes.some((node) => node.config?.rateLimit === true)) return [];
    return [
      {
        ruleId: noRateLimit.id,
        dimension: 'security',
        severity: 'info',
        title: 'No rate limiting at the edge',
        message: `A flash sale invites bots and retry storms, and nothing at the edge enforces a rate limit. Limiting per-client request rates at the gateway keeps one aggressive buyer from consuming capacity meant for ${formatInt(facts.scaleTargets.concurrentUsers)} real fans.`,
        affectedNodeIds: edgeNodes.map((node) => node.id),
        affectedEdgeIds: [],
        suggestion:
          edgeNodes.length > 0
            ? {
                description:
                  "Turn on rate limiting at the edge so one aggressive buyer cannot consume everyone else's capacity.",
                ops: [
                  {
                    op: 'update-node',
                    nodeId: edgeNodes[0].id,
                    set: { config: { ...(edgeNodes[0].config ?? {}), rateLimit: true } },
                  },
                ],
              }
            : null,
      },
    ];
  },
};

export const securityRules: EvalRule[] = [noGateway, noRateLimit];
