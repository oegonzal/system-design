import {
  DESIGN_BRIEF_VERSION,
  PROMPT_PIPELINE_ID,
  type CanvasGraph,
  type ConfirmedFinding,
  type CriterionEvidence,
  type Decision,
  type DesignBrief,
  type DesignPromptDraft,
  type IterationMode,
  type IterationTrace,
  type RunTrace,
  type Severity,
  type StartQualityRunRequest,
  type SuccessCriterion,
  type ValidationReport,
  type ArtifactLocation,
} from '@sysdesign/contracts';

import type { CoachScript } from './fake-loop-options';

/**
 * Pure builders for the traces the fake loop hands out. Nothing here keeps
 * state: a spec (through `FakeIteration`) or the stub (through the canvas
 * and prompt builders) says what a run looked like, and these turn that into
 * the wire shape the real loop would have recorded.
 */

/** What a spec says one iteration of a finished run looked like. */
export interface FakeIteration {
  overall: number;
  decision?: Decision;
  mode?: IterationMode;
  /** Defaults to the request's own `output` for iteration 1 and null after. */
  artifact?: unknown;
  dimensions?: Record<string, number | null>;
  findings?: ConfirmedFinding[];
  /** Defaults to pass / partial / fail over the request's criteria, by position. */
  criteria?: CriterionEvidence[];
  /** The controller's sentence; 'fake' unless the spec says otherwise. */
  reason?: string;
  locations?: ArtifactLocation[];
  /** A report with a block-gate problem makes the iteration blocked, as the real loop would. */
  validation?: ValidationReport[];
  /**
   * The engine's evidence gate: false when too few criteria were assessed for
   * a verdict — the lenses did not answer — as on a grade during a provider
   * outage. Defaults to true unless a validator blocked the iteration.
   */
  evidenceSufficient?: boolean;
}

const CRITERION_RESULTS = ['pass', 'partial', 'fail'] as const;

const blocked = (validation: readonly ValidationReport[]): string[] =>
  validation
    .filter((report) => report.gate === 'block' && report.problems.length > 0)
    .map((report) => report.validatorId);

/** The fake's default: one revise-worthy iteration with a finding at the second node. */
export const DEFAULT_ITERATIONS = (criteria: readonly SuccessCriterion[]): FakeIteration[] => [
  {
    overall: 64,
    decision: 'revise',
    dimensions: { coverage: 70, quality_attributes: 52, compliance: 100 },
    findings: [
      {
        key: 'unhandled_failure|node.2',
        type: 'unhandled_failure',
        severity: 'high',
        confidence: 'high',
        fixability: 'fixable_local',
        locationRefs: ['node.2'],
        criterionIds: criteria.length > 1 ? ['c2'] : [],
        hits: 2,
        lenses: ['critic.architecture', 'critic.scenarios'],
        rationale: 'a single instance serves every read; a restart drops the target',
        reconciledTo: null,
      },
    ],
  },
];

