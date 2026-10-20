/**
 * An interviewer's turn as an artifact: one reply per indexed item, each a
 * line a lens can cite as `reply.N`, with the criteria it gave away printed
 * beside it so a restraint critic reads the disclosure as the reply states it.
 */
import { interviewTurnOutputSchema, type InterviewTurnOutput } from '@sysdesign/contracts';

import { numbered, type OutputShape } from '../../core/contracts';

const disclosure = (ids: readonly string[]): string =>
  ids.length === 0 ? '' : ` (discloses ${ids.join(', ')})`;

export const interviewTurnOutput: OutputShape<InterviewTurnOutput> = {
  schema: interviewTurnOutputSchema,

  locate: (output) => numbered('reply', output.replies, (reply) => `reply to ${reply.to}`),

  render: (output) =>
    output.replies.length === 0
      ? '(no replies)'
      : output.replies
          .map(
            (reply, index) =>
              `[reply.${index + 1}] to ${reply.to}: ${reply.text}${disclosure(reply.disclosesCriterionIds)}`,
          )
          .join('\n'),
};
