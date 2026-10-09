/**
 * The dump of one rubric derived alone (`POST /criteria`): the goal, the
 * criteria the deriver returned, the pipeline it derived for, and the one
 * exchange it took — the checklist a browser session judges every plan by,
 * readable where it was made. Pure, like the run dump: the layout is decided
 * here and written by `@sysdesign/run-dump`.
 *
 * NOTE FOR READERS: these files contain the goal and the model's prose verbatim.
 */
import { DUMP_SCHEMA_VERSION, type BuiltDump } from '@sysdesign/run-dump';

import type { CriteriaDerivation } from '../core/ports';
import { exchangeFiles, json, withNewline } from './dump-files';

export function buildCriteriaDump(derivation: CriteriaDerivation): BuiltDump {
  const pipeline = `${derivation.pipeline.id}@${derivation.pipeline.version}`;
  const manifest = {
    schemaVersion: DUMP_SCHEMA_VERSION,
    runId: derivation.runId,
    kind: 'criteria' as const,
    pipeline,
    startedAt: derivation.startedAt,
    finishedAt: derivation.finishedAt,
    durationMs: Date.parse(derivation.finishedAt) - Date.parse(derivation.startedAt),
    llm: derivation.llm,
    git: derivation.git,
    criteria: derivation.criteria.length,
    diagnostic: derivation.diagnostic,
    exchangeCount: derivation.exchanges.length,
    note: 'Contains the goal and the model’s prose verbatim.',
  };
  return {
    runId: derivation.runId,
    files: [
      { path: 'manifest.json', content: json(manifest) },
      { path: '01-goal.md', content: withNewline(derivation.goal) },
      { path: '02-criteria.json', content: json(derivation.criteria) },
      { path: '03-pipeline.json', content: json(derivation.pipeline) },
      ...derivation.exchanges.flatMap(exchangeFiles),
    ],
    indexRow: `${JSON.stringify({
      runId: derivation.runId,
      kind: 'criteria',
      at: derivation.finishedAt,
      pipeline,
      criteria: derivation.criteria.length,
      exchangeCount: derivation.exchanges.length,
      model: derivation.llm.model,
    })}\n`,
  };
}
