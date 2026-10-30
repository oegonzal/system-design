import { memoryClientUnderTest } from '@sysdesign/agentic-memory-client/testing';

import { parseOptions, type Options } from '../cli';
import type { CliDeps, Io } from '../commands';
import type { IngestConfig } from '../config';
import {
  fixedClock,
  InMemoryLedger,
  InMemoryWriter,
  LOOP_URL,
  MEMORY_URL,
  sampleExperience,
  sampleStory,
  ScriptedSink,
  ScriptedStudio,
  scriptedReader,
} from './fakes';

/**
 * What the CLI specs share: argv read as the command line reads it, an `Io`
 * that keeps what was written, and every port a fake. Test code only, outside
 * the app build.
 */

const NOTES = `# Ada\n\n## Work\n\n- Translated the memoir.\n- Wrote Note G.`;

/** argv → options; a usage problem is thrown, since the spec meant to give a good command. */
export const parsed = (argv: string[]): Options => {
  const options = parseOptions(argv);
  if (options instanceof Error) throw options;
  return options;
};

/** An `Io` that keeps what was written to each stream. */
export const io = () => {
  const out: string[] = [];
  const errors: string[] = [];
  const sink: Io = { out: (t) => out.push(t), error: (t) => errors.push(t) };
  return { out, errors, sink };
};

/** The configuration the CLI specs run under: the loop sink, every service at a test address. */
export const ingestConfig = (overrides: Partial<IngestConfig> = {}): IngestConfig => ({
  loopUrl: LOOP_URL,
  studioUrl: 'http://studio.test',
  home: 'static/memory-ingest',
  subject: undefined,
  memoryUrl: MEMORY_URL,
  sink: { kind: 'loop' },
  ...overrides,
});

/** What a spec may hand in: any port, the ledger as the in-memory one, and the store the resolved sink stands for. */
type Overrides = Partial<Omit<CliDeps, 'ledger' | 'sink'>> & {
  ledger?: InMemoryLedger;
  /** The store the commands reach; a scripted loop sink unless given. */
  sinkAdapter?: ScriptedSink;
  /** What resolving the store does instead — a refusal to throw. */
  sink?: CliDeps['sink'];
};

/** Every port a fake, each reachable by the spec that wants to inspect it. */
export const cliDeps = (overrides: Overrides = {}) => {
  const { sinkAdapter, ...rest } = overrides;
  const scripted = sinkAdapter ?? new ScriptedSink();
  const ledger = overrides.ledger ?? new InMemoryLedger();
  const writer = new InMemoryWriter();
  const built: CliDeps = {
    config: ingestConfig(),
    cwd: '/work',
    reader: scriptedReader({ 'notes.md': NOTES }),
    sink: async () => scripted,
    ledger,
    clock: fixedClock(),
    studio: new ScriptedStudio([sampleExperience()], [sampleStory()]),
    writer,
    memory: memoryClientUnderTest().client,
    ...rest,
  };
  return { ...built, scripted, ledger, writer };
};
