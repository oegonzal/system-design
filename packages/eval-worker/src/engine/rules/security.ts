/**
 * Security: is there a trust boundary between untrusted callers and the
 * systems that hold everyone's data?
 */
import type { NodeKind } from '@sysdesign/contracts';

import type { EvalRule, RuleFinding } from '../types';
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
    // The edge tier is the evidence the design has a front door to configure;
    // the lesson applies once the prompt makes abuse worth limiting — a stated
    // security requirement, or enough traffic to invite it.
    const edgeNodes = sortById([...index.byKind('gateway'), ...index.byKind('load-balancer')]);
    if (edgeNodes.length === 0) return [];
    if (!facts.nfrKinds.includes('security') && facts.scaleTargets.requestsPerSecond < 1000) {
      return [];
    }
    if (edgeNodes.some((node) => node.config?.rateLimit === true)) return [];
    return [
      {
        ruleId: noRateLimit.id,
        dimension: 'security',
        severity: 'info',
        title: 'No rate limiting at the edge',
        message: `An internet-facing front door at ${formatInt(facts.scaleTargets.requestsPerSecond)} req/s invites bots and retry storms, and nothing at the edge enforces a rate limit. Limiting per-client request rates at the gateway keeps one aggressive caller from consuming capacity meant for ${formatInt(facts.scaleTargets.concurrentUsers)} real users.`,
        affectedNodeIds: edgeNodes.map((node) => node.id),
        affectedEdgeIds: [],
        suggestion: {
          description:
            "Turn on rate limiting at the edge so one aggressive caller cannot consume everyone else's capacity.",
          ops: [
            {
              op: 'update-node',
              nodeId: edgeNodes[0].id,
              set: { config: { ...(edgeNodes[0].config ?? {}), rateLimit: true } },
            },
          ],
        },
      },
    ];
  },
};

/**
 * What the edge tier must never touch directly. object-store is deliberately
 * absent: cdn → object-store is a legitimate origin pull, the exact shape the
 * media-streaming reference design draws.
 */
const EDGE_FORBIDDEN_TARGETS: readonly NodeKind[] = [
  'database',
  'kv-store',
  'queue',
  'event-stream',
  'cache',
];

const edgeHitsDataLayer: EvalRule = {
  id: 'security.edge-hits-data-layer',
  dimension: 'security',
  check({ index }) {
    const findings: RuleFinding[] = [];
    for (const edge of sortById(index.edges())) {
      const source = index.byId(edge.source);
      const target = index.byId(edge.target);
      if (source?.kind !== 'cdn' && source?.kind !== 'dns') continue;
      if (target === undefined || !EDGE_FORBIDDEN_TARGETS.includes(target.kind)) continue;
      findings.push({
        ruleId: edgeHitsDataLayer.id,
        dimension: 'security',
        severity: 'high',
        title: 'Edge infrastructure reaches into the data layer',
        message: `"${source.label}" connects straight into "${target.label}", exposing a store that trusts its callers to a tier that forwards anyone's request verbatim. The edge serves cached bytes and routes traffic — every data access must pass through a service that authenticates the caller and scopes the query first.`,
        affectedNodeIds: uniqueSorted([edge.source, edge.target]),
        affectedEdgeIds: [edge.id],
        suggestion: null,
      });
    }
    return findings;
  },
};

/**
 * Advanced-only: the standard-tier reference designs run bare gateways with
 * no auth story, and calibration freezes them — at advanced the front door
 * must authenticate or delegate to a component that does.
 */
