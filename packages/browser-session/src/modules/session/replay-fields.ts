import { randomUUID } from 'node:crypto';

import type { BoundSpace, MemoryClient } from '@sysdesign/agentic-memory-client';
import {
  errorMessage,
  type AnsweringSettings,
  type EvidenceItem,
  type MemoryRecordDto,
  type RecordScope,
} from '@sysdesign/contracts';
import type { LoopClient } from '@sysdesign/loop-client';

import type { LoopBrainOptions } from '../../adapters/loop-http/loop-runs';
import { bindBrainSpace, isHostSilent, scopeOf } from '../../adapters/memory-loop/binding';
import {
  noEvidence,
  recallForFields,
  type FieldRecall,
} from '../../adapters/memory-loop/field-recall';
import { NO_TENANT, SESSION_ENV, SESSION_FLAGS } from '../../config';
import type { Clock, FieldsInput } from '../../core/ports';
import { SessionRefused } from '../../core/unit-advice';
import type { BrainSettings, MemoryBrainSettings } from '../../settings';
import { readRecordedEvidenceItems } from './recorded-evidence';
import { readRecordedDumps, type RecordedStep } from './replay-fields-dumps';
import {
  percentile,
  sampledIndices,
  scopeLeaksOf,
  type KnownAnswers,
} from './replay-fields-measure';
import { judgePage, type JudgedPage } from './replay-fields-page';
import {
  measureRetraction,
  recalledRecordsOf,
  type RetractionMeasure,
} from './replay-fields-retract';
import {
  byFieldType,
  count,
  countedBy,
  rowsOf,
  sum,
  writeReplay,
  type PageReplay,
} from './replay-fields-rows';

/**
 * The offline replay: every form page a folder of session dumps recorded,
 * recalled for again through the shipping memory recall against the space the
 * brain settings bind, under a tenant of the caller's — a verification tenant
 * seeded for the purpose — and compared with what the recorded run was given.
 * Per field: whether each evidence text the recorded answer cited is among
 * the new evidence, by three declared rules read apart; how much is new;
 * whether any recalled record's own scope, as the recall answered it, leaks
 * past the page's unit or tenant; and how long the recall took beside how long
 * the recorded recall step took. With `judge`, the page is judged again
 * through the shipping judge and routed by the shipped answering settings,
 * each field given a verdict against the operator answer on record for its
 * unit; with `retract`, a sample of the recalled records is closed in the
 * tenant replayed against and recalled for again — the replay's one write.
 * A host that does not answer a page is that page's fault, recorded, and the
 * replay goes on. Rows and a report land under a stamped folder; the summary
 * is the acceptance table's numbers. No row, no dump, no teaching: the replay
 * reads, recalls and, when asked, judges and closes what it recalled.
 */
interface ReplayFieldsDeps {
  loop: LoopClient;
  /** The memory client the module provides under the memory brain; null under any other, which the replay refuses by name. */
  memory: MemoryClient | null;
  brainSettings: BrainSettings;
  /** The shipped answering settings a judged page's fields are routed by. */
  answering: AnsweringSettings;
  /** The environment's tenant, replayed under unless the options name another; the placeholder is refused by name. */
  memoryTenant: string;
  clock: Pick<Clock, 'now'>;
  log: (text: string) => void;
  /** How a judged run is awaited: the defaults live, a spec's own pacing under test. */
  loopOptions?: LoopBrainOptions;
}

export interface ReplayFieldsOptions {
  sessionsDir: string;
  /** The tenant the recall addresses, over the environment's; unset means the environment's. */
  tenant: string | undefined;
  /** How many fields with an operator's answer on record to judge again, drawn evenly across the dumps; null judges every page. */
  sample: number | null;
  judge: boolean;
  /** How many recalled records the retraction measure closes, drawn evenly across them; null measures none and writes nothing. */
  retract: number | null;
  /** The folder the stamped report folder is written under. */
  out: string;
}

