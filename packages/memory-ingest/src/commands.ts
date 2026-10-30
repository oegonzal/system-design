import type { MemoryClient } from '@sysdesign/agentic-memory-client';

import type { IngestConfig } from './config';
import type {
  Clock,
  DocumentReader,
  DocumentWriter,
  IngestLedger,
  IngestSink,
  StudioSource,
} from './core/ports';

/**
 * What every command is given: the ports, and the streams it answers on.
 * `cli.ts` wires the real adapters into these; the specs hand in fakes.
 */

/** What a command writes to and how it is answered. */
export interface Io {
  out(text: string): void;
  error(text: string): void;
}

export interface CliDeps {
  config: IngestConfig;
  cwd: string;
  reader: DocumentReader;
  /**
   * The store the manifest commands post to and act on, resolved by the
   * command that reaches it: a space is checked against its host first, so a
   * command that never reaches the store — a plain `status`, the studio
   * export, the space commands — asks nothing of it.
   */
  sink: () => Promise<IngestSink>;
  ledger: IngestLedger;
  clock: Clock;
  /** Asked between chunks; true halts the run with everything it has recorded. */
  interrupted?: () => boolean;
  studio: StudioSource;
  writer: DocumentWriter;
  /** The memory host, for the owner's space commands. */
  memory: MemoryClient;
}

export const print = (io: Io, json: boolean, raw: unknown, text: string): void =>
  io.out(json ? JSON.stringify(raw, null, 2) : text);
