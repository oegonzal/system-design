/**
 * The memory-strategy artifact: an agentic-memory system described as the
 * memory it keeps, the typed service it exposes over that memory, and the
 * workflows that move memory through it — never a box-and-arrow diagram.
 *
 *   registers   the memory the system keeps, each by TYPE (working / episodic /
 *               semantic / procedural / relational) and TERM (short vs long),
 *               with its store, scope, indexed metadata and lifecycle.
 *   interfaces  the typed Memory Service operations over those registers —
 *               remember / recall / update / invalidate / consolidate — each
 *               bound to a register, with its signature and guarantee.
 *   workflows   recall-routing, the write pipeline, consolidation/promotion and
 *               expiry, as ordered steps that NAME a declared interface
 *               operation on a declared register.
 *
 * Interfaces and workflows are deliberately redundant: a workflow step that
 * invokes an operation no interface declares, or an interface on a register no
 * strategy keeps, is a dangling reference the validators catch and a critic can
 * point at — impossible when only free-text steps are modelled. Only the
 * referenceable names are required (a register `name`, a workflow `name`);
 * everywhere else emptiness is a defect for a critic to name, never a schema
 * refusal that discards the whole reply. Every bound is what the producer is
 * asked for, at or above what it measurably writes (`measured.json`, held by the
 * spec): a string past its target is kept and noted, a list past its ceiling
 * trimmed from its end — never a lost answer.
 */
import { bound, bounded } from '@sysdesign/contracts';
import { z } from 'zod';

import { numbered, numberedSection, type OutputShape } from '../../core/contracts';

/** The five memory patterns a design keeps apart; each is written, recalled and retained differently. */
export const REGISTER_KINDS = [
  'working',
  'episodic',
  'semantic',
  'procedural',
  'relational',
] as const;
export type RegisterKind = (typeof REGISTER_KINDS)[number];
const REGISTER_KIND_USES: Record<RegisterKind, string> = {
  working: 'the task in flight — current objective, recent tool results, scratch reasoning state',
  episodic:
    'specific past events — runs, the action taken and the outcome observed, distilled into lessons',
  semantic: 'durable learned facts — preferences, decisions, verified entity facts',
  procedural: 'how the agent does things — validated playbooks and tool recipes, versioned',
  relational:
    'entities and how they connect — contacts, accounts, contracts, and facts that change over time',
};

/** Short-term active state versus durable memory held across sessions — different stores, not just collections. */
export const MEMORY_TERMS = ['short_term', 'long_term'] as const;
export type MemoryTerm = (typeof MEMORY_TERMS)[number];
const MEMORY_TERM_USES: Record<MemoryTerm, string> = {
  short_term: 'active workflow state, checkpointed or expired, not durable memory',
  long_term: 'persisted across sessions; retrieved, reconciled, consolidated and expired over time',
};

/** The typed Memory Service operation set — provider-independent. */
export const OPERATION_VERBS = [
  'remember',
  'recall',
  'update',
  'invalidate',
  'consolidate',
] as const;
export type OperationVerb = (typeof OPERATION_VERBS)[number];
const OPERATION_VERB_USES: Record<OperationVerb, string> = {
  remember: 'write a new memory — classified by type, deduplicated, with provenance',
  recall: 'retrieve by meaning and/or exact key — scoped, ranked, cited, within a token budget',
  update: 'supersede an earlier value, keeping the prior one for history',
  invalidate: 'mark a memory no longer current (the forget path), honoured across every store',
  consolidate:
    'distil what accrues — an episode into a lesson, a validated lesson into a procedure',
};

/** The four workflow shapes an agentic-memory system runs. */
export const WORKFLOW_KINDS = [
  'recall_routing',
  'write_pipeline',
  'consolidation_promotion',
  'expiry',
] as const;
export type WorkflowKind = (typeof WORKFLOW_KINDS)[number];
const WORKFLOW_KIND_USES: Record<WorkflowKind, string> = {
  recall_routing:
    'route a query by type to semantic / exact / temporal retrieval, then merge, rerank and budget',
  write_pipeline:
    'capture → extract → classify → resolve → reconcile → persist → maintain for a new memory',
  consolidation_promotion: 'promote episodes to lessons and validated lessons to procedures',
  expiry:
    'age out short-term state, supersede or delete stale long-term memory, reindex on model change',
};

const describe = <T extends string>(uses: Record<T, string>): string =>
  (Object.entries(uses) as [T, string][]).map(([key, use]) => `${key}: ${use}`).join(' | ');

/** A reference to a declared register, or the (operation, register) pair a step binds — short, so never trimmed. */
const nameRef = (description: string) => bounded.text(bound(40), { min: 1, description });

