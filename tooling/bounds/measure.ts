/**
 * `pnpm measure:bounds [--runs-dir=<dir>] [--since=<date>] [--pipeline=<id>]`
 * — the measured fixtures, regenerated from the run dumps.
 *
 * Every bound a model writes into and every output cap a stage declares is
 * sized from what the model measurably does, and a spec holds each one
 * against a committed fixture. This walks `static/runs/*` — read-only; the
 * dumps are gitignored and never written — and measures every string and
 * list a call's own schema gave a size, in the reply as the model wrote it
 * (its text, read for the object its schema requires, else its validated
 * response — so a reply the seam refused, kept past a ceiling or salvaged
 * counts at its written size), and every stage's output tokens; then writes
 * one fixture per declaring module and refreshes the calls the time-limit
 * spec replays. Run it before changing any bound or cap, and commit what it
 * writes.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type {
  LlmExchangeOutcome,
  MeasuredBounds,
  MeasuredCap,
  MeasuredField,
} from '@sysdesign/contracts';
import { callTimeLimitMs } from '@sysdesign/llm';
import { format, resolveConfig } from 'prettier';

import { loadMeasureConfig, REPO_ROOT, type MeasureConfig } from './config';
import { readRecordedCalls, type RecordedCall, type StageRole } from './recorded';
import { measureReply } from './reply';

/** Where the fixtures live, relative to the repo root. */
export const FIXTURE_LAYOUT = {
  pipelines: 'packages/quality-loop/src/pipelines',
  /** What every lens answers is the engine's own schema. */
  lenses: 'packages/quality-loop/src/core/stages/measured.json',
  contracts: 'packages/contracts/src/lib/measured',
  calls: 'packages/llm/src/fixtures/measured-calls.json',
} as const;

/**
 * A producer whose output schema contracts declares — the studio validates
 * with it and the model writes into it — is measured beside that schema,
 * under this name; every other producer beside its pipeline.
 */
export const CONTRACT_OUTPUTS: Readonly<Record<string, string>> = {
  'design-prompt': 'design-prompt',
  'system-design-canvas': 'canvas',
};

/**
 * Which recorded calls the time-limit spec replays: the longest, the slowest
 * per token written, the tightest against the limit their own declaration
 * derives, the furthest past their own declaration, and the longest of every
 * pipeline stage — successful calls only.
 */
export const CALL_SELECTION = {
  longest: 12,
  slowestPerToken: 12,
  tightest: 12,
  pastDeclaration: 12,
} as const;

/** The value at the given share of a sorted list, nearest rank. */
export function percentile(sorted: readonly number[], share: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil(share * sorted.length) - 1)];
}

/**
 * The turns a stage's cap is measured on: those that ended on an answer, kept
 * or refused. A turn that ended on an error — our time limit, the provider's
 * output ceiling, a broken stream — wrote until it was stopped, not until it
 * was done: a runaway that wrote 128,000 tokens and no text measures the
 * fault, not the stage.
 */
const ANSWERED: ReadonlySet<string> = new Set<LlmExchangeOutcome>(['ok', 'refusal', 'schema-miss']);

/** Where a call's fields are held: the module that declares the bounds it answers. */
function fieldsFixture(call: RecordedCall): string {
  if (call.role === 'critic' || call.role === 'evaluator') return FIXTURE_LAYOUT.lenses;
  const contract = call.role === 'producer' ? CONTRACT_OUTPUTS[call.pipeline] : undefined;
  return contract === undefined
    ? pipelineFixture(call.pipeline)
    : join(FIXTURE_LAYOUT.contracts, `${contract}.json`);
}

export const pipelineFixture = (pipeline: string): string =>
  join(FIXTURE_LAYOUT.pipelines, pipeline, 'measured.json');

interface Tally {
  runs: Set<string>;
  starts: string[];
  fields: Map<string, { sizes: number[]; overTarget: number; role: StageRole }>;
  caps: Map<string, { tokens: number[]; apiCalls: number | null }>;
}

const tallyOf = (): Tally => ({ runs: new Set(), starts: [], fields: new Map(), caps: new Map() });

