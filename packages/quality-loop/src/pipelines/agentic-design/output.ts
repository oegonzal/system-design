/**
 * The agentic-workflow answer: the roles a workflow is made of, what each hands
 * the next, and the rules that decide. Compact enough for one reply under the
 * subscription client's output cap, and addressable part by part.
 *
 * Only three fields require a non-empty value — `roles[].name` and a contract's
 * `from` and `to` — because those are the names other sections point at, and a
 * dangling reference is a broken artifact rather than a weak one. Everywhere
 * else emptiness is a defect for a critic to name, deliberately not a schema
 * violation: there is no retry, so a single empty string would discard the
 * whole answer. It already did once. For the same reason every length bound
 * sits above what the producer has measurably written (the spec holds the
 * measurements): a string past its bound is a miss, never cut to fit.
 *
 * `roles` declare what they consume and produce; `contracts` declare the
 * hand-offs between them. That is redundant on purpose — the redundancy is what
 * makes a mismatch visible. A design whose second role consumes something no
 * contract carries has a defect a critic can point at, which is impossible when
 * only components and free-text steps are modelled.
 */
import { z } from 'zod';

import { numbered, numberedSection, type OutputShape } from '../../core/contracts';

export const agenticDesignSchema = z.strictObject({
  summary: z
    .string()
    .min(1)
    .max(1600)
    .describe(
      'The shape of the workflow in 3–5 sentences: the hardest thing about it and how the design meets it.',
    ),
  assumptions: z
    .array(z.string().max(220))
    .max(8)
    .describe('What the brief left unsaid and you decided.'),
  roles: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(60),
        responsibility: z.string().max(340).describe('The one thing this role owns.'),
        consumes: z.string().max(200).describe('What it requires to do its work.'),
        produces: z.string().max(220).describe('What it hands on, and in what shape.'),
      }),
    )
    .min(1)
    .max(10)
    .describe('The agents, tools and services the workflow is made of.'),
  contracts: z
    .array(
      z.strictObject({
        from: z.string().min(1).max(60).describe('The role that produces. A named role.'),
        to: z.string().min(1).max(60).describe('The role that consumes. A named role.'),
        payload: z.string().max(200).describe('What crosses the boundary.'),
        guarantee: z
          .string()
          .max(360)
          .describe('What the receiver may assume, including on failure.'),
      }),
    )
    .max(12)
    .describe('The hand-offs between roles, one per edge.'),
  flows: z
    .array(
      z.strictObject({
        name: z.string().max(120),
        steps: z.array(z.string().max(340)).max(8),
      }),
    )
    .max(8)
    .describe('One per capability: the roles the work passes through, in order.'),
  policies: z
    .array(
      z.strictObject({
        name: z.string().max(80),
        decides: z.string().max(260).describe('What this rule settles.'),
        declaredAs: z.string().max(280).describe('Where it lives as data rather than code.'),
      }),
    )
    .max(8)
    .describe('The thresholds, gates and routes a decision follows.'),
  memory: z
    .array(
      z.strictObject({
        what: z.string().max(200).describe('What is kept or retrieved.'),
        shape: z.string().max(250).describe('The form it is stored in.'),
        usedBy: z.string().max(170).describe('Which role reads it, and when.'),
      }),
    )
    .max(6)
    .describe('What the workflow learns or looks up, and in what form.'),
  extensibility: z
    .array(
      z.strictObject({
        change: z.string().max(160).describe('A change someone will want.'),
        requires: z.string().max(360).describe('What it costs — ideally data, not code.'),
      }),
    )
    .max(6),
  tradeoffs: z
    .array(
      z.strictObject({
        decision: z.string().max(180),
        rationale: z.string().max(340),
        alternative: z.string().max(210).nullable(),
      }),
    )
    .max(8),
  risks: z
    .array(z.strictObject({ risk: z.string().max(200), mitigation: z.string().max(340) }))
    .max(8),
});
export type AgenticDesign = z.infer<typeof agenticDesignSchema>;

export const agenticDesignOutput: OutputShape<AgenticDesign> = {
  schema: agenticDesignSchema,

  locate: (answer) => [
    { id: 'summary', label: 'Summary' },
    ...numbered('assumption', answer.assumptions, (item) => item),
    ...numbered('role', answer.roles, (item) => item.name),
    ...numbered('contract', answer.contracts, (item) => `${item.from} → ${item.to}`),
    ...numbered('flow', answer.flows, (item) => item.name),
    ...numbered('policy', answer.policies, (item) => item.name),
    ...numbered('memory', answer.memory, (item) => item.what),
    ...numbered('extension', answer.extensibility, (item) => item.change),
    ...numbered('tradeoff', answer.tradeoffs, (item) => item.decision),
    ...numbered('risk', answer.risks, (item) => item.risk),
  ],

  render: (answer) =>
    [
      `[summary] ${answer.summary}`,
      ...numberedSection('Assumptions', 'assumption', answer.assumptions, (item) => item),
      ...numberedSection(
        'Roles',
        'role',
        answer.roles,
        (item) =>
          `${item.name} — ${item.responsibility} | consumes: ${item.consumes} | produces: ${item.produces}`,
      ),
      ...numberedSection(
        'Contracts',
        'contract',
        answer.contracts,
        (item) => `${item.from} → ${item.to}: ${item.payload} | guarantee: ${item.guarantee}`,
      ),
      ...numberedSection(
        'Flows',
        'flow',
        answer.flows,
        (item) => `${item.name}: ${item.steps.join(' → ')}`,
      ),
      ...numberedSection(
        'Policies',
        'policy',
        answer.policies,
        (item) => `${item.name} — decides: ${item.decides} | declared as: ${item.declaredAs}`,
      ),
      ...numberedSection(
        'Memory',
        'memory',
        answer.memory,
        (item) => `${item.what} — shape: ${item.shape} | read by: ${item.usedBy}`,
      ),
      ...numberedSection(
        'Extensibility',
        'extension',
        answer.extensibility,
        (item) => `${item.change} — requires: ${item.requires}`,
      ),
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
    ].join('\n'),
};
