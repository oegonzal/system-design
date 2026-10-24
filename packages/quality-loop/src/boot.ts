import {
  assertModelProvider,
  describeLlmSource,
  describeModelProvider,
  readChosenLlmConfig,
  type ChosenLlmConfig,
} from '@sysdesign/llm';
import type { LlmModelDto } from '@sysdesign/contracts';

import { runStaleAfterMs } from './modules/janitor/stale-after';

export type Command = 'serve' | 'run' | 'replay';

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

/** Which of the three entry points the argv names. */
const commandOf = (argv: readonly string[]): Command =>
  argv[0] === 'replay' ? 'replay' : argv[0] === 'run' ? 'run' : 'serve';

/**
 * What a process must have before Nest boots. `serve` and `run` call a
 * model, so they need a valid stale threshold and a provider that will answer
 * — whichever the chosen `config/llm` file names, asked by that provider's own check and
 * refused here saying how to fix it, never surfaced as a failed call minutes
 * into a run. `replay` reads recorded runs and needs neither. The check is
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
  if (command === 'replay') return { command, model: null, source: null };
  runStaleAfterMs(env);
  await checkLogin(chosen);
  return {
    command,
    model: describeModelProvider(chosen.config),
    source: describeLlmSource(chosen),
  };
}