/** The acceptance table's numbers, as the terminal renders them; the report file holds the breakdowns. */
export interface ReplayFieldsReport {
  fields: number;
  pages: number;
  /** Of the evidence texts the recorded answers cited, how many the new recall listed again by any rule, and how many were cited. */
  citedFound: number;
  cited: number;
  /** How many of the cited texts each declared rule found: the same words, the same identity, the fact's words contained. */
  citedBy: { equal: number; identity: number; contained: number };
  /** Recalled records whose own scope names another unit, or another tenant, than the page was replayed under. */
  unitLeak: number;
  tenantLeak: number;
  /** The recall's latency per page, in milliseconds; null over no page. */
  latency: { p50: number | null; p90: number | null };
  /** The recorded recall step's latency per page, read off the orchestrations the loop still holds; null over none. */
  recordedLatency: { p50: number | null; p90: number | null };
  /** Over the judged fields: how many were filled, how many asked, how many filled against the operator's answer; null when nothing was judged. */
  judged: { filled: number; asked: number; wrong: number } | null;
  /** Recorded runs the loop no longer holds: their cited evidence could not be compared. */
  unresolvedRuns: number;
  /** Recorded orchestrations the loop no longer holds: their recall latency could not be read. */
  unresolvedOrchestrations: number;
  /** The retraction measure, when asked; null otherwise. */
  retraction: RetractionMeasure | null;
  outDir: string;
}

/** Where a replay writes unless `--out` says otherwise; ignored by git as the dumps are. */
export const DEFAULT_REPLAYS_DIR = 'static/replays';

/**
 * The step of the recorded `form-memory` orchestrations whose duration is the
 * recorded recall latency: the orchestrator's own step id, fixed data of the
 * recorded runs this replay compares against.
 */
const RECORDED_RECALL_STEP = 'recall';

function memoryBrainOf(deps: ReplayFieldsDeps): {
  memory: MemoryClient;
  settings: MemoryBrainSettings;
} {
  if (deps.brainSettings.adapter !== 'memory' || deps.memory === null) {
    const why =
      deps.brainSettings.adapter === 'memory'
        ? 'no memory client is bound'
        : `the chosen brain is ${deps.brainSettings.adapter}`;
    throw new SessionRefused(
      `replay-fields replays against a memory space, and ${why}: choose a brain file with "adapter": "memory" in config/engine.json`,
    );
  }
  return { memory: deps.memory, settings: deps.brainSettings };
}

/** The tenant replayed under — the flag's, else the environment's — or a refusal naming both; never the placeholder. */
function tenantOf(deps: ReplayFieldsDeps, options: ReplayFieldsOptions): string {
  const tenant = options.tenant ?? deps.memoryTenant;
  if (tenant === NO_TENANT) {
    throw new SessionRefused(
      `replay-fields needs the tenant whose memories it replays against: ${SESSION_FLAGS.tenant.name} <name>, or ${SESSION_ENV.memoryTenant.name} in the environment`,
    );
  }
  return tenant;
}

/**
 * The pages judged: none without `judge`; every page when no sample is drawn;
 * else the pages holding an evenly drawn sample of the fields whose question
 * the operator answered on record — the fields a verdict can be wrong on.
 */
function pagesToJudge(
  pages: readonly RecordedStep[],
  known: KnownAnswers,
  options: ReplayFieldsOptions,
): Set<RecordedStep> {
  if (!options.judge) return new Set();
  if (options.sample === null) return new Set(pages);
  const withKnown = pages.flatMap((page) =>
    page.fields
      .filter(
        (field) =>
          field.question !== null &&
          known.for(field.question, page.task?.unitKey ?? null, field.about) !== null,
      )
      .map(() => page),
  );
  return new Set(
    sampledIndices(withKnown.length, options.sample).flatMap((index) => withKnown[index] ?? []),
  );
}

/** The evidence the recorded run was given, read by whichever codec wrote its goal; unresolved when the loop no longer holds the run. */
async function recordedEvidenceOf(
  loop: LoopClient,
  step: RecordedStep,
): Promise<{ recorded: EvidenceItem[] | null; unresolved: boolean }> {
  if (step.runId === null) return { recorded: null, unresolved: false };
  const run = await loop.getRun(step.runId);
  if (run === null) return { recorded: null, unresolved: true };
  return { recorded: readRecordedEvidenceItems(run.request.goal), unresolved: false };
}

