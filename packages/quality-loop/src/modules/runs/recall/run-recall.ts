/**
 * The runs module's extension point for recall, and how a recall reaches the
 * engine. A run that asks to recall gets its lessons from whatever recall is
 * bound in the slot — the memory module binds one at init — and hands them to
 * the engine as advisory memories for its producer.
 *
 * Why a slot and not an injected provider: the memory module already depends
 * on this one (it composes pipelines through `RunsService`), so this module
 * importing it back would close a cycle. The dependency stays one way —
 * memory → runs — which leaves the slot optional: a composition of the runs
 * module without the memory module has nothing bound, and a run there that
 * asks to recall is recorded `skipped` with `recall-unavailable` and goes on
 * (QL-32 boots exactly that composition). Every shipped process that starts
 * runs — the served app and the `run` CLI — boots `AppModule`, which binds
 * one; replay boots neither module and starts no run.
 */
import type {
  QualityRunDto,
  RecalledLessonDto,
  RunRecallDto,
  StartQualityRunRequest,
} from '@sysdesign/contracts';

import type { AdvisoryMemory } from '../../../core/ports';

/**
 * Where a run's recall is written as it moves — the recall run's id once it
 * opens, then the outcome — replacing the last, and only while the row is
 * still `running`. The runs module's own port, beside the core's
 * `RunRepository`: the engine never records, reads or interprets a recall,
 * so its ports do not name one.
 */
export interface RunRecallRecorder {
  recordRecall(runId: string, recall: RunRecallDto): Promise<void>;
}

/** Run one child to completion — the runs service's own `execute`, so the child is an ordinary recorded run. */
export type ChildRunner = (request: StartQualityRunRequest) => Promise<QualityRunDto>;

export interface RunRecall {
  /**
   * Lessons for a goal, curated by a run `execute` opens — or the closed
   * reason there are none. It may throw: the runs service records that as
   * `errored`, and the run goes on without lessons.
   */
  recall(goal: string, execute: ChildRunner): Promise<RunRecallDto>;
}

/** Where a module that can recall binds itself. One binding per process. */
export class RunRecallSlot {
  private recall: RunRecall | null = null;

  bind(recall: RunRecall): void {
    if (this.recall !== null && this.recall !== recall) {
      throw new Error('a recall is already bound to the runs module');
    }
    this.recall = recall;
  }

  /** The bound recall, or null when this process has none. */
  get bound(): RunRecall | null {
    return this.recall;
  }
}

/** One recalled lesson as the producer reads it: the curator's insight, what it serves, and how it differs. */
const lessonText = ({ insight, serves, caveat }: RecalledLessonDto): string =>
  `${insight} — serves: ${serves}${caveat ? `; caveat: ${caveat}` : ''}`;

/** What the engine is handed: every recalled lesson, by the ref the record cites it under. */
export const briefingOf = (lessons: readonly RecalledLessonDto[]): AdvisoryMemory[] =>
  lessons.map((lesson) => ({ ref: lesson.ref, text: lessonText(lesson) }));
