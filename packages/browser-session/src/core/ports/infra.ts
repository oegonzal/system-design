import type { DumpBytes, DumpFile } from '@sysdesign/run-dump';

export interface GoalDocument {
  path: string;
  markdown: string;
  /** sha256 of the markdown. */
  hash: string;
}

export interface GoalSource {
  read(path: string): Promise<GoalDocument>;
}

export interface Clock {
  now(): Date;
  /**
   * Runs `then` once, when `when` has come as this clock tells time; the
   * function returned cancels it. How the session's time limit reaches a step
   * waiting on the operator: the rails are read between steps, and a step
   * blocked on a question has no between.
   */
  at(when: Date, then: () => void): () => void;
}

/** One session's dump folder: files land as they come, the index row once at the end. */
export interface DumpSink {
  runId: string;
  write(files: readonly (DumpFile | DumpBytes)[]): void;
  index(row: string): void;
}

export interface DumpStore {
  open(now: Date): DumpSink;
}