/** How long the recorded recall step took, off the orchestration the loop still holds; unresolved when it no longer does. */
async function recordedRecallMsOf(
  loop: LoopClient,
  step: RecordedStep,
): Promise<{ ms: number | null; unresolved: boolean }> {
  if (step.orchestrationRunId === null) return { ms: null, unresolved: false };
  const orchestration = await loop.getOrchestration(step.orchestrationRunId);
  if (orchestration === null) return { ms: null, unresolved: true };
  const recall = orchestration.steps[RECORDED_RECALL_STEP];
  if (recall?.startedAt == null || recall.finishedAt == null)
    return { ms: null, unresolved: false };
  return { ms: Date.parse(recall.finishedAt) - Date.parse(recall.startedAt), unresolved: false };
}

/** The page as the brain is asked for it: what the session composed then, from the dump. */
const inputOf = (step: RecordedStep): FieldsInput => ({
  session: { sessionId: step.sessionId, step: step.step },
  mission: step.mission ?? '',
  task: step.task,
  fields: step.fields.map((field) => field.field),
  criteria: step.criteria ?? [],
});

/** The page recalled for; a host that did not answer is the page's fault on its report, and the replay goes on. */
async function recallRidingSilence(
  memory: MemoryClient,
  bound: BoundSpace,
  settings: MemoryBrainSettings,
  scope: RecordScope,
  input: FieldsInput,
): Promise<FieldRecall> {
  const startedAt = Date.now();
  try {
    return await recallForFields(memory, bound, settings, scope, input);
  } catch (error) {
    if (!isHostSilent(error)) throw error;
    return noEvidence(error.message, Date.now() - startedAt);
  }
}

/** How many recalled records leak past the page's scope, by the scope the recall answered each record under. */
function leaksOf(
  records: readonly MemoryRecordDto[],
  scope: RecordScope,
  bound: BoundSpace,
  tenant: string,
): PageReplay['leaks'] {
  const leaks = { unit: 0, tenant: 0 };
  for (const record of records) {
    const found = scopeLeaksOf(record.scope, scope, bound, tenant);
    if (found.unitLeak) leaks.unit += 1;
    if (found.tenantLeak) leaks.tenant += 1;
  }
  return leaks;
}

/** One page as the retraction measure needs it: what was recalled, under which scope, for which input. */
interface RecalledPage {
  records: MemoryRecordDto[];
  scope: RecordScope;
  input: FieldsInput;
}

