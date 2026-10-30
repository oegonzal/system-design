import type {
  InteractionAnswer,
  InteractionPrompt,
  InteractionWithdrawn,
} from '@sysdesign/contracts';

/**
 * A question put to the operator, the same on every channel: the prompt the
 * notifications contracts describe — lettered choices, free text within a
 * length, slash commands — and what a bare Enter means at the terminal.
 */
export interface OperatorQuestion {
  prompt: InteractionPrompt;
  /** The command an empty line at the terminal stands for; null when it stands for none. */
  enter: string | null;
}

/** Why a question is withdrawn from a channel, as an abort carries it: `controller.abort(withdrawal)`. */
export type Withdrawal = Omit<InteractionWithdrawn, 'promptId'>;

/** One way to reach the operator: it asks, and answers with what the person chose, typed or commanded. */
export interface OperatorChannel {
  readonly name: string;
  /**
   * Rejects with `QuestionWithdrawn` once the signal aborts, after showing
   * the withdrawal the abort carries where the question was asked.
   */
  ask(question: OperatorQuestion, signal?: AbortSignal): Promise<InteractionAnswer>;
  /** The answer this channel gave raced another and was not the one taken: show that where it was given. */
  unused(question: OperatorQuestion, withdrawal: Withdrawal): Promise<void>;
}

/** The operator: asked on every channel, and told what the session is doing where a person reads it. */
export interface OperatorPort extends OperatorChannel {
  notify(text: string): void;
}

/** A channel's ask that ended because the question was withdrawn from it — never a failure of the channel. */
export class QuestionWithdrawn extends Error {
  override readonly name = 'QuestionWithdrawn';
  constructor(channel: string) {
    super(`the question was withdrawn from ${channel}`);
  }
}

/** The operator stopped a question at the terminal — Ctrl-C — rather than answer it. */
export class OperatorInterrupted extends Error {
  override readonly name = 'OperatorInterrupted';
  constructor() {
    super('interrupted at the terminal');
  }
}

// The operator's interrupt.

/**
 * Ctrl-C as the operator's word, through a port: the engine ends the session
 * after the step in flight, through every closing write, and a spec can press
 * it. How a second press is handled is the adapter's.
 */
export interface StopSignal {
  /** Calls the handler when the operator asks the process to stop; answers how to stop listening. */
  onStop(handler: () => void): () => void;
}
