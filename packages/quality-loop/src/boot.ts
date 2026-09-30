import { describeModelProvider } from '@sysdesign/llm';
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
 * model, so they need a provider and a valid stale threshold — refused here
 * with the variables named, never surfaced as a dependency-injection stack
 * halfway through boot. `replay` reads recorded runs and needs neither.
 */
export function preflight(argv: readonly string[], env: NodeJS.ProcessEnv): Preflight {
  const command = commandOf(argv);
  if (command === 'replay') return { command, model: null };
  const model = describeModelProvider(env);
  runStaleAfterMs(env);
  return { command, model };
}
