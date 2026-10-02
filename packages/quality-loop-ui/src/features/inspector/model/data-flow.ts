import type { Decision, OrchestrationStepStatus, QualityRunDto } from '@sysdesign/contracts';

import type { InspectorState, StepState } from './state';

/**
 * An orchestration as a column of steps, with the edges the record proves.
 *
 * What is drawn is deliberately less than the whole graph. An orchestrator
 * declares a `needs` relation between its steps, and that declaration is not on
 * the wire — the record carries the step ledger, not the orchestrator's data.
 * What the record *does* prove is a block: a step skipped for `upstream-failed`
 * or `upstream-skipped` records the id of the step that blocked it, exactly.
 * Those edges are real; the rest would be invention, so the view says the graph
 * is partial rather than drawing a plausible one.
 *
 * The flow a reader actually asks about is visible without the graph anyway: a
 * step publishes a report, the steps after it read from what was published, and
 * the children a step opened are listed as it opens them.
 */

/** A skip whose reason names the step that blocked it — the only edge the record proves. */
export interface FlowEdge {
  from: string;
  to: string;
  reason: 'upstream-failed' | 'upstream-skipped';
}

const BLOCKING_REASONS: readonly string[] = ['upstream-failed', 'upstream-skipped'];

export interface ChildSummary {
  runId: string;
  /** Null until the child's own record has been read. */
  pipeline: string | null;
  status: QualityRunDto['status'] | null;
  finalDecision: Decision | null;
  overall: number | null;
  iterations: number | null;
  /** True when this child has not been fetched, so only its id is known. */
  unread: boolean;
}

export interface FlowStep extends StepState {
  /** Position in the orchestrator's declared order, as the record lists them. */
  order: number;
  children: ChildSummary[];
  /** The step that blocked this one, when the record names one. */
  blockedBy: string | null;
  /** The steps this one blocked. */
  blocked: string[];
  /** What this step published for the steps after it to read. Null when it reported nothing. */
  published: Record<string, unknown> | null;
}

export interface DataFlow {
  orchestrator: string | null;
  /** The target pipeline the request named, when the orchestrator takes one. */
  pipeline: string | null;
  steps: FlowStep[];
  edges: FlowEdge[];
  /**
   * Always true: the orchestrator's declared `needs` graph is not published, so
   * only blocks the record proves are drawn.
   */
  partial: boolean;
}

const childOf = (runId: string, run: QualityRunDto | undefined): ChildSummary => {
  if (run === undefined) {
    return {
      runId,
      pipeline: null,
      status: null,
      finalDecision: null,
      overall: null,
      iterations: null,
      unread: true,
    };
  }
  const best = run.trace?.iterations.find(
    (iteration) => iteration.iteration === run.trace?.bestIteration,
  );
  return {
    runId,
    pipeline: run.pipeline,
    status: run.status,
    finalDecision: run.trace?.finalDecision ?? null,
    overall: best?.decision.scores.overall ?? null,
    iterations: run.trace?.iterations.length ?? null,
    unread: false,
  };
};

/** The step column and its proven edges, from the state and whatever children have been read. */
export function dataFlow(
  state: InspectorState,
  children: Readonly<Record<string, QualityRunDto>>,
): DataFlow {
  const orchestration = state.orchestration;
  const steps = Object.values(orchestration?.steps ?? {});
  const edges: FlowEdge[] = steps.flatMap((step) =>
    step.reason !== null && BLOCKING_REASONS.includes(step.reason) && step.note !== null
      ? [{ from: step.note, to: step.stepId, reason: step.reason as FlowEdge['reason'] }]
      : [],
  );
  return {
    orchestrator: orchestration?.orchestrator ?? null,
    pipeline: orchestration?.pipeline ?? null,
    partial: true,
    edges,
    steps: steps.map((step, order) => ({
      ...step,
      order,
      children: step.runIds.map((runId) => childOf(runId, children[runId])),
      blockedBy: edges.find((edge) => edge.to === step.stepId)?.from ?? null,
      blocked: edges.filter((edge) => edge.from === step.stepId).map((edge) => edge.to),
      published: step.report,
    })),
  };
}

export interface FlowTotals {
  steps: number;
  children: number;
  unread: number;
  byStatus: Record<OrchestrationStepStatus, number>;
}

export const flowTotals = (flow: DataFlow): FlowTotals => {
  const byStatus: Record<OrchestrationStepStatus, number> = {
    pending: 0,
    running: 0,
    complete: 0,
    skipped: 0,
    failed: 0,
  };
  for (const step of flow.steps) byStatus[step.status] += 1;
  const children = flow.steps.flatMap((step) => step.children);
  return {
    steps: flow.steps.length,
    children: children.length,
    unread: children.filter((child) => child.unread).length,
    byStatus,
  };
};

/**
 * Which child runs are worth reading, and in what order. The one being inspected
 * comes first because it is the one a reader is waiting on; the rest follow in
 * the order their steps opened them, bounded so an orchestration of many samples
 * cannot turn one page into a hundred requests.
 */
export const MAX_CHILDREN_READ = 12;

export function childrenToRead(
  flow: DataFlow,
  selectedRunId: string | null,
  max = MAX_CHILDREN_READ,
): string[] {
  const all = flow.steps.flatMap((step) => step.runIds);
  const ordered =
    selectedRunId !== null && all.includes(selectedRunId)
      ? [selectedRunId, ...all.filter((runId) => runId !== selectedRunId)]
      : all;
  return ordered.slice(0, max);
}