/** A map's entries in key order, so a refresh rewrites a fixture only where a figure moved. */
const sortedEntries = <V>(map: Map<string, V>): [string, V][] =>
  [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

function fixtureOf(tally: Tally): MeasuredBounds {
  const starts = [...tally.starts].sort();
  const fields: Record<string, MeasuredField> = {};
  for (const [path, { sizes, overTarget }] of sortedEntries(tally.fields)) {
    const sorted = [...sizes].sort((a, b) => a - b);
    fields[path] = {
      n: sorted.length,
      max: sorted[sorted.length - 1],
      p99: percentile(sorted, 0.99),
      overTarget,
    };
  }
  const caps: Record<string, MeasuredCap> = {};
  for (const [stage, { tokens, apiCalls }] of sortedEntries(tally.caps)) {
    const sorted = [...tokens].sort((a, b) => a - b);
    caps[stage] = {
      n: sorted.length,
      max: sorted[sorted.length - 1],
      p99: percentile(sorted, 0.99),
      maxApiCalls: apiCalls,
    };
  }
  return {
    since: starts[0] ?? null,
    until: starts[starts.length - 1] ?? null,
    runs: tally.runs.size,
    fields,
    caps,
  };
}

/**
 * Every fixture's content by its path: one per pipeline folder (`pipelines`,
 * empty for a pipeline no run recorded), the lenses' and each contract
 * output's. A pipeline recorded but no longer declared is reported, not
 * written. One fixture holding the same path from two kinds of stage would
 * conflate two schemas, so it throws.
 */
export function measuredFixtures(
  calls: readonly RecordedCall[],
  pipelines: readonly string[],
): { fixtures: Map<string, MeasuredBounds>; retired: string[] } {
  const tallies = new Map<string, Tally>();
  const tally = (file: string): Tally => {
    const found = tallies.get(file);
    if (found !== undefined) return found;
    const fresh = tallyOf();
    tallies.set(file, fresh);
    return fresh;
  };
  for (const pipeline of pipelines) tally(pipelineFixture(pipeline));
  tally(FIXTURE_LAYOUT.lenses);
  for (const name of Object.values(CONTRACT_OUTPUTS)) {
    tally(join(FIXTURE_LAYOUT.contracts, `${name}.json`));
  }

  const declared = new Set(pipelines);
  const retired = new Set<string>();
  const counted = (into: Tally, call: RecordedCall) => {
    into.runs.add(call.run);
    into.starts.push(call.startedAt);
  };
  for (const call of calls) {
    if (!declared.has(call.pipeline)) {
      retired.add(call.pipeline);
      continue;
    }
    if (call.outputTokens !== null && ANSWERED.has(call.outcome)) {
      const into = tally(pipelineFixture(call.pipeline));
      counted(into, call);
      const cap = into.caps.get(call.stage) ?? { tokens: [], apiCalls: null };
      cap.tokens.push(call.outputTokens);
      if (call.apiCalls !== null) cap.apiCalls = Math.max(cap.apiCalls ?? 0, call.apiCalls);
      into.caps.set(call.stage, cap);
    }
    const sizes = measureReply(call.reply, call.schema);
    if (sizes.length === 0) continue;
    const file = fieldsFixture(call);
    const into = tally(file);
    counted(into, call);
    for (const { path, size, asked } of sizes) {
      const field = into.fields.get(path) ?? { sizes: [], overTarget: 0, role: call.role };
      if (field.role !== call.role) {
        throw new Error(`${file}: ${path} is written by both a ${field.role} and a ${call.role}`);
      }
      field.sizes.push(size);
      field.overTarget += size > asked ? 1 : 0;
      into.fields.set(path, field);
    }
  }
  const fixtures = new Map<string, MeasuredBounds>();
  for (const [file, into] of sortedEntries(tallies)) fixtures.set(file, fixtureOf(into));
  return { fixtures, retired: [...retired].sort() };
}

/** One call the time-limit spec replays: what it declared, wrote and took. */
export interface MeasuredCall {
  run: string;
  call: string;
  maxTokens: number;
  outputTokens: number;
  durationMs: number;
}

/** The calls `CALL_SELECTION` names, each once, in run order. */
export function measuredCalls(calls: readonly RecordedCall[]): MeasuredCall[] {
  const succeeded = calls
    .filter((call) => call.outcome === 'ok' && call.outputTokens !== null)
    .map((call) => ({ ...call, outputTokens: call.outputTokens as number }));
  const top = (score: (call: (typeof succeeded)[number]) => number, count: number) =>
    [...succeeded].sort((a, b) => score(b) - score(a)).slice(0, count);
  const longestPerStage = new Map<string, (typeof succeeded)[number]>();
  for (const call of succeeded) {
    const key = `${call.pipeline}/${call.stage}`;
    const held = longestPerStage.get(key);
    if (held === undefined || call.durationMs > held.durationMs) longestPerStage.set(key, call);
  }
  const chosen = [
    ...top((call) => call.durationMs, CALL_SELECTION.longest),
    ...top(
      (call) => call.durationMs / Math.max(1, call.outputTokens),
      CALL_SELECTION.slowestPerToken,
    ),
    ...top((call) => call.durationMs / callTimeLimitMs(call.maxTokens), CALL_SELECTION.tightest),
    ...top((call) => call.outputTokens / call.maxTokens, CALL_SELECTION.pastDeclaration).filter(
      (call) => call.outputTokens > call.maxTokens,
    ),
    ...longestPerStage.values(),
  ];
  const seen = new Map<string, MeasuredCall>();
  for (const { run, call, maxTokens, outputTokens, durationMs } of chosen) {
    seen.set(`${run}/${call}`, { run, call, maxTokens, outputTokens, durationMs });
  }
  return sortedEntries(seen).map(([, picked]) => picked);
}

/**
 * The fixtures one measurement writes: all of them, or — when one pipeline is
 * named — that pipeline's own and its contract output's alone, so a pipeline
 * re-measured from the date its new version first ran leaves every other
 * fixture untouched. The lenses' and the replayed calls' fixtures are shared
 * by every pipeline, so a measurement of one writes neither.
 */
export function fixturesToWrite(
  fixtures: ReadonlyMap<string, MeasuredBounds>,
  pipeline: string | null,
): Map<string, MeasuredBounds> {
  if (pipeline === null) return new Map(fixtures);
  const own = new Set([pipelineFixture(pipeline)]);
  const contract = CONTRACT_OUTPUTS[pipeline];
  if (contract !== undefined) own.add(join(FIXTURE_LAYOUT.contracts, `${contract}.json`));
  return new Map([...fixtures].filter(([file]) => own.has(file)));
}

/** Every pipeline folder that declares one. */
function declaredPipelines(): string[] {
  const root = join(REPO_ROOT, FIXTURE_LAYOUT.pipelines);
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'definition.ts')))
    .map((entry) => entry.name)
    .sort();
}

