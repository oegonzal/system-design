import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import {
  CANVAS_PIPELINE_ID,
  PROMPT_PIPELINE_ID,
  type CanvasGraph,
  type ConfirmedFinding,
  type CriterionEvidence,
  type Decision,
  type DesignPromptDraft,
  type IterationTrace,
  type LlmAvailabilityDto,
  type LlmExchangeSummaryDto,
  type ProduceMode,
  type QualityRunDto,
  type Severity,
  type StartQualityRunRequest,
  type SuccessCriterion,
} from '@sysdesign/contracts';

import { LIBRARY } from './library-fixtures';

/**
 * The quality loop, stubbed over HTTP for the e2e suite.
 *
 * The studio API reaches its grader through `QUALITY_LOOP_URL`, so the suite
 * points that at this process instead of the real service: every route the
 * studio's client calls answers here with the same envelopes, and a run
 * completes on its own a moment after it starts with a trace that is a pure
 * function of the request — no model, no network, no database. That is what
 * makes a grade in a spec a literal (`64` for three nodes) rather than a
 * range.
 *
 * Plain `node:http` on purpose: this is a fixture, not a service. It mirrors
 * the studio API's own in-process fake (`test/fake-quality-loop.client.ts`)
 * — the rubric derivation is that fake's, verbatim — so the API's specs and
 * the browser suite grade the same markdown the same way.
 *
 *     QUALITY_LOOP_STUB_PORT=3103 pnpm exec tsx --tsconfig tsconfig.base.json \
 *       packages/studio-e2e/src/support/quality-loop-stub.ts
 */

const PORT = Number(process.env['QUALITY_LOOP_STUB_PORT'] ?? 3103);
const HOST = '127.0.0.1';

/** How long a run stays `running` before its trace lands. */
const COMPLETION_DELAY_MS = 400;

const LLM: LlmAvailabilityDto = { enabled: true, model: 'stub', reason: null };

/** Fresh per process, so a stub restarted mid-suite never hands out an id a stored revision already cites. */
const RUN_ID_PREFIX = `stub-${Date.now().toString(36)}`;

// ---- the rubric: the studio API fake's derivation, verbatim ----------------

const KIND_BY_HEADING: readonly [RegExp, string][] = [
  [/non-functional|quality/i, 'non_functional'],
  [/scale/i, 'scale'],
  [/constraint/i, 'constraint'],
  [/functional/i, 'functional'],
];

/**
 * A rubric from a markdown goal, by its own headings: one criterion per
 * bullet, numbered line or table row, kinded by the section it sits under.
 * Deterministic, so a spec can predict `c1…cN`; a goal with no lists at all
 * still yields one criterion of each kind the canvas pipeline declares.
 */