/** Iteration traces from what a spec said, numbered from `first`. */
export function tracesFrom(
  request: StartQualityRunRequest,
  criteria: readonly SuccessCriterion[],
  specs: readonly FakeIteration[],
  first = 1,
): IterationTrace[] {
  return specs.map((spec, index) => {
    const iteration = first + index;
    const overall = spec.overall;
    const decision = spec.decision ?? (overall >= 75 ? 'accept' : 'revise');
    const validation = spec.validation ?? [];
    const blockers = blocked(validation);
    return {
      iteration,
      mode: spec.mode ?? (iteration === 1 ? 'provided' : 'revise'),
      artifact:
        spec.artifact !== undefined
          ? spec.artifact
          : iteration === 1
            ? (request.output ?? null)
            : null,
      locations: spec.locations ?? [],
      rendered: null,
      validation,
      critics: [],
      evaluators: [],
      ledger: {
        artifactPresent: true,
        validation,
        criteria:
          spec.criteria ??
          criteria.map((criterion, position) => ({
            criterionId: criterion.id,
            kind: criterion.kind,
            result:
              blockers.length > 0
                ? 'unassessed'
                : CRITERION_RESULTS[Math.min(position, CRITERION_RESULTS.length - 1)],
            hits: blockers.length > 0 ? 0 : 2,
            confidence: blockers.length > 0 ? 'none' : 'high',
            locationRefs: [],
          })),
        findings: spec.findings ?? [],
        discarded: [],
        diagnostics: [],
      },
      decision: {
        finalDecision: decision,
        gates: {
          artifactPresent: true,
          validatorsPassed: blockers.length === 0,
          evidenceSufficient: spec.evidenceSufficient ?? blockers.length === 0,
          policyAllowed: true,
        },
        scores: { dimensions: spec.dimensions ?? { coverage: overall }, overall },
        selectedRemediations: [],
        reason:
          blockers.length > 0
            ? `blocked by validator(s) ${blockers.join(', ')} (revised, never restarted)`
            : (spec.reason ?? 'fake'),
        trace: { steps: [], dimensions: [], weightSum: 1, weightedTotal: overall },
      },
      remediations: [],
      durationMs: 0,
    };
  });
}

/** A whole trace over the iterations given: the best is the highest overall, the stop the last decision's. */
export function runTrace(
  pipeline: string,
  version: string,
  goal: string,
  criteria: readonly SuccessCriterion[],
  iterations: readonly IterationTrace[],
): RunTrace {
  let best = 0;
  iterations.forEach((it, index) => {
    if (it.decision.scores.overall > iterations[best].decision.scores.overall) best = index;
  });
  const last = iterations[iterations.length - 1];
  return {
    pipeline: { id: pipeline, version },
    contract: { goal, criteria: [...criteria] },
    iterations: [...iterations],
    bestIteration: best + 1,
    finalDecision: last.decision.finalDecision,
    stopReason: last.decision.finalDecision === 'accept' ? 'accepted' : 'max-iterations',
    lessons: [],
  };
}

// ---- the canvas pipeline: a grade that is a function of the drawing -------

/** The graph inside a submission, when the output is one. */
function graphOf(output: unknown): CanvasGraph | null {
  if (!output || typeof output !== 'object' || !('graph' in output)) return null;
  const graph = (output as { graph: unknown }).graph;
  if (!graph || typeof graph !== 'object') return null;
  const { nodes, edges } = graph as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return null;
  return graph as CanvasGraph;
}

/** Three boxes score 64, four 72, five 80 (accepted); nothing beats 95. */
const canvasOverall = (graph: CanvasGraph | null): number =>
  Math.min(95, 40 + 8 * (graph?.nodes.length ?? 0));

const decide = (overall: number): Decision => (overall >= 80 ? 'accept' : 'revise');

function finding(
  type: string,
  severity: Severity,
  locationRefs: string[],
  criterionIds: string[],
  lenses: string[],
  rationale: string,
): ConfirmedFinding {
  return {
    key: `${type}|${[...locationRefs].sort().join(',')}`,
    type,
    severity,
    confidence: 'high',
    fixability: 'fixable_local',
    locationRefs,
    criterionIds,
    hits: 2,
    lenses,
    rationale,
    reconciledTo: null,
  };
}

/**
 * What the lenses "find": a small drawing has an unhandled failure at its
 * last component (the database, in the classic sketch), and any connection
 * at all is a claim nothing backs. Positional refs — `node.N`, `edge.N` —
 * exactly as the canvas pipeline cites them; the studio resolves them back
 * to the author's ids.
 */
function canvasFindings(
  graph: CanvasGraph | null,
  criteria: readonly SuccessCriterion[],
): ConfirmedFinding[] {
  const found: ConfirmedFinding[] = [];
  const nodes = graph?.nodes.length ?? 0;
  const edges = graph?.edges.length ?? 0;
  if (nodes > 0 && nodes < 5) {
    found.push(
      finding(
        'unhandled_failure',
        'high',
        [`node.${nodes}`],
        criteria.some((criterion) => criterion.id === 'c2') ? ['c2'] : [],
        ['critic.architecture', 'critic.scenarios'],
        'a single instance serves every read; a restart drops the target',
      ),
    );
  }
  if (edges > 0) {
    found.push(
      finding(
        'unbacked_claim',
        'medium',
        ['edge.1'],
        [],
        ['critic.explanation', 'evaluator.coverage'],
        'the first connection carries no declared operation, so nothing checks what it promises',
      ),
    );
  }
  return found;
}

