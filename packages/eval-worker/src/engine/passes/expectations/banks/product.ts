/**
 * The product bank: what a design must do, on a prompt that states its
 * business layer, to earn the product dimension — contracts served, events
 * flowing producer→channel→consumer, ingests wired to their sources,
 * freshness budgets met by declared cadence, aggregates fed and served, and
 * the entity lifecycle covered transition by transition.
 *
 * Every check is a set operation over `judgeWorkflow` verdicts, which are
 * themselves derived from ids, kinds, roles, edges and config — never prose.
 * All expectations gate on `facts.workflow`: a prompt without a spec never
 * assesses the dimension, and on a prompt with one, an author who declares
 * nothing leaves every applicable expectation unmet — silence scores 0, it
 * is never renormalized away.
 */
import type { WorkflowItemVerdict, WorkflowSpec } from '@sysdesign/contracts';
import { transitionItemId } from '@sysdesign/contracts';

import { uniqueSorted } from '../../../rules/shared';
import { declaredPollIntervals } from '../../../rules/shared';
import { freshnessBudgetSeconds } from '../../../targets';
import { judgeGraphWorkflow, verdictById } from '../../../workflows';
import type { Expectation } from '../types';
import { met, unmet } from '../types';
import type { RuleContext } from '../../../types';

const spec = (ctx: RuleContext): WorkflowSpec | null => ctx.facts.workflow;

function verdicts(ctx: RuleContext): Map<string, WorkflowItemVerdict> {
  const report = judgeGraphWorkflow(ctx.index, ctx.facts.workflow);
  return report ? verdictById(report) : new Map();
}

/** "op-list-orders (not-exercised), evt-a (no-consumer)" — the teach channel. */
function describeGaps(items: readonly WorkflowItemVerdict[]): string {
  return items.map((item) => `${item.itemId} (${item.gaps.join(', ') || item.status})`).join(', ');
}

function evidenceOf(items: readonly WorkflowItemVerdict[]): {
  nodes: string[];
  edges: string[];
} {
  return {
    nodes: uniqueSorted(items.flatMap((item) => item.evidenceNodeIds)),
    edges: uniqueSorted(items.flatMap((item) => item.evidenceEdgeIds)),
  };
}

/** All-of check over one item-id list, with the standard met/unmet shapes. */
function allCorroborated(ctx: RuleContext, ids: readonly string[], lesson: string) {
  const map = verdicts(ctx);
  const items = ids.flatMap((id) => map.get(id) ?? []);
  const failing = items.filter((item) => item.status !== 'corroborated');
  if (failing.length === 0 && items.length === ids.length) {
    const { nodes, edges } = evidenceOf(items);
    return met(nodes, edges);
  }
  return unmet([], [], `${lesson} Missing: ${describeGaps(failing)}.`);
}

const queriesServed: Expectation = {
  id: 'exp.prd.queries-served',
  dimension: 'product',
  weight: 2,
  severityIfUnmet: 'high',
  minDifficulty: 'intro',
  archetypes: 'all',
  appliesWhen: (facts) =>
    facts.workflow !== null && facts.workflow.operations.some((op) => op.kind === 'query'),
  title: 'The product’s read contracts are not served',
  teach: () =>
    'The prompt names the queries this product exists to answer. Each needs a component that declares the serving operation (Fulfills links it to the requirement) and a drawn call that exercises it — a box labelled "service" with no contract behind it is a wish, not an API.',
  satisfiedBy: (ctx) =>
    allCorroborated(
      ctx,
      (spec(ctx)?.operations ?? []).filter((op) => op.kind === 'query').map((op) => op.id),
      'Declare a query operation on the serving component, link it with Fulfills, and carry it on the calling edge.',
    ),
};

const commandsAny: Expectation = {
  id: 'exp.prd.commands-any',
  dimension: 'product',
  weight: 1,
  severityIfUnmet: 'medium',
  minDifficulty: 'intro',
  archetypes: 'all',
  appliesWhen: (facts) =>
    facts.workflow !== null &&
    facts.workflow.operations.filter((op) => op.kind === 'command').length >= 2,
  title: 'No write contract is realized at all',
  teach: () =>
    'Start with one: pick the write path the product cannot exist without, declare its command on the owning component, and wire the call or the consuming channel. One honest contract beats zero.',
  satisfiedBy: (ctx) => {
    const map = verdicts(ctx);
    const ids = (spec(ctx)?.operations ?? [])
      .filter((op) => op.kind === 'command')
      .map((op) => op.id);
    const done = ids
      .map((id) => map.get(id))
      .filter((item): item is WorkflowItemVerdict => item?.status === 'corroborated');
    if (done.length > 0) {
      const { nodes, edges } = evidenceOf(done);
      return met(nodes, edges);
    }
    return unmet();
  },
};

