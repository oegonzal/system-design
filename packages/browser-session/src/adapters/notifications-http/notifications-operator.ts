import {
  INTERACTION_TOPICS,
  type InteractionAnswer,
  type InteractionPrompt,
} from '@sysdesign/contracts';
import { BusCallAborted, type BusClient } from '@sysdesign/notifications-client';

import {
  QuestionWithdrawn,
  type OperatorChannel,
  type OperatorQuestion,
  type Withdrawal,
} from '../../core/ports';

/** What the channel needs of the notifications client: put a prompt, and wait for its answer. */
export interface Asker {
  ask(prompt: InteractionPrompt, signal?: AbortSignal): Promise<InteractionAnswer>;
}

/** How the session names itself on what it publishes. */
export const SESSION_SOURCE = 'browser-session';

/**
 * The operator reached through the notifications service: the question goes
 * out as an interaction prompt on every channel the service runs — which
 * channels those are is the service's to know, never this package's — and the
 * answer comes back as the event that names it. A withdrawal rides the abort
 * and is published by the client; one for an answer that raced another and
 * lost is published here.
 */
export class NotificationsOperator implements OperatorChannel {
  readonly name = 'notifications';

  constructor(
    private readonly asker: Asker,
    private readonly bus: Pick<BusClient, 'publish'>,
  ) {}

  async ask(question: OperatorQuestion, signal?: AbortSignal): Promise<InteractionAnswer> {
    try {
      return await this.asker.ask(question.prompt, signal);
    } catch (error) {
      if (error instanceof BusCallAborted) throw new QuestionWithdrawn(this.name);
      throw error;
    }
  }

  async unused(question: OperatorQuestion, withdrawal: Withdrawal): Promise<void> {
    await this.bus.publish({
      topic: INTERACTION_TOPICS.withdrawn,
      source: SESSION_SOURCE,
      payload: { promptId: question.prompt.id, ...withdrawal },
    });
  }
}