/** `c1` passes, the rest are partial: a rubric row per criterion the run was given. */
const criteriaRows = (criteria: readonly SuccessCriterion[]): CriterionEvidence[] =>
  criteria.map((criterion, position) => ({
    criterionId: criterion.id,
    kind: criterion.kind,
    result: position === 0 ? 'pass' : 'partial',
    hits: 2,
    confidence: 'high',
    locationRefs: [],
  }));

function iterationTrace(
  iteration: number,
  mode: IterationMode,
  artifact: unknown,
  criteria: readonly SuccessCriterion[],
  overall: number,
  decision: Decision,
  dimensions: Record<string, number | null>,
  findings: ConfirmedFinding[],
  reason: string,
): IterationTrace {
  return {
    iteration,
    mode,
    artifact,
    locations: [],
    rendered: null,
    validation: [],
    critics: [],
    evaluators: [],
    ledger: {
      artifactPresent: true,
      validation: [],
      criteria: criteriaRows(criteria),
      findings,
      discarded: [],
      diagnostics: [],
    },
    decision: {
      finalDecision: decision,
      gates: {
        artifactPresent: true,
        validatorsPassed: true,
        evidenceSufficient: true,
        policyAllowed: true,
      },
      scores: { dimensions, overall },
      selectedRemediations: [],
      reason,
      trace: { steps: [], dimensions: [], weightSum: 1, weightedTotal: overall },
    },
    remediations: [],
    durationMs: 0,
  };
}

/** An id no element of the graph already uses — `ai-replica`, or `ai-replica-2` on a re-coached design. */
function freshId(base: string, taken: readonly { id: string }[]): string {
  let candidate = base;
  for (let n = 2; taken.some((item) => item.id === candidate); n += 1) candidate = `${base}-${n}`;
  return candidate;
}

/**
 * The script's claims on a submission's brief: the author's binding for each
 * criterion keeps its components and takes the coach's words; a criterion
 * the author left unbound is held by `holder`.
 */
function withClaims(
  brief: DesignBrief | null | undefined,
  claims: Readonly<Record<string, string>>,
  holder: string,
): DesignBrief | null {
  const bindings = [...(brief?.bindings ?? [])];
  for (const [criterionId, claim] of Object.entries(claims)) {
    const at = bindings.findIndex((binding) => binding.criterionId === criterionId);
    if (at >= 0) bindings[at] = { ...bindings[at], claim };
    else bindings.push({ criterionId, nodeIds: [holder], claim });
  }
  return { version: DESIGN_BRIEF_VERSION, bindings };
}

/**
 * The coach's one idea: a read replica hung off the last component, ids
 * prefixed `ai-` as the schema asks — and, when a scenario scripts it, the
 * claims it writes in its own words.
 */
function revised(output: unknown, coach: CoachScript = {}): unknown {
  const graph = graphOf(output);
  if (!graph) return output;
  const last = graph.nodes[graph.nodes.length - 1];
  const replicaId = freshId('ai-replica', graph.nodes);
  const nodes = [...graph.nodes, { id: replicaId, kind: 'replica', label: 'Read replica' }];
  const edges = last
    ? [
        ...graph.edges,
        {
          id: freshId('ai-e-replica', graph.edges),
          source: last.id,
          target: replicaId,
          kind: 'async',
        },
      ]
    : graph.edges;
  const revision = { ...(output as object), graph: { nodes, edges } };
  if (coach.claims === undefined) return revision;
  const { brief } = output as { brief?: DesignBrief | null };
  return { ...revision, brief: withClaims(brief, coach.claims, replicaId) };
}