const commandsFulfilled: Expectation = {
  id: 'exp.prd.commands-fulfilled',
  dimension: 'product',
  weight: 2,
  severityIfUnmet: 'high',
  minDifficulty: 'intro',
  archetypes: 'all',
  appliesWhen: (facts) =>
    facts.workflow !== null && facts.workflow.operations.some((op) => op.kind === 'command'),
  title: 'Write contracts the design never realizes',
  teach: () =>
    'Every command the prompt states needs an owner: a component declaring the operation, linked by Fulfills, exercised by a drawn call or by consuming from a channel. An unowned command is business logic that happens nowhere.',
  satisfiedBy: (ctx) =>
    allCorroborated(
      ctx,
      (spec(ctx)?.operations ?? []).filter((op) => op.kind === 'command').map((op) => op.id),
      'Give each command an owning component and a drawn path that exercises it.',
    ),
};

const eventsAny: Expectation = {
  id: 'exp.prd.events-any',
  dimension: 'product',
  weight: 1,
  severityIfUnmet: 'medium',
  minDifficulty: 'intro',
  archetypes: 'all',
  appliesWhen: (facts) => facts.workflow !== null && facts.workflow.events.length >= 2,
  title: 'Not one domain event flows end to end',
  teach: () =>
    'Pick the event the product pivots on and make its whole story visible: a producer that declares the emission, a channel that carries it as a message type, and a consumer edge out. One complete event teaches the shape for the rest.',
  satisfiedBy: (ctx) => {
    const map = verdicts(ctx);
    const done = (spec(ctx)?.events ?? [])
      .map((event) => map.get(event.id))
      .filter((item): item is WorkflowItemVerdict => item?.status === 'corroborated');
    if (done.length > 0) {
      const { nodes, edges } = evidenceOf(done);
      return met(nodes, edges);
    }
    return unmet();
  },
};

const eventsFlowing: Expectation = {
  id: 'exp.prd.events-flowing',
  dimension: 'product',
  weight: 2.5,
  severityIfUnmet: 'high',
  minDifficulty: 'intro',
  archetypes: 'all',
  appliesWhen: (facts) => facts.workflow !== null && facts.workflow.events.length > 0,
  title: 'Domain events without a producer→consumer story',
  teach: () =>
    'An event is a promise that something downstream reacts. For each stated event the diagram must show who emits it (a command op declaring the emission), what carries it (a channel message type linked by Fulfills), and who consumes it (a carrying edge out of the channel). Any missing third leaves the promise unkept.',
  satisfiedBy: (ctx) =>
    allCorroborated(
      ctx,
      (spec(ctx)?.events ?? []).map((event) => event.id),
      'Wire each event: emitter → channel message type → consumer.',
    ),
};

