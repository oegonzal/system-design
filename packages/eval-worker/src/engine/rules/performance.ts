/**
 * Performance: latency the user feels, beyond raw capacity.
 */
import type { EvalRule, RuleFinding } from '../types';
import { formatInt, sortById, uniqueSorted } from './shared';

const noCdnStatic: EvalRule = {
  id: 'performance.no-cdn-static',
  dimension: 'performance',
  check({ facts, index }) {
    if (index.hasKind('cdn')) return [];
    const objectStores = sortById(index.byKind('object-store'));
    if (facts.archetype !== 'media-streaming-pipeline' && objectStores.length === 0) return [];
    return [
      {
        ruleId: noCdnStatic.id,
        dimension: 'performance',
        severity: 'medium',
        title: 'Static content served without a CDN',
        message: `Static and media bytes are served from origin on every request, so each of ${formatInt(facts.scaleTargets.concurrentUsers)} concurrent users pays a full round trip for content that never changes. A CDN moves those bytes to the edge and takes that traffic off the origin entirely.`,
        affectedNodeIds: objectStores.map((store) => store.id),
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

const chattyClient: EvalRule = {
  id: 'performance.chatty-client',
  dimension: 'performance',
  check({ index }) {
    if (index.hasKind('gateway')) return [];
    const findings: RuleFinding[] = [];
    for (const client of sortById(index.clients())) {
      const serviceEdges = index
        .outEdges(client.id)
        .filter((edge) => index.byId(edge.target)?.kind === 'service');
      const serviceIds = uniqueSorted(serviceEdges.map((edge) => edge.target));
      if (serviceIds.length < 3) continue;
      findings.push({
        ruleId: chattyClient.id,
        dimension: 'performance',
        severity: 'low',
        title: 'Chatty client with no gateway',
        message: `"${client.label}" calls ${serviceIds.length} services directly, so every page load pays ${serviceIds.length} round trips and every service must handle auth, CORS, and versioning on its own. A gateway gives clients one front door and one place to aggregate.`,
        affectedNodeIds: uniqueSorted([client.id, ...serviceIds]),
        affectedEdgeIds: uniqueSorted(serviceEdges.map((edge) => edge.id)),
        suggestion: null,
      });
    }
    return findings;
  },
};

export const performanceRules: EvalRule[] = [noCdnStatic, chattyClient];