export async function replayFields(
  deps: ReplayFieldsDeps,
  options: ReplayFieldsOptions,
): Promise<ReplayFieldsReport> {
  const { memory, settings } = memoryBrainOf(deps);
  const tenant = tenantOf(deps, options);
  const bound = await bindBrainSpace(memory, settings);
  const record = await readRecordedDumps(options.sessionsDir);
  const pages = record.steps.filter((step) => step.fields.length > 0);
  const judging = pagesToJudge(pages, record.knownAnswers, options);
  // Every run the replay opens is opened by the replay, never as the recorded session.
  const replayId = randomUUID();
  const replays: PageReplay[] = [];
  const recalledPages: RecalledPage[] = [];
  const faults = { recall: [] as string[], judge: [] as string[] };
  const recordedLatencies: number[] = [];
  let unresolvedRuns = 0;
  let unresolvedOrchestrations = 0;
  let unjudgeable = 0;
  for (const step of pages) {
    const { recorded, unresolved } = await recordedEvidenceOf(deps.loop, step);
    if (unresolved) unresolvedRuns += 1;
    const recordedRecall = await recordedRecallMsOf(deps.loop, step);
    if (recordedRecall.unresolved) unresolvedOrchestrations += 1;
    if (recordedRecall.ms !== null) recordedLatencies.push(recordedRecall.ms);
    const scope = scopeOf(bound, tenant, settings.project, step.task?.unitKey ?? null);
    const input = inputOf(step);
    const { evidence, records, report } = await recallRidingSilence(
      memory,
      bound,
      settings,
      scope,
      input,
    );
    if (report.fault !== null)
      faults.recall.push(`${step.dump} step ${step.step}: ${report.fault}`);
    recalledPages.push({ records, scope, input });
    let judged: JudgedPage | null = null;
    if (judging.has(step)) {
      // A page whose dump kept no mission or no rubric cannot be judged as it was.
      if (step.mission === null || step.criteria === null) {
        unjudgeable += 1;
      } else {
        try {
          judged = await judgePage(
            deps.loop,
            settings,
            deps.answering,
            input,
            evidence,
            deps.loopOptions ?? {},
            replayId,
          );
        } catch (error) {
          faults.judge.push(`${step.dump} step ${step.step}: ${errorMessage(error)}`);
        }
      }
    }
    replays.push({
      step,
      recorded,
      evidence,
      records,
      recall: report,
      leaks: leaksOf(records, scope, bound, tenant),
      judged,
    });
    deps.log(
      `${step.dump} step ${step.step}: ${evidence.length} item(s) recalled for ${report.requests} question(s) in ${report.latencyMs} ms${judged === null ? '' : ` · judged ${judged.admission}`}`,
    );
  }
  const retraction =
    options.retract === null
      ? null
      : await measureRetraction(
          memory,
          bound,
          settings,
          recalledRecordsOf(recalledPages),
          options.retract,
        );
  const rows = replays.flatMap((page) => rowsOf(page, record.knownAnswers));
  const judgedRows = rows.filter((row) => row.newRoute !== null);
  const latencies = replays.map((page) => page.recall.latencyMs);
  const summary: Omit<ReplayFieldsReport, 'outDir'> = {
    fields: rows.length,
    pages: replays.length,
    citedFound: sum(rows.map((row) => row.citedFound)),
    cited: sum(rows.flatMap((row) => [row.citedFound, row.citedMissing])),
    citedBy: {
      equal: sum(rows.map((row) => row.citedEqual)),
      identity: sum(rows.map((row) => row.citedByIdentity)),
      contained: sum(rows.map((row) => row.citedContained)),
    },
    unitLeak: sum(replays.map((page) => page.leaks.unit)),
    tenantLeak: sum(replays.map((page) => page.leaks.tenant)),
    latency: { p50: percentile(latencies, 50), p90: percentile(latencies, 90) },
    recordedLatency: {
      p50: percentile(recordedLatencies, 50),
      p90: percentile(recordedLatencies, 90),
    },
    judged: options.judge
      ? {
          filled: count(judgedRows, (row) => row.newRoute === 'fill'),
          asked: count(judgedRows, (row) => row.newRoute === 'ask-operator'),
          wrong: count(judgedRows, (row) => row.verdict === 'wrong'),
        }
      : null,
    unresolvedRuns,
    unresolvedOrchestrations,
    retraction,
  };
  const outDir = await writeReplay(options.out, deps.clock.now(), rows, {
    generatedAt: deps.clock.now().toISOString(),
    replayId,
    sessionsDir: options.sessionsDir,
    tenant,
    project: settings.project,
    spaceId: bound.spaceId,
    sample: options.sample,
    judge: options.judge,
    retract: options.retract,
    summary,
    pages: {
      recorded: record.steps.length,
      replayed: replays.length,
      judged: count(replays, (page) => page.judged !== null),
      unjudgeable,
      withoutRun: count(replays, (page) => page.step.runId === null),
    },
    judgedRecorded: options.judge
      ? {
          filled: count(judgedRows, (row) => row.recordedRoute === 'fill'),
          asked: count(judgedRows, (row) => row.recordedRoute === 'ask-operator'),
        }
      : null,
    byFieldType: byFieldType(rows),
    evidenceByKind: countedBy(replays, (item) => item.kind),
    evidenceByOrigin: countedBy(replays, (item) => item.source.origin),
    recallSkipped: sum(replays.map((page) => page.recall.skipped.length)),
    faults,
    unreadable: record.unreadable,
  });
  return { ...summary, outDir };
}