export function criteriaFromMarkdown(goal: string): SuccessCriterion[] {
  const statements: { kind: string; statement: string }[] = [];
  let kind = 'functional';
  for (const raw of goal.split('\n')) {
    const line = raw.trim();
    const heading = /^#{2,}\s+(.+)$/.exec(line);
    if (heading) {
      kind = KIND_BY_HEADING.find(([pattern]) => pattern.test(heading[1]))?.[1] ?? kind;
      continue;
    }
    const item = /^(?:\d+\.|[-*])\s+(.+)$/.exec(line);
    if (item) {
      statements.push({ kind, statement: item[1] });
      continue;
    }
    const row = /^\|(.+)\|$/.exec(line);
    if (row) {
      const cells = row[1].split('|').map((cell) => cell.trim());
      if (cells.every((cell) => /^-+$/.test(cell))) continue;
      if (/^(kind|metric)$/i.test(cells[0] ?? '')) continue;
      statements.push({ kind, statement: cells.join(' — ') });
    }
  }
  if (statements.length === 0) {
    statements.push(
      { kind: 'functional', statement: 'Do what the goal asks.' },
      { kind: 'non_functional', statement: 'Meet the stated quality target.' },
      { kind: 'constraint', statement: 'Break no stated rule.' },
    );
  }
  return statements.map((item, index) => ({
    id: `c${index + 1}`,
    kind: item.kind,
    statement: item.statement.slice(0, 300),
  }));
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
function canvasFindings(graph: CanvasGraph | null, criteria: SuccessCriterion[]): ConfirmedFinding[] {
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
const criteriaRows = (criteria: SuccessCriterion[]): CriterionEvidence[] =>
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
  mode: ProduceMode | 'provided',
  artifact: unknown,
  criteria: SuccessCriterion[],
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

/** The coach's one idea: a read replica hung off the last component, ids prefixed `ai-` as the schema asks. */
function revised(output: unknown): unknown {
  const graph = graphOf(output);
  if (!graph) return output;
  const last = graph.nodes[graph.nodes.length - 1];
  const replicaId = freshId('ai-replica', graph.nodes);
  const nodes = [...graph.nodes, { id: replicaId, kind: 'replica', label: 'Read replica' }];
  const edges = last
    ? [
        ...graph.edges,
        { id: freshId('ai-e-replica', graph.edges), source: last.id, target: replicaId, kind: 'async' },
      ]
    : graph.edges;
  return { ...(output as object), graph: { nodes, edges } };
}

function canvasIteration(
  iteration: number,
  mode: ProduceMode | 'provided',
  artifact: unknown,
  criteria: SuccessCriterion[],
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
 * Iteration 1 grades the submission as provided. Given room to iterate, the
 * coach revises once — strictly better by eight points — and every later
 * iteration repeats that revision without beating it, so a spec can see
 * "imported" and "not better" side by side. The loop stops at the first
 * accepted iteration, as the real runner does.
 */
function canvasIterations(request: StartQualityRunRequest, criteria: SuccessCriterion[]): IterationTrace[] {
  const first = canvasIteration(1, 'provided', request.output, criteria, canvasOverall(graphOf(request.output)));
  const iterations = [first];
  const budget = request.maxIterations ?? 1;
  if (first.decision.finalDecision === 'accept') return iterations;

  const artifact = revised(request.output);
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

function promptIterations(request: StartQualityRunRequest, criteria: SuccessCriterion[]): IterationTrace[] {
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

// ---- run state ------------------------------------------------------------

interface StubRun {
  dto: QualityRunDto;
  request: StartQualityRunRequest;
}

const runs = new Map<string, StubRun>();
let sequence = 0;

const exchanges = (scopes: readonly string[]): LlmExchangeSummaryDto[] =>
  scopes.map((scope, index) => ({
    scope,
    ordinal: index + 1,
    outcome: 'ok',
    durationMs: 12,
    startedAt: new Date().toISOString(),
  }));

function startRun(request: StartQualityRunRequest): QualityRunDto {
  sequence += 1;
  const runId = `${RUN_ID_PREFIX}-${sequence}`;
  const dto: QualityRunDto = {
    runId,
    pipeline: request.pipeline,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    llm: LLM,
    request: {
      goal: request.goal,
      outputProvided: request.output !== undefined,
      criteriaProvided: request.criteria !== undefined,
      maxIterations: request.maxIterations ?? 1,
    },
    trace: null,
    exchanges: exchanges(['producer.s1', 'critic.architecture.s1', 'evaluator.coverage.s1']),
    error: null,
  };
  runs.set(runId, { dto, request });
  setTimeout(() => completeRun(runId), COMPLETION_DELAY_MS);
  return dto;
}

function completeRun(runId: string): void {
  const run = runs.get(runId);
  if (!run || run.dto.status !== 'running') return;
  const { request, dto } = run;
  const criteria = request.criteria ?? criteriaFromMarkdown(request.goal);
  const iterations =
    request.pipeline === PROMPT_PIPELINE_ID
      ? promptIterations(request, criteria)
      : canvasIterations(request, criteria);

  let best = 0;
  iterations.forEach((it, index) => {
    if (it.decision.scores.overall > iterations[best].decision.scores.overall) best = index;
  });
  const last = iterations[iterations.length - 1];

  dto.status = 'complete';
  dto.finishedAt = new Date().toISOString();
  dto.trace = {
    pipeline: { id: request.pipeline, version: 'stub' },
    contract: { goal: request.goal, criteria },
    iterations,
    bestIteration: best + 1,
    finalDecision: last.decision.finalDecision,
    stopReason: last.decision.finalDecision === 'accept' ? 'accepted' : 'max-iterations',
    lessons: [],
  };
}

// ---- HTTP -----------------------------------------------------------------

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

const notFound = (res: ServerResponse, message: string): void =>
  send(res, 404, { statusCode: 404, message, error: 'Not Found' });

const badRequest = (res: ServerResponse, message: string): void =>
  send(res, 400, { statusCode: 400, message, error: 'Bad Request' });

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text.length === 0 ? undefined : JSON.parse(text);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** The known pipelines answer; anything else is the loop's own refusal. */
const KNOWN_PIPELINES: readonly string[] = [CANVAS_PIPELINE_ID, PROMPT_PIPELINE_ID];

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', `http://${HOST}`);
  const path = url.pathname;

  if (method === 'GET' && path === '/health') {
    return send(res, 200, { status: 'ok', llm: LLM });
  }
  if (method === 'GET' && path === '/pipelines') {
    return send(res, 200, { data: [] });
  }
  if (method === 'GET' && path === '/prompts') {
    return send(res, 200, { data: LIBRARY.map(({ id, title }) => ({ id, title })) });
  }
  if (method === 'GET' && path.startsWith('/prompts/')) {
    const id = path.slice('/prompts/'.length).split('/').map(decodeURIComponent).join('/');
    const document = LIBRARY.find((candidate) => candidate.id === id);
    return document ? send(res, 200, { data: document }) : notFound(res, `prompt ${id} not found`);
  }

  if (method === 'POST' && path === '/criteria') {
    const body = await readJson(req);
    if (!isRecord(body) || typeof body['pipeline'] !== 'string' || typeof body['goal'] !== 'string') {
      return badRequest(res, 'pipeline and goal are required');
    }
    if (!KNOWN_PIPELINES.includes(body['pipeline'])) {
      return notFound(res, `unknown pipeline: ${body['pipeline']}`);
    }
    return send(res, 200, {
      data: {
        pipeline: body['pipeline'],
        criteria: criteriaFromMarkdown(body['goal']),
        diagnostic: null,
        llm: LLM,
      },
    });
  }

  if (method === 'POST' && path === '/runs') {
    const body = await readJson(req);
    if (!isRecord(body) || typeof body['pipeline'] !== 'string' || typeof body['goal'] !== 'string') {
      return badRequest(res, 'pipeline and goal are required');
    }
    if (!KNOWN_PIPELINES.includes(body['pipeline'])) {
      return notFound(res, `unknown pipeline: ${body['pipeline']}`);
    }
    const started = startRun(body as unknown as StartQualityRunRequest);
    return send(res, 202, { data: { runId: started.runId, status: started.status } });
  }
  if (method === 'GET' && path === '/runs') {
    return send(res, 200, { data: [], meta: { total: 0, limit: 50, offset: 0 } });
  }
  if (method === 'GET' && path.startsWith('/runs/')) {
    const runId = decodeURIComponent(path.slice('/runs/'.length));
    const run = runs.get(runId);
    return run ? send(res, 200, { data: run.dto }) : notFound(res, `run ${runId} not found`);
  }

  return notFound(res, `Cannot ${method} ${path}`);
}

const server = createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof SyntaxError) return badRequest(res, `invalid JSON body: ${message}`);
    send(res, 500, { statusCode: 500, message, error: 'Internal Server Error' });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`quality-loop stub listening on http://${HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