const failurePaths: Expectation = {
  id: 'exp.prd.failure-paths',
  dimension: 'product',
  weight: 1.5,
  severityIfUnmet: 'medium',
  minDifficulty: 'intro',
  archetypes: 'all',
  appliesWhen: (facts) =>
    facts.workflow !== null &&
    facts.workflow.operations.some((op) => (op.onFailureEmits ?? []).length > 0),
  title: 'The happy path is designed; the failure path is not',
  teach: () =>
    'The prompt says what happens when this operation FAILS — an event that must land where someone reacts to it. The fulfilling operation should declare that failure emission too, and the event needs the same producer→channel→consumer wiring as any other. Designs that only draw success are the ones that page at 3am.',
  satisfiedBy: (ctx) => {
    const workflow = spec(ctx);
    const map = verdicts(ctx);
    const failing: string[] = [];
    const evidence: WorkflowItemVerdict[] = [];
    for (const op of workflow?.operations ?? []) {
      const failureEvents = op.onFailureEmits ?? [];
      if (failureEvents.length === 0) continue;
      const declared = ctx.graph.nodes.some((node) =>
        (node.operations ?? []).some(
          (candidate) =>
            candidate.fulfills === op.id &&
            failureEvents.every((eventId) => (candidate.emits ?? []).includes(eventId)),
        ),
      );
      const flowing = failureEvents.every((eventId) => map.get(eventId)?.status === 'corroborated');
      if (!declared || !flowing) {
        failing.push(
          `${op.id} (${!declared ? 'failure emission undeclared' : 'failure event not flowing'})`,
        );
      } else {
        evidence.push(...failureEvents.flatMap((eventId) => map.get(eventId) ?? []));
      }
    }
    if (failing.length > 0) {
      return unmet(
        [],
        [],
        `Declare the failure emission on the fulfilling operation and wire the event. Missing: ${failing.join(', ')}.`,
      );
    }
    const { nodes, edges } = evidenceOf(evidence);
    return met(nodes, edges);
  },
};

const ingestPushWired: Expectation = {
  id: 'exp.prd.ingest-push-wired',
  dimension: 'product',
  weight: 1.5,
  severityIfUnmet: 'high',
  minDifficulty: 'intro',
  archetypes: 'all',
  appliesWhen: (facts) =>
    facts.workflow !== null && facts.workflow.ingests.some((ingest) => ingest.mode === 'push'),
  title: 'The pushed source has nowhere to push',
  teach: () =>
    'A webhook source calls YOU: the design needs a receiving component declaring the intake command (Fulfills links it), and an edge from the external system — marked as pushing webhooks — carrying that operation in. Without it, the freshest data the product is promised has no door.',
  satisfiedBy: (ctx) =>
    allCorroborated(
      ctx,
      (spec(ctx)?.ingests ?? []).filter((ingest) => ingest.mode === 'push').map((i) => i.id),
      'Receive the push: external source (webhooks on) → carrying edge → intake command.',
    ),
};

const ingestPullWired: Expectation = {
  id: 'exp.prd.ingest-pull-wired',
  dimension: 'product',
  weight: 1.5,
  severityIfUnmet: 'high',
  minDifficulty: 'intro',
  archetypes: 'all',
  appliesWhen: (facts) =>
    facts.workflow !== null && facts.workflow.ingests.some((ingest) => ingest.mode === 'pull'),
  title: 'The polled source is never polled',
  teach: () =>
    'This source only answers when asked, so the design must show WHO asks and WHAT drives the asking: a component declaring the import command with an edge out to the external system, driven periodically — a batch job by nature, or a scheduler wired into it.',
  satisfiedBy: (ctx) =>
    allCorroborated(
      ctx,
      (spec(ctx)?.ingests ?? []).filter((ingest) => ingest.mode === 'pull').map((i) => i.id),
      'Wire the poll: periodic driver → import command → edge to the external system.',
    ),
};

