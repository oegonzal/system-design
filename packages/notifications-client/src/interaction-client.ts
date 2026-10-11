import {
  INTERACTION_TOPICS,
  interactionAnswerSchema,
  interactionWithdrawnSchema,
  type InteractionAnswer,
  type InteractionPrompt,
  type InteractionWithdrawn,
} from '@sysdesign/contracts';

import type { BusClient } from './bus-client';
import { BusCallAborted, PromptExpired } from './bus-errors';

/** Why a prompt is withdrawn, as an abort carries it: `controller.abort({ reason, note })`. */
export type Withdrawal = Omit<InteractionWithdrawn, 'promptId'>;

const ABANDONED: Withdrawal = { reason: 'abandoned', note: null };

/** The withdrawal an abort carries, else that its asker stopped waiting. */
const withdrawalOf = (reason: unknown): Withdrawal => {
  const parsed = interactionWithdrawnSchema.omit({ promptId: true }).safeParse(reason);
  return parsed.success ? parsed.data : ABANDONED;
};

export interface InteractionOptions {
  /** How the asker names itself on what it publishes. */
  source: string;
  /** How long one pull waits for the answer before asking again; within the service's own limit. */
  pullWaitMs: number;
  /** The most events one pull takes: its own prompt's, and every other asker's it passes over. */
  eventsPerPull: number;
}

/**
 * Asking a person through the notifications service, for any program: a
 * prompt goes out on every channel the service runs, and the answer comes back
 * as the one event that names it. The asker's subscription is made before the
 * prompt is published, so the answer cannot slip past it, and removed once
 * the ask settles. An abort withdraws the prompt with the reason it carries —
 * another channel answered first, a newer prompt replaces it — so every
 * channel shows it closed; an expiry ends the ask as `PromptExpired`.
 */
export class InteractionClient {
  constructor(
    private readonly bus: BusClient,
    private readonly options: InteractionOptions,
  ) {}

  async ask(prompt: InteractionPrompt, signal?: AbortSignal): Promise<InteractionAnswer> {
    const name = `ask.${prompt.id}`;
    await this.bus.subscribe(name, {
      topics: [INTERACTION_TOPICS.answered, INTERACTION_TOPICS.withdrawn],
    });
    try {
      await this.bus.publish({
        topic: INTERACTION_TOPICS.prompted,
        source: this.options.source,
        payload: prompt,
      });
      return await this.answerTo(prompt, name, signal);
    } catch (error) {
      if (signal?.aborted !== true) throw error;
      await this.bus.publish({
        topic: INTERACTION_TOPICS.withdrawn,
        source: this.options.source,
        payload: { promptId: prompt.id, ...withdrawalOf(signal.reason) },
      });
      throw error instanceof BusCallAborted ? error : new BusCallAborted('ask');
    } finally {
      await this.bus.unsubscribe(name).catch(() => undefined);
    }
  }

  private async answerTo(
    prompt: InteractionPrompt,
    name: string,
    signal?: AbortSignal,
  ): Promise<InteractionAnswer> {
    for (;;) {
      if (signal?.aborted === true) throw new BusCallAborted('ask');
      const events = await this.bus.pull(
        name,
        { waitMs: this.options.pullWaitMs, max: this.options.eventsPerPull },
        signal,
      );
      for (const event of events) {
        await this.bus.ack(name, event.seq);
        if (event.topic === INTERACTION_TOPICS.answered) {
          const answer = interactionAnswerSchema.parse(event.payload);
          if (answer.promptId === prompt.id) return answer;
        } else {
          const withdrawn = interactionWithdrawnSchema.parse(event.payload);
          if (withdrawn.promptId === prompt.id && withdrawn.reason === 'expired') {
            throw new PromptExpired(prompt.id);
          }
        }
      }
    }
  }
}
