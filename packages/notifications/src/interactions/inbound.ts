import {
  describeReply,
  INTERACTION_TOPICS,
  readReply,
  type InteractionAnswer,
} from '@sysdesign/contracts';

import type { Bus } from '../bus';
import type { InboundMessage, InboundSink, InboundVerdict } from '../channels/port';
import { outcomeText } from './outcome';
import type { InteractionRecord, InteractionStore } from './ports';

/** How the service names itself on the events it publishes. */
export const SERVICE_SOURCE = 'notifications';

const refused = (text: string): InboundVerdict => ({ kind: 'refused', text });

/**
 * What people send back, read against the prompt it answers. A message finds
 * its prompt by the message it replies to, else as the one prompt open on its
 * address — never by reading its words. It is then read the one declared way,
 * `readReply`; what that refuses goes back with how the prompt is answered and
 * the prompt stays open. An accepted reply is published as the prompt's one
 * answer before the prompt is closed, so an answer is never lost to a crash
 * between the two, and a message the channel hands over twice is known by its
 * reference and ignored.
 */
export class Inbound implements InboundSink {
  constructor(
    private readonly bus: Bus,
    private readonly store: InteractionStore,
    private readonly now: () => Date,
  ) {}

  async receive(message: InboundMessage): Promise<InboundVerdict> {
    if ((await this.store.answeredBy(message.channel, message.ref)) !== null) {
      return { kind: 'ignored' };
    }
    const found = await this.promptFor(message);
    if (found === 'none') return refused('Nothing is waiting for an answer.');
    if (found === 'several') {
      return refused('Several questions are waiting: reply to the one you are answering.');
    }
    if (found.state !== 'open') return refused(`That question is closed. ${outcomeText(found)}.`);
    const reading = readReply(found.prompt, message.text);
    if (reading.kind === 'refused') return refused(reading.reason);
    const answer: InteractionAnswer = {
      promptId: found.prompt.id,
      reply: reading.reply,
      via: { channel: message.channel, ref: message.ref },
    };
    await this.bus.publish(
      { topic: INTERACTION_TOPICS.answered, source: SERVICE_SOURCE, payload: answer },
      'service',
    );
    await this.store.close(found.prompt.id, { kind: 'answered', answer }, this.now());
    return { kind: 'accepted', text: `Taken: ${describeReply(found.prompt, reading.reply)}.` };
  }

  private async promptFor(
    message: InboundMessage,
  ): Promise<InteractionRecord | 'none' | 'several'> {
    if (message.inReplyTo !== null) {
      const replied = await this.store.byMessage(
        message.channel,
        message.address,
        message.inReplyTo,
      );
      if (replied !== null) return replied;
    }
    const open = await this.store.openAt(message.channel, message.address);
    const [only, ...others] = open;
    if (only === undefined) return 'none';
    return others.length > 0 ? 'several' : only;
  }
}
