/**
 * What the fake loop recalls for a run that asks: two fixed lessons, curated
 * by a recall run named after the run itself, so a spec or a browser test can
 * assert the exact list the coach panel shows. Deterministic on purpose —
 * there is no store behind the fake, only the shape the real loop records.
 */
import { recallOf, type RecalledLessonDto, type RunRecallDto } from '@sysdesign/contracts';

export const FAKE_RECALLED_LESSONS: readonly RecalledLessonDto[] = [
  {
    ref: 'm1',
    serves: 'the read path',
    insight: 'Put a cache in front of the primary database before adding read replicas.',
    caveat: null,
    text: 'When reads dominate, cache before you replicate.',
    sourceRunId: 'fake-earlier-run',
  },
  {
    ref: 'm2',
    serves: 'failure handling',
    insight: 'Say what the queue absorbs when the downstream service slows down.',
    caveat: 'learned on a different prompt',
    text: 'Name the failure a queue absorbs, or it absorbs nothing.',
    sourceRunId: 'fake-earlier-run',
  },
];

/** The recall run the fake names for a run: one per run, never a real row. */
export const fakeRecallRunId = (runId: string): string => `${runId}-recall`;

/** What a run that asked to recall settles to unless a spec says otherwise. */
export const fakeRecalled = (runId: string): RunRecallDto =>
  recallOf(FAKE_RECALLED_LESSONS, fakeRecallRunId(runId));
