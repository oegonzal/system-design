import type { RunRecord } from '../core/contracts';
import { buildRunDump } from './build-run-dump';

/** A finished record with every field the quiet default, and the one file of a dump a spec reads. */
export const record = (overrides: Partial<RunRecord>): RunRecord => ({
  runId: '2026-09-06T00-00-00-000-abc123-quality',
  pipeline: 'tiny',
  status: 'complete',
  startedAt: '2026-09-06T00:00:00.000Z',
  finishedAt: '2026-09-06T00:00:01.000Z',
  heartbeatAt: '2026-09-06T00:00:01.000Z',
  llm: { model: 'test-model' },
  git: { branch: 'main', headSha: 'abc' },
  request: {
    goal: '# Goal\n\nDo it.',
    outputProvided: false,
    criteriaProvided: false,
    acceptAt: null,

    adoptedFrom: null,
    maxIterations: 3,
  },
  parentRunId: null,
  openedBy: null,
  recall: null,
  trace: null,
  exchanges: [],
  error: null,
  ...overrides,
});

export const content = (dump: ReturnType<typeof buildRunDump>, path: string): string => {
  const file = dump.files.find((candidate) => candidate.path === path);
  if (!file) throw new Error(`no file ${path}`);
  return file.content;
};