export const memoryStrategySchema = z.strictObject({
  summary: bounded.text(bound(1600), {
    min: 1,
    description:
      'The hardest thing about this memory system in 3–5 sentences, and how the strategy meets it.',
  }),
  assumptions: bounded.list(bound(8, 'list'), bounded.text(bound(220)), {
    description: 'What the brief left unsaid and you decided.',
  }),
  registers: bounded.list(
    bound(8, 'list'),
    z.strictObject({
      name: nameRef('The register name interfaces and workflow steps reference.'),
      kind: z.enum(REGISTER_KINDS).describe(describe(REGISTER_KIND_USES)),
      term: z.enum(MEMORY_TERMS).describe(describe(MEMORY_TERM_USES)),
      holds: bounded.text(bound(260), {
        description:
          'What it stores — atomic facts / episodes with outcomes / versioned playbooks …',
      }),
      store: bounded.text(bound(240), { description: 'The storage substrate, vendor-neutral.' }),
      scope: bounded.text(bound(200), {
        description: 'The isolation key — tenant / user / project — never crossed on recall.',
      }),
      metadata: bounded.list(bound(8, 'list'), bounded.text(bound(60)), {
        description:
          'Indexed, filterable fields (kind, subject, status, time); never embedded into the text.',
      }),
      lifecycle: bounded.text(bound(260), {
        description:
          'How it ages: supersede / consolidate / expire / ttl / reindex for THIS register.',
      }),
    }),
    { min: 1, description: 'The memory registers the system keeps, by type and term.' },
  ),
  interfaces: bounded.list(
    bound(12, 'list'),
    z.strictObject({
      operation: z.enum(OPERATION_VERBS).describe(describe(OPERATION_VERB_USES)),
      register: nameRef('The register this operation acts on. A declared register name.'),
      input: bounded.text(bound(220), { description: 'The typed signature in.' }),
      output: bounded.text(bound(220), {
        description:
          'What the caller may assume back (cited, ranked, budgeted where it is a recall).',
      }),
      guarantee: bounded.text(bound(340), {
        description:
          'What holds including on failure: idempotence, provenance, atomicity, isolation.',
      }),
    }),
    { min: 1, description: 'The typed Memory Service operations over the registers.' },
  ),
  workflows: bounded.list(
    bound(8, 'list'),
    z.strictObject({
      name: bounded.text(bound(120), { min: 1 }),
      kind: z.enum(WORKFLOW_KINDS).describe(describe(WORKFLOW_KIND_USES)),
      steps: bounded.list(
        bound(9, 'list'),
        z.strictObject({
          operation: z.enum(OPERATION_VERBS),
          register: nameRef(
            'A declared register; the (operation, register) pair must match a declared interface.',
          ),
          does: bounded.text(bound(300), { description: 'What this step does.' }),
        }),
        { min: 1, description: 'The ordered operations the workflow runs.' },
      ),
    }),
    { min: 1, description: 'The recall-routing, write, consolidation and expiry workflows.' },
  ),
  safeguards: bounded.list(
    bound(8, 'list'),
    z.strictObject({
      rule: bounded.text(bound(200), { description: 'A hard rule the system may not break.' }),
      mechanism: bounded.text(bound(300), { description: 'What enforces it deterministically.' }),
    }),
    {
      description:
        'Governance: retrieved memory as data not instructions, validation before consequential writes, PII and deletion.',
    },
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
export type MemoryStrategy = z.infer<typeof memoryStrategySchema>;

export const memoryStrategyOutput: OutputShape<MemoryStrategy> = {
  schema: memoryStrategySchema,

  locate: (strategy) => [
    { id: 'summary', label: 'Summary' },
    ...numbered('assumption', strategy.assumptions, (item) => item),
    ...numbered(
      'register',
      strategy.registers,
      (item) => `${item.name} — ${item.kind}/${item.term}`,
    ),
    ...numbered('interface', strategy.interfaces, (item) => `${item.operation}(${item.register})`),
    ...numbered('workflow', strategy.workflows, (item) => item.name),
    ...numbered('safeguard', strategy.safeguards, (item) => item.rule),
    ...numbered('tradeoff', strategy.tradeoffs, (item) => item.decision),
    ...numbered('risk', strategy.risks, (item) => item.risk),
  ],

  render: (strategy) =>
    [
      `[summary] ${strategy.summary}`,
      ...numberedSection('Assumptions', 'assumption', strategy.assumptions, (item) => item),
      ...numberedSection(
        'Registers',
        'register',
        strategy.registers,
        (item) =>
          `${item.name} [${item.kind}/${item.term}] — holds: ${item.holds} | store: ${item.store} | scope: ${item.scope} | metadata: ${item.metadata.join(', ')} | lifecycle: ${item.lifecycle}`,
      ),
      ...numberedSection(
        'Interfaces',
        'interface',
        strategy.interfaces,
        (item) =>
          `${item.operation}(${item.register}): ${item.input} -> ${item.output} | guarantee: ${item.guarantee}`,
      ),
      ...numberedSection(
        'Workflows',
        'workflow',
        strategy.workflows,
        (item) =>
          `${item.name} [${item.kind}]: ${item.steps.map((step) => `${step.operation}:${step.register} — ${step.does}`).join(' → ')}`,
      ),
      ...numberedSection(
        'Safeguards',
        'safeguard',
        strategy.safeguards,
        (item) => `${item.rule} — ${item.mechanism}`,
      ),
      ...numberedSection(
        'Trade-offs',
        'tradeoff',
        strategy.tradeoffs,
        (item) =>
          `${item.decision} — ${item.rationale}${item.alternative ? ` (alternative: ${item.alternative})` : ''}`,
      ),
      ...numberedSection(
        'Risks',
        'risk',
        strategy.risks,
        (item) => `${item.risk} — mitigation: ${item.mitigation}`,
      ),
    ].join('\n'),
};
