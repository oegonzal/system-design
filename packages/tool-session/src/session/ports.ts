import type { InteractionAnswer, InteractionPrompt } from '@sysdesign/contracts';
import type { LoopClient } from '@sysdesign/loop-client';

import type { ToolCatalog } from '../catalog';

/** The person the session answers to: asked and waited for, or told and not. */
export interface OperatorPort {
  ask(prompt: InteractionPrompt, signal?: AbortSignal): Promise<InteractionAnswer>;
  notify(prompt: InteractionPrompt): Promise<void>;
}

/** Where the session says what happened, for whoever keeps a record beyond it. */
export interface SessionEventsPort {
  publish(topic: string, payload: unknown): Promise<void>;
}

export type Clock = () => Date;

export interface SessionLog {
  info(line: string): void;
  warn(line: string): void;
}

/** Everything a session is run with; a spec passes fakes for all of it. */
export interface SessionDeps {
  loop: LoopClient;
  catalog: ToolCatalog;
  operator: OperatorPort;
  events: SessionEventsPort;
  clock: Clock;
  log: SessionLog;
  /** How a wait is taken; a spec passes one that need not wait. */
  sleep?: (ms: number) => Promise<void>;
}
