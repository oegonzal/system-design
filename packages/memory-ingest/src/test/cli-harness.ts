import { parseOptions, type CliDeps, type Io, type Options } from '../cli';
import {
  fixedClock,
  InMemoryLedger,
  InMemoryWriter,
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

/** Every port a fake, each reachable by the spec that wants to inspect it. */
export const cliDeps = (overrides: Partial<CliDeps> = {}) => {
  const scripted = new ScriptedSink();
  const ledger = new InMemoryLedger();
  const writer = new InMemoryWriter();
  const built: CliDeps = {
    config: {
      loopUrl: 'http://loop.test',
      studioUrl: 'http://studio.test',
      home: 'static/memory-ingest',
      subject: undefined,
    },
    cwd: '/work',
    reader: scriptedReader({ 'notes.md': NOTES }),
    sink: scripted,
    ledger,
    clock: fixedClock(),
    loopUrl: 'http://loop.test',
    studio: new ScriptedStudio([sampleExperience()], [sampleStory()]),
    writer,
    ...overrides,
  };
  return { ...built, scripted, memory: ledger, writer };
};
