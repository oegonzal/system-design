/**
 * The read side of the measurement: every call of every quality run under a
 * dumps folder, attributed to its run, pipeline and stage. Reads only; the
 * dumps are gitignored and never written. The summary dumped with each run
 * says which lenses ran how many samples, so a call's scope is looked up,
 * never parsed.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { replyOf } from './reply';

/** What a call's stage answers: the deriver's criteria, the producer's artifact, a lens's report. */
export type StageRole = 'criteria' | 'producer' | 'critic' | 'evaluator';

/** One recorded call, attributed to its run, pipeline and stage. */
export interface RecordedCall {
  run: string;
  /** The run's start, ISO. */
  startedAt: string;
  pipeline: string;
  /** `criteria`, `producer`, or the lens id. */
  stage: string;
  role: StageRole;
  /** The file stem under `05-llm/`: `07.critic.requirements.s2.1`. */
  call: string;
  outcome: string;
  maxTokens: number;
  outputTokens: number | null;
  durationMs: number;
  apiCalls: number | null;
  /** The reply as the model wrote it, or null when nothing parsed. */
  reply: unknown;
  /** The JSON Schema the call showed the model. */
  schema: unknown;
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

interface PipelineShape {
  id: string;
  critics: { id: string; samples: number }[];
  evaluators: { id: string; samples: number }[];
}

/** A run's dumped pipeline summary, as far as attribution needs it; null when there is none. */
function pipelineOf(value: unknown): PipelineShape | null {
  if (!isRecord(value) || typeof value['id'] !== 'string') return null;
  const lenses = (key: string) =>
    (Array.isArray(value[key]) ? value[key] : []).filter(
      (lens): lens is { id: string; samples: number } =>
        isRecord(lens) && typeof lens['id'] === 'string' && typeof lens['samples'] === 'number',
    );
  return { id: value['id'], critics: lenses('critics'), evaluators: lenses('evaluators') };
}

/**
 * Every scope the run's pipeline records under, with its stage: the engine
 * scopes a lens's sample `<lens>.s<n>` (`core/loop/materialize.ts`), and the
 * summary dumped with the run says which lenses ran how many samples, so a
 * scope is looked up, never parsed.
 */
function scopesOf(pipeline: PipelineShape): Map<string, { stage: string; role: StageRole }> {
  const scopes = new Map<string, { stage: string; role: StageRole }>([
    ['criteria', { stage: 'criteria', role: 'criteria' }],
    ['producer', { stage: 'producer', role: 'producer' }],
  ]);
  const add = (lenses: PipelineShape['critics'], role: StageRole) => {
    for (const lens of lenses) {
      for (let sample = 1; sample <= lens.samples; sample++) {
        scopes.set(`${lens.id}.s${sample}`, { stage: lens.id, role });
      }
    }
  };
  add(pipeline.critics, 'critic');
  add(pipeline.evaluators, 'evaluator');
  return scopes;
}

export interface Recorded {
  calls: RecordedCall[];
  /** What was not measured, and why — said, never silently dropped. */
  skipped: string[];
}

/** Every call of every quality run under `runsDir` started at or after `since`. Reads only. */
export function readRecordedCalls(runsDir: string, since: Date | null): Recorded {
  const calls: RecordedCall[] = [];
  const skipped: string[] = [];
  const runs = readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const run of runs) {
    const dir = join(runsDir, run);
    const manifestPath = join(dir, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = readJson(manifestPath);
    if (!isRecord(manifest) || manifest['kind'] !== 'quality') continue;
    const startedAt = String(manifest['startedAt']);
    if (since !== null && new Date(startedAt) < since) continue;
    const pipelinePath = join(dir, '03-pipeline.json');
    const pipeline = existsSync(pipelinePath) ? pipelineOf(readJson(pipelinePath)) : null;
    if (pipeline === null) {
      skipped.push(`${run}: no pipeline summary`);
      continue;
    }
    const scopes = scopesOf(pipeline);
    const llmDir = join(dir, '05-llm');
    if (!existsSync(llmDir)) continue;
    for (const file of readdirSync(llmDir).sort()) {
      if (!file.endsWith('.meta.json')) continue;
      const call = file.slice(0, -'.meta.json'.length);
      const meta = readJson(join(llmDir, file));
      if (!isRecord(meta)) continue;
      const scope = scopes.get(String(meta['scope']));
      if (scope === undefined) {
        skipped.push(
          `${run}/${call}: scope ${String(meta['scope'])} is no stage of ${pipeline.id}`,
        );
        continue;
      }
      const responsePath = join(llmDir, `${call}.response.json`);
      const response = existsSync(responsePath) ? readJson(responsePath) : null;
      const usage = isRecord(meta['usage']) ? meta['usage'] : null;
      const text = typeof meta['text'] === 'string' ? meta['text'] : null;
      calls.push({
        run,
        startedAt,
        pipeline: pipeline.id,
        stage: scope.stage,
        role: scope.role,
        call,
        outcome: String(meta['outcome']),
        maxTokens: Number(meta['maxTokens']),
        outputTokens: typeof usage?.['outputTokens'] === 'number' ? usage['outputTokens'] : null,
        durationMs: Number(meta['durationMs']),
        apiCalls: typeof meta['apiCalls'] === 'number' ? meta['apiCalls'] : null,
        reply: replyOf(text, response, meta['schema']),
        schema: meta['schema'],
      });
    }
  }
  return { calls, skipped };
}
