import {
  assertModelProvider,
  describeModelProvider,
  readLlmConfig,
  type LlmConfig,
} from '@sysdesign/llm';
import type { LlmModelDto } from '@sysdesign/contracts';

import { runStaleAfterMs } from './modules/janitor/stale-after';

export type Command = 'serve' | 'run' | 'replay';

export interface Preflight {
  command: Command;
  /** The model the process will announce; null for a command that calls none. */
  model: LlmModelDto | null;
}

/** Which of the three entry points the argv names. */
export const commandOf = (argv: readonly string[]): Command =>
  argv[0] === 'replay' ? 'replay' : argv[0] === 'run' ? 'run' : 'serve';

/**
 * What a process must have before Nest boots. `serve` and `run` call a
 * model, so they need a valid stale threshold and a provider that will answer
 * — whichever `llm.config.json` names, asked by that provider's own check and
 * refused here saying how to fix it, never surfaced as a failed call minutes
 * into a run. `replay` reads recorded runs and needs neither. The check is
 * injectable so a spec never spawns a CLI nor reaches a network.
 */
export async function preflight(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  checkLogin: (config: LlmConfig) => Promise<void> = (config) => assertModelProvider(config),
  config: LlmConfig = readLlmConfig(),
): Promise<Preflight> {
  const command = commandOf(argv);
  if (command === 'replay') return { command, model: null };
  runStaleAfterMs(env);
  await checkLogin(config);
  return { command, model: describeModelProvider(config) };
}
