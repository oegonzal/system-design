/**
 * The system-design answer: a compact structured design a model can produce in
 * one reply under the subscription client's output cap, and a judge can cite
 * part by part. Ids are positional and engine-assigned.
 */
import { z } from 'zod';

import { numbered, numberedSection, type OutputShape } from '../../core/contracts';

export const designAnswerSchema = z.strictObject({
  summary: z
    .string()
    .min(1)
    .max(600)
    .describe(
      'The shape of the system in 3–5 sentences: the hardest problem and how the design meets it.',
    ),
  assumptions: z
    .array(z.string().max(160))
    .max(8)
    .describe('What the goal left unsaid and you decided.'),
  components: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(60),
        responsibility: z.string().min(1).max(300),
        technology: z
          .string()
          .max(80)
          .nullable()
          .describe('A concrete choice, or null if undecided.'),
      }),
    )
    .min(1)
    .max(10),
  flows: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(120),
        steps: z.array(z.string().max(200)).min(1).max(8),
      }),
    )
    .max(6)
    .describe('One per functional requirement: the components a request touches, in order.'),
  dataModel: z.array(z.string().max(200)).max(8).describe('Entities, keys and where each lives.'),
  tradeoffs: z
    .array(
      z.strictObject({
        decision: z.string().max(160),
        rationale: z.string().max(300),
        alternative: z.string().max(160).nullable(),
      }),
    )
    .max(8),
  risks: z
    .array(z.strictObject({ risk: z.string().max(160), mitigation: z.string().max(300) }))
    .max(8),
  capacity: z
    .array(z.strictObject({ metric: z.string().max(80), estimate: z.string().max(160) }))
    .max(8)
    .describe('Back-of-envelope sizing against the stated scale.'),
});
export type DesignAnswer = z.infer<typeof designAnswerSchema>;

export const designAnswerOutput: OutputShape<DesignAnswer> = {
  schema: designAnswerSchema,

  locate: (answer) => [
    { id: 'summary', label: 'Summary' },
    ...numbered('assumption', answer.assumptions, (item) => item),
    ...numbered('component', answer.components, (item) => item.name),
    ...numbered('flow', answer.flows, (item) => item.name),
    ...numbered('data', answer.dataModel, (item) => item),
    ...numbered('tradeoff', answer.tradeoffs, (item) => item.decision),
    ...numbered('risk', answer.risks, (item) => item.risk),
    ...numbered('capacity', answer.capacity, (item) => item.metric),
  ],

  render: (answer) =>
    [
      `[summary] ${answer.summary}`,
      ...numberedSection('Assumptions', 'assumption', answer.assumptions, (item) => item),
      ...numberedSection(
        'Components',
        'component',
        answer.components,
        (item) =>
          `${item.name} — ${item.responsibility}${item.technology ? ` (${item.technology})` : ''}`,
      ),
      ...numberedSection(
        'Flows',
        'flow',
        answer.flows,
        (item) => `${item.name}: ${item.steps.join(' → ')}`,
      ),
      ...numberedSection('Data model', 'data', answer.dataModel, (item) => item),
      ...numberedSection(
        'Trade-offs',
        'tradeoff',
        answer.tradeoffs,
        (item) =>
          `${item.decision} — ${item.rationale}${item.alternative ? ` (alternative: ${item.alternative})` : ''}`,
      ),
      ...numberedSection(
        'Risks',
        'risk',
        answer.risks,
        (item) => `${item.risk} — mitigation: ${item.mitigation}`,
      ),
      ...numberedSection(
        'Capacity',
        'capacity',
        answer.capacity,
        (item) => `${item.metric}: ${item.estimate}`,
      ),
    ].join('\n'),
};