function canvasIteration(
  iteration: number,
  mode: IterationMode,
  artifact: unknown,
  criteria: readonly SuccessCriterion[],
  overall: number,
): IterationTrace {
  const graph = graphOf(artifact);
  return iterationTrace(
    iteration,
    mode,
    artifact,
    criteria,
    overall,
    decide(overall),
    { coverage: overall, quality_attributes: Math.max(0, overall - 12), compliance: 100 },
    canvasFindings(graph, criteria),
    `stub: ${graph?.nodes.length ?? 0} nodes → ${overall}`,
  );
}

/**
 * Iteration 1 grades the submission as provided — or is the adopted
 * iteration, copied. Given room to iterate, the coach revises once —
 * strictly better by eight points — and every later iteration repeats that
 * revision without beating it, so a spec can see "imported" and "not
 * better" side by side. The loop stops at the first accepted iteration, as
 * the real runner does.
 */
function canvasIterations(
  request: StartQualityRunRequest,
  criteria: readonly SuccessCriterion[],
  adopted: IterationTrace | null = null,
  coach: CoachScript = {},
): IterationTrace[] {
  const first =
    adopted === null
      ? canvasIteration(
          1,
          'provided',
          request.output,
          criteria,
          canvasOverall(graphOf(request.output)),
        )
      : { ...structuredClone(adopted), iteration: 1, mode: 'adopted' as const };
  const iterations = [first];
  const budget = request.maxIterations ?? 1;
  if (first.decision.finalDecision === 'accept') return iterations;

  const artifact = revised(first.artifact, coach);
  const overall = Math.min(100, first.decision.scores.overall + 8);
  for (let iteration = 2; iteration <= budget; iteration += 1) {
    const next = canvasIteration(iteration, 'revise', artifact, criteria, overall);
    iterations.push(next);
    if (next.decision.finalDecision === 'accept') break;
  }
  return iterations;
}

// ---- the prompt pipeline: a draft from the goal's own title ---------------

/** The goal's first `# heading`, or a neutral fallback when it has none. */
function firstHeading(goal: string): string {
  const match = /^#\s+(.+)$/m.exec(goal);
  return (match?.[1] ?? 'Design a resilient service').trim().slice(0, 120);
}

/** A draft that satisfies `designPromptDraftSchema`, brand-neutral, one per goal title. */
function draftFromGoal(goal: string): DesignPromptDraft {
  const title = firstHeading(goal);
  return {
    title,
    scenario: `You own the platform behind "${title}". Traffic arrives in bursts and the team needs a design that survives them without losing a write.`,
    functionalRequirements: [
      'Serve the primary read path with data no older than the last committed write.',
      'Accept writes during a burst without dropping any.',
    ],
    nonFunctionalRequirements: [
      { kind: 'latency', requirement: 'primary reads', target: 'p99 ≤ 300 ms' },
      { kind: 'availability', requirement: 'the write path', target: '99.9% monthly' },
    ],
    scale: [{ metric: 'peak request rate', target: '4,000 requests/s' }],
    constraints: ['One relational database is the system of record.'],
  };
}

function promptIterations(
  request: StartQualityRunRequest,
  criteria: readonly SuccessCriterion[],
): IterationTrace[] {
  return [
    iterationTrace(
      1,
      'initial',
      draftFromGoal(request.goal),
      criteria,
      88,
      'accept',
      { fidelity: 90, clarity: 86, difficulty: 88 },
      [],
      'stub: drafted from the goal title',
    ),
  ];
}

/** The iterations the loop would have produced for this request, by pipeline, with nothing scripted but what its coach writes. */
export const autoIterations = (
  request: StartQualityRunRequest,
  criteria: readonly SuccessCriterion[],
  adopted: IterationTrace | null,
  coach: CoachScript = {},
): IterationTrace[] =>
  request.pipeline === PROMPT_PIPELINE_ID
    ? promptIterations(request, criteria)
    : canvasIterations(request, criteria, adopted, coach);
