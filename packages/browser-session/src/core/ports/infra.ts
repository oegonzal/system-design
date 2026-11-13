import type { DumpBytes, DumpFile } from '@sysdesign/run-dump';
import type { BrowserContext } from 'playwright';

/** A fresh id for each record the session writes and each question it puts: a session, a task, a decision, a prompt. */
export type Ids = () => string;

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

/**
 * A profile's sign-in as Playwright moves it between browsers: the cookies
 * and the local storage of every origin — and the IndexedDB stores, which
 * ride along unlisted by the type — in the shape `setStorageState` takes,
 * defined from Playwright's own types and never copied. The one form of a
 * sign-in that survives the move: a Chrome profile's cookies are encrypted
 * with a key the machine holds, so a copied profile opens signed out.
 */
export type StorageState = Exclude<Parameters<BrowserContext['setStorageState']>[0], string>;

/** What a profile's files were found to be before the browser opens on it. */
export type ProfileRestore =
  /** Its archive from the run before is in place: the same device, signed in. */
  | { kind: 'archived' }
  /** No archive, but an exported sign-in: a fresh profile, to be seeded with it once. */
  | { kind: 'seed'; state: StorageState }
  /** Neither: the profile as it is on this disk. */
  | { kind: 'none' };

/**
 * The files a session needs that live beyond this machine, moved before the
 * browser opens and after it closes: the profile, the exported sign-in a
 * fresh profile is seeded with, and the documents a mission uploads. Where
 * nothing lives beyond this machine the port does nothing, and the files are
 * the disk's as they always were.
 */
export interface SessionFiles {
  /** The profile's files put in place under the profiles dir — its archive over any stale directory — and what was found. */
  profile(name: string): Promise<ProfileRestore>;
  /** The profile's files kept for the next run, caches and the lock left out; only once the browser let go of them. */
  saveProfile(name: string): Promise<void>;
  /** Every document kept beyond this machine written under the documents dir. */
  documents(): Promise<void>;
}

/** The one question the session asks of the loop before it binds: is it there. */
export interface LoopProbe {
  health(): Promise<unknown>;
}