const freshnessWithinBudget: Expectation = {
  id: 'exp.prd.freshness-within-budget',
  dimension: 'product',
  weight: 2,
  severityIfUnmet: 'high',
  citesNfrKind: 'consistency',
  minDifficulty: 'intro',
  archetypes: 'all',
  appliesWhen: (facts) =>
    facts.workflow !== null &&
    facts.workflow.ingests.some((ingest) =>
      facts.nfrs.some(
        (nfr) =>
          nfr.id === ingest.nfrId &&
          nfr.targetSpec?.metric === 'freshness_seconds' &&
          nfr.targetSpec.op === '<=',
      ),
    ),
  title: 'Freshness promised, cadence unstated or over budget',
  teach: (facts) => {
    const budgets = (facts.workflow?.ingests ?? [])
      .map((ingest) => {
        const nfr = facts.nfrs.find((candidate) => candidate.id === ingest.nfrId);
        return nfr?.targetSpec ? `${ingest.id} ≤ ${nfr.targetSpec.value}s` : null;
      })
      .filter((entry): entry is string => entry !== null)
      .join(', ');
    return `The prompt puts numbers on how stale each source may be (${budgets}). For a polled source that number IS the poll interval: declare pollIntervalSeconds on the poller or its scheduler and keep it inside the budget. For a pushed source, the wiring is the promise — the webhook path must exist.`;
  },
  satisfiedBy: (ctx) => {
    const workflow = spec(ctx);
    const map = verdicts(ctx);
    const failing: string[] = [];
    const evidenceNodes: string[] = [];
    for (const ingest of workflow?.ingests ?? []) {
      const budget = freshnessBudgetSeconds(ctx.facts, ingest);
      if (budget === null) continue;
      const verdict = map.get(ingest.id);
      if (verdict?.status !== 'corroborated') {
        failing.push(`${ingest.id} (${verdict?.gaps.join(', ') || 'not wired'})`);
        continue;
      }
      if (ingest.mode === 'pull') {
        const fulfillers = ctx.graph.nodes.filter((node) =>
          (node.operations ?? []).some((op) => op.fulfills === ingest.id),
        );
        const intervals = fulfillers.flatMap((node) => declaredPollIntervals(ctx.index, node.id));
        if (intervals.length === 0) {
          failing.push(`${ingest.id} (no pollIntervalSeconds declared)`);
          continue;
        }
        const over = intervals.filter((interval) => interval.seconds > budget);
        if (over.length > 0) {
          failing.push(
            `${ingest.id} (${over.map((o) => `${o.seconds}s`).join(', ')} > ${budget}s budget)`,
          );
          continue;
        }
        evidenceNodes.push(...intervals.map((interval) => interval.nodeId));
      }
      evidenceNodes.push(...verdict.evidenceNodeIds);
    }
    if (failing.length > 0) {
      return unmet([], [], `Freshness gaps: ${failing.join('; ')}.`);
    }
    return met(uniqueSorted(evidenceNodes));
  },
};

const aggregationsFed: Expectation = {
  id: 'exp.prd.aggregations-fed',
  dimension: 'product',
  weight: 1.5,
  severityIfUnmet: 'medium',
  minDifficulty: 'intro',
  archetypes: 'all',
  appliesWhen: (facts) => facts.workflow !== null && facts.workflow.aggregations.length > 0,
  title: 'An aggregate with no stream feeding it',
  teach: () =>
    'A total on a dashboard is a claim about every event that ever happened. The design must show the feed — the source events flowing through their channels to something the serving component reads — and the serving query itself. A tile wired to nothing is a number someone will eventually have to explain.',
  satisfiedBy: (ctx) =>
    allCorroborated(
      ctx,
      (spec(ctx)?.aggregations ?? []).map((agg) => agg.id),
      'Feed and serve the aggregate: source events → channel → store the serving query reads.',
    ),
};

const lifecycleCovered: Expectation = {
  id: 'exp.prd.lifecycle-covered',
  dimension: 'product',
  weight: 1,
  severityIfUnmet: 'medium',
  minDifficulty: 'intro',
  archetypes: 'all',
  appliesWhen: (facts) =>
    facts.workflow !== null &&
    facts.workflow.entities.some((entity) => entity.transitions.length > 0),
  title: 'Lifecycle states the design cannot reach',
  teach: () =>
    'The prompt states how the entity moves between states and what moves it. Each transition is covered when the operation, ingest or event that effects it is realized on the canvas — cover them all and the state machine falls out of the design instead of being drawn separately.',
  satisfiedBy: (ctx) => {
    const workflow = spec(ctx);
    const map = verdicts(ctx);
    const failing: string[] = [];
    const evidence: WorkflowItemVerdict[] = [];
    for (const entity of workflow?.entities ?? []) {
      entity.transitions.forEach((transition, index) => {
        const verdict = map.get(transitionItemId(entity.id, index));
        if (verdict?.status === 'corroborated') evidence.push(verdict);
        else failing.push(`${transition.from ?? '·'}→${transition.to} (via ${transition.via})`);
      });
    }
    if (failing.length > 0) {
      return unmet([], [], `Uncovered transitions: ${failing.join(', ')}.`);
    }
    const { nodes, edges } = evidenceOf(evidence);
    return met(nodes, edges);
  },
};

export const productExpectations: Expectation[] = [
  queriesServed,
  commandsAny,
  commandsFulfilled,
  eventsAny,
  eventsFlowing,
  failurePaths,
  ingestPushWired,
  ingestPullWired,
  freshnessWithinBudget,
  aggregationsFed,
  lifecycleCovered,
];