const gatewayNoAuth: EvalRule = {
  id: 'security.gateway-no-auth',
  dimension: 'security',
  check({ index, facts }) {
    if (facts.difficulty !== 'advanced') return [];
    if (index.hasKind('auth-service')) return [];
    const findings: RuleFinding[] = [];
    for (const gateway of sortById(index.byKind('gateway'))) {
      const authMode = gateway.config?.['authMode'];
      if (authMode !== undefined && authMode !== 'none') continue;
      findings.push({
        ruleId: gatewayNoAuth.id,
        dimension: 'security',
        severity: 'medium',
        title: 'The front door checks nobody',
        message: `"${gateway.label}" terminates every client request and neither validates a credential itself nor hands off to an auth service — so at this tier "who is calling" is a question every downstream service answers alone, or not at all. Authenticate at the gateway (a JWT check is the standard spelling) so identity is established once, at the boundary.`,
        affectedNodeIds: [gateway.id],
        affectedEdgeIds: [],
        suggestion: {
          description: 'Validate tokens at the gateway so identity is checked at the boundary.',
          ops: [
            {
              op: 'update-node',
              nodeId: gateway.id,
              set: { config: { ...(gateway.config ?? {}), authMode: 'jwt' } },
            },
          ],
        },
      });
    }
    return findings;
  },
};

/**
 * Sync only, BY DESIGN: the waiting-room ghost fix wires client → queue as an
 * async admission edge, and that shape — clients waiting their turn — is the
 * lesson other rules teach. What this rule flags is the untrusted producer
 * pushing work synchronously into internal transport.
 */
const clientWritesQueue: EvalRule = {
  id: 'security.client-writes-queue',
  dimension: 'security',
  check({ index }) {
    const findings: RuleFinding[] = [];
    for (const edge of sortById(index.edges())) {
      if (index.edgeKind(edge) !== 'sync') continue;
      const source = index.byId(edge.source);
      const target = index.byId(edge.target);
      if (source?.kind !== 'client' || target?.kind !== 'queue') continue;
      findings.push({
        ruleId: clientWritesQueue.id,
        dimension: 'security',
        severity: 'medium',
        title: 'Untrusted clients produce directly into a queue',
        message: `"${source.label}" pushes work straight into "${target.label}", so anything a client sends — malformed, malicious, or merely infinite — lands on internal transport unauthenticated and unvalidated. A service must front the queue: it authenticates the caller, validates the payload, and decides what deserves to become work.`,
        affectedNodeIds: uniqueSorted([edge.source, edge.target]),
        affectedEdgeIds: [edge.id],
        suggestion: null,
      });
    }
    return findings;
  },
};

const paymentProviderUnguarded: EvalRule = {
  id: 'security.payment-provider-unguarded',
  dimension: 'security',
  check({ index }) {
    const findings: RuleFinding[] = [];
    for (const provider of sortById(index.byKind('payment-provider'))) {
      if (provider.config?.idempotencyKeys === true) continue;
      const callers = sortById(index.inEdges(provider.id));
      if (callers.length === 0) continue;
      findings.push({
        ruleId: paymentProviderUnguarded.id,
        dimension: 'security',
        severity: 'high',
        title: 'Payments retried without idempotency keys',
        message: `Charges flow into "${provider.label}" without idempotency keys, and payments are exactly where retries happen: a timeout after the charge lands means the caller retries a charge that already succeeded, and the customer pays twice. An idempotency key per attempt lets the provider deduplicate, making the retry safe instead of expensive.`,
        affectedNodeIds: uniqueSorted([provider.id, ...callers.map((edge) => edge.source)]),
        affectedEdgeIds: uniqueSorted(callers.map((edge) => edge.id)),
        suggestion: {
          description: 'Send an idempotency key with every charge so retries cannot double-bill.',
          ops: [
            {
              op: 'update-node',
              nodeId: provider.id,
              set: { config: { ...(provider.config ?? {}), idempotencyKeys: true } },
            },
          ],
        },
      });
    }
    return findings;
  },
};

export const securityRules: EvalRule[] = [
  noGateway,
  noRateLimit,
  edgeHitsDataLayer,
  gatewayNoAuth,
  clientWritesQueue,
  paymentProviderUnguarded,
];
