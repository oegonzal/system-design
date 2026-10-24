/**
 * The agentic-workflow answer: the roles a workflow is made of, what each hands
 * the next, and the rules that decide. Compact enough for one reply under the
 * subscription client's output cap, and addressable part by part.
 *
 * Only three fields require a non-empty value — `roles[].name` and a contract's
 * `from` and `to` — because those are the names other sections point at, and a
 * dangling reference is a broken artifact rather than a weak one. Everywhere
 * else emptiness is a defect for a critic to name, deliberately not a schema
 * violation: an empty required string is a structural fault that refuses the
 * whole reply — one once discarded a whole answer. Every bound is what the
 * producer is asked for, at or above what it has measurably written
 * (`measured.json`, held by the spec): a string past its target is kept and
 * noted, a list past its ceiling trimmed from its end — never a lost answer.
 *
 * `roles` declare what they consume and produce; `contracts` declare the
 * hand-offs between them. That is redundant on purpose — the redundancy is what
 * makes a mismatch visible. A design whose second role consumes something no
 * contract carries has a defect a critic can point at, which is impossible when
 * only components and free-text steps are modelled.
 */
import { bound, bounded } from '@sysdesign/contracts';
import { z } from 'zod';

import { numbered, numberedSection, type OutputShape } from '../../core/contracts';

const agenticDesignSchema = z.strictObject({
  summary: bounded.text(bound(1600), {
    min: 1,
    description:
      'The shape of the workflow in 3–5 sentences: the hardest thing about it and how the design meets it.',
  }),
  assumptions: bounded.list(bound(8, 'list'), bounded.text(bound(220)), {
    description: 'What the brief left unsaid and you decided.',
  }),
  roles: bounded.list(
    bound(10, 'list'),
    z.strictObject({
      name: bounded.text(bound(60), { min: 1 }),
      responsibility: bounded.text(bound(340), { description: 'The one thing this role owns.' }),
      consumes: bounded.text(bound(200), { description: 'What it requires to do its work.' }),
      produces: bounded.text(bound(220), { description: 'What it hands on, and in what shape.' }),
    }),
    { min: 1, description: 'The agents, tools and services the workflow is made of.' },
  ),
  contracts: bounded.list(
    bound(13, 'list'),
    z.strictObject({
      from: bounded.text(bound(60), {
        min: 1,
        description: 'The role that produces. A named role.',
      }),
      to: bounded.text(bound(60), { min: 1, description: 'The role that consumes. A named role.' }),
      payload: bounded.text(bound(200), { description: 'What crosses the boundary.' }),
      guarantee: bounded.text(bound(360), {
        description: 'What the receiver may assume, including on failure.',
      }),
    }),
    { description: 'The hand-offs between roles, one per edge.' },
  ),
  flows: bounded.list(
    bound(9, 'list'),
    z.strictObject({
      name: bounded.text(bound(120)),
      steps: bounded.list(bound(8, 'list'), bounded.text(bound(340))),
    }),
    { description: 'One per capability: the roles the work passes through, in order.' },
  ),
  policies: bounded.list(
    bound(9, 'list'),
    z.strictObject({
      name: bounded.text(bound(80)),
      decides: bounded.text(bound(260), { description: 'What this rule settles.' }),
      declaredAs: bounded.text(bound(280), {
        description: 'Where it lives as data rather than code.',
      }),
    }),
    { description: 'The thresholds, gates and routes a decision follows.' },
  ),
  memory: bounded.list(
    bound(6, 'list'),
    z.strictObject({
      what: bounded.text(bound(200), { description: 'What is kept or retrieved.' }),
      shape: bounded.text(bound(250), { description: 'The form it is stored in.' }),
      usedBy: bounded.text(bound(170), { description: 'Which role reads it, and when.' }),
    }),
    { description: 'What the workflow learns or looks up, and in what form.' },
  ),
  extensibility: bounded.list(
    bound(6, 'list'),
    z.strictObject({
      change: bounded.text(bound(160), { description: 'A change someone will want.' }),
      requires: bounded.text(bound(360), {
        description: 'What it costs — ideally data, not code.',
      }),
    }),
  ),
  tradeoffs: bounded.list(
    bound(8, 'list'),
    z.strictObject({
      decision: bounded.text(bound(180)),
      rationale: bounded.text(bound(340)),
      alternative: bounded.text(bound(210)).nullable(),
    }),
  ),
  risks: bounded.list(
    bound(8, 'list'),
    z.strictObject({ risk: bounded.text(bound(200)), mitigation: bounded.text(bound(340)) }),
  ),
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