/** A JSON file as prettier would leave it, so a refresh diffs only in what was measured. */
async function writeJson(file: string, value: unknown): Promise<void> {
  const path = join(REPO_ROOT, file);
  const options = (await resolveConfig(path)) ?? {};
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, await format(JSON.stringify(value), { ...options, filepath: path }));
}

export async function measure(config: MeasureConfig): Promise<string[]> {
  const { calls, skipped } = readRecordedCalls(config.runsDir, config.since);
  const pipelines = declaredPipelines();
  if (config.pipeline !== null && !pipelines.includes(config.pipeline)) {
    throw new Error(`--pipeline names ${config.pipeline}; declared: ${pipelines.join(', ')}`);
  }
  const { fixtures, retired } = measuredFixtures(calls, pipelines);
  const lines = [
    `measured ${calls.length} calls from ${config.runsDir}${config.since ? ` since ${config.since.toISOString()}` : ''}${config.pipeline ? ` for ${config.pipeline}` : ''}`,
  ];
  for (const [file, fixture] of fixturesToWrite(fixtures, config.pipeline)) {
    await writeJson(file, fixture);
    lines.push(
      `  ${file}: ${fixture.runs} runs, ${Object.keys(fixture.fields).length} fields, ${Object.keys(fixture.caps).length} caps`,
    );
  }
  if (config.pipeline === null) {
    const replayed = measuredCalls(calls);
    await writeJson(FIXTURE_LAYOUT.calls, replayed);
    lines.push(`  ${FIXTURE_LAYOUT.calls}: ${replayed.length} calls`);
  }
  if (retired.length > 0) lines.push(`not measured — no longer declared: ${retired.join(', ')}`);
  for (const reason of skipped) lines.push(`skipped ${reason}`);
  return lines.map((line) => line.replace(`${REPO_ROOT}/`, ''));
}

// Guarded so the module can be imported for testing without measuring anything.
if (require.main === module) {
  measure(loadMeasureConfig())
    .then((lines) => console.log(lines.join('\n')))
    .catch((error: unknown) => {
      console.error(`measure:bounds failed: ${(error as Error).message}`);
      process.exit(1);
    });
}
