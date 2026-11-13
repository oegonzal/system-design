import {
  assertModelProvider,
  describeLlmSource,
  describeModelProvider,
  readChosenLlmConfig,
  type ChosenLlmConfig,
} from '@sysdesign/llm';
import type { LlmModelDto } from '@sysdesign/contracts';

import { runStaleAfterMs } from './modules/janitor/stale-after';

export type Command = 'serve' | 'run' | 'replay' | 'import-qdrant';

/** The commands that call no model: they read and write records, and need no login. */
const MODELLESS: ReadonlySet<Command> = new Set<Command>(['replay', 'import-qdrant']);

export interface Preflight {
  command: Command;
  /** The model the process will announce; null for a command that calls none. */
  model: LlmModelDto | null;
  /**
   * Which configuration chose that model, for the boot to say out loud. A
   * choice read once at boot is invisible afterwards, and a file edited under
   * a running process looks exactly like a file that was ignored — which cost
   * a session that ran an hour against a provider nobody had selected.
   */
  source: string | null;
}

/** Which of the four entry points the argv names. */
const commandOf = (argv: readonly string[]): Command => {
  if (argv[0] === 'replay') return 'replay';
  if (argv[0] === 'run') return 'run';
  if (argv[0] === 'import-qdrant') return 'import-qdrant';
  return 'serve';
};

/**
 * What a process must have before Nest boots. `serve` and `run` call a
 * model, so they need a valid stale threshold and a provider that will answer
 * — whichever the chosen `config/llm` file names, asked by that provider's own check and
 * refused here saying how to fix it, never surfaced as a failed call minutes
 * into a run. `replay` reads recorded runs and `import-qdrant` copies stored
 * points, and neither calls a model, so neither needs any of it. The check is
 * injectable so a spec never spawns a CLI nor reaches a network.
 */
export async function preflight(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  checkLogin: (chosen: ChosenLlmConfig) => Promise<void> = (chosen) =>
    assertModelProvider(chosen.config),
  chosen: ChosenLlmConfig = readChosenLlmConfig(),
): Promise<Preflight> {
  const command = commandOf(argv);
  if (MODELLESS.has(command)) return { command, model: null, source: null };
  runStaleAfterMs(env);
  await checkLogin(chosen);
  return {
    command,
    model: describeModelProvider(chosen.config),
    source: describeLlmSource(chosen),
  };
}
