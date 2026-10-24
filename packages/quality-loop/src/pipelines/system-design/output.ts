/**
 * The system-design answer: a compact structured design a model can produce in
 * one reply under the subscription client's output cap, and a judge can cite
 * part by part. Ids are positional and engine-assigned. Every bound is what
 * the producer is asked for, at or above what it has measurably written
 * (`measured.json`, held by the spec): a string past its target is kept and
 * noted, a list past its ceiling trimmed from its end — never a lost answer.
 */
import { bound, bounded } from '@sysdesign/contracts';
import { z } from 'zod';

import { numbered, numberedSection, type OutputShape } from '../../core/contracts';

const designAnswerSchema = z.strictObject({
  summary: bounded.text(bound(1300), {
    min: 1,
    description:
      'The shape of the system in 3–5 sentences: the hardest problem and how the design meets it.',
  }),
  assumptions: bounded.list(bound(8, 'list'), bounded.text(bound(230)), {
    description: 'What the goal left unsaid and you decided.',
  }),
  components: bounded.list(
    bound(11, 'list'),
    z.strictObject({
      name: bounded.text(bound(60), { min: 1 }),
      responsibility: bounded.text(bound(450), { min: 1 }),
      technology: bounded
        .text(bound(120), { description: 'A concrete choice, or null if undecided.' })
        .nullable(),
    }),
    { min: 1 },
  ),
  flows: bounded.list(
    bound(7, 'list'),
    z.strictObject({
      name: bounded.text(bound(120), { min: 1 }),
      steps: bounded.list(bound(8, 'list'), bounded.text(bound(450)), { min: 1 }),
    }),
    { description: 'One per functional requirement: the components a request touches, in order.' },
  ),
  dataModel: bounded.list(bound(9, 'list'), bounded.text(bound(550)), {
    description: 'Entities, keys and where each lives.',
  }),
  tradeoffs: bounded.list(
    bound(8, 'list'),
    z.strictObject({
      decision: bounded.text(bound(210)),
      rationale: bounded.text(bound(580)),
      alternative: bounded.text(bound(290)).nullable(),
    }),
  ),
  risks: bounded.list(
    bound(8, 'list'),
    z.strictObject({ risk: bounded.text(bound(200)), mitigation: bounded.text(bound(460)) }),
  ),
  capacity: bounded.list(
    bound(9, 'list'),
    z.strictObject({ metric: bounded.text(bound(80)), estimate: bounded.text(bound(350)) }),
    { description: 'Back-of-envelope sizing against the stated scale.' },
  ),
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
