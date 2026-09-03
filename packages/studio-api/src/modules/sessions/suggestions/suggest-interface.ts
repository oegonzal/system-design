import {
  configFieldsFor,
  fulfillableItems,
  INTERFACE_CAPABILITIES,
  interfaceProposalId,
  isApiLikeRole,
  isConfigValueInDomain,
  MAX_INTERFACE_PROPOSALS,
  NODE_MAX_OPERATIONS,
  NODE_MAX_RESPONSIBILITIES,
  OPERATION_MAX_EMITS,
  OPERATION_NAME_MAX_LENGTH,
  PROPOSAL_RATIONALE_MAX_LENGTH,
  RESPONSIBILITY_MAX_LENGTH,
  validateGraphReferences,
  validateWorkflowReferences,
  type CanvasGraph,
  type CanvasNode,
  type ConfigFieldSpec,
  type InterfaceProposal,
  type InterfaceRole,
  type NfrItem,
  type NodeOperation,
  type OperationKind,
  type WorkflowSpec,
} from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';
import { z } from 'zod';

import { describeCanvas } from './describe-canvas';

/**
 * Ask the model what ONE component's interface should declare — operations
 * (with their workflow grounding), config knobs, responsibilities — choosing
 * only from that component's GRADEABLE vocabulary.
 *
 * The sibling of `suggestBindings`, built the same way: a free function taking
 * the client first so the enabled path is testable without Nest; a per-request
 * schema that enum-locks every id and value to what THIS node may declare; and
 * an `admissible` pass that re-runs the same validators submit runs, applying
 * each item alone so one bad proposal never sinks the rest.
 *
 * WHAT THE MODEL IS DELIBERATELY NOT TOLD: how anything is graded. It sees the
 * vocabulary — the op kinds this role allows, the workflow items this role and
 * kind may fulfill (id + statement), the knobs this kind offers (label +
 * options) — and the design, and has to reason about the design like a
 * reader would. A proposal it gets wrong is visible as a verdict chip the
 * moment the author accepts it, and costs marks; the human in the loop is the
 * point.
 */
export async function suggestInterface(
  llm: LlmClient,
  input: {
    graph: CanvasGraph;
    nodeId: string;
    spec: WorkflowSpec | null;
    nfrs: readonly NfrItem[];
    functionalRequirements: readonly string[];
    narrative: string | null;
  },
): Promise<InterfaceProposal[]> {
  // The deterministic answer is "no suggestions", so every failure path — no
  // model, refusal, schema miss, API error — lands on the same empty list.
  if (!llm.enabled) return [];
  const node = input.graph.nodes.find((candidate) => candidate.id === input.nodeId);
  if (!node) return [];
  const vocabulary = vocabularyFor(node, input.spec);
  if (!vocabulary.hasAnything) return [];

  const result = await llm.completeStructured({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(node, vocabulary, input),
    schema: buildInterfaceSchema(vocabulary),
    maxTokens: 2048,
  });
  if (!result) return [];

  return admissible(result, node, vocabulary, input);
}

const SYSTEM_PROMPT = [
  'You are helping an engineer declare what one component of their system',
  'design is responsible for. They have drawn a diagram; for the named',
  'component, propose the operations it should serve or carry (and, when the',
  'prompt states a business workflow, which workflow item each one realizes),',
  'the configuration knobs worth setting for THIS design, and its',
  'responsibilities — choosing only from the vocabulary given. Propose only what',
  'the diagram and requirements actually call for; prefer proposing nothing over',
  'inventing a contract the design does not need — an accepted proposal the',
  'design cannot back costs the engineer marks. Keep each rationale to one',
  'sentence.',
].join(' ');

/** Everything THIS node may legally declare, resolved once from the capability and config tables. */
interface Vocabulary {
  role: InterfaceRole;
  operationKinds: readonly OperationKind[];
  editorLabel: string | null;
  /** Workflow items this node may fulfill, per op kind — `[]` on a prompt without a spec. */
  fulfillable: ReadonlyMap<OperationKind, ReadonlyArray<{ id: string; label: string }>>;
  eventIds: readonly string[];
  fields: readonly ConfigFieldSpec[];
  mayDeclareResponsibilities: boolean;
  hasAnything: boolean;
}

function vocabularyFor(node: CanvasNode, spec: WorkflowSpec | null): Vocabulary {
  const capability = INTERFACE_CAPABILITIES[node.kind];
  const fulfillable = new Map<OperationKind, ReadonlyArray<{ id: string; label: string }>>();
  for (const kind of capability.operationKinds) {
    fulfillable.set(kind, spec ? fulfillableItems(spec, capability.role, kind) : []);
  }
  const mayEmit = spec !== null && isApiLikeRole(capability.role);
  const fields = configFieldsFor(node.kind);
  const mayDeclareResponsibilities = isApiLikeRole(capability.role);
  return {
    role: capability.role,
    operationKinds: capability.operationKinds,
    editorLabel: capability.editorLabel,
    fulfillable,
    eventIds: mayEmit ? spec.events.map((event) => event.id) : [],
    fields,
    mayDeclareResponsibilities,
    hasAnything:
      capability.operationKinds.length > 0 || fields.length > 0 || mayDeclareResponsibilities,
  };
}

/** The model's answer, section by section; a section is absent when the node cannot declare it. */
interface InterfaceCritique {
  operations?: Array<{
    name: string;
    kind: OperationKind;
    idempotent: boolean;
    fulfills: string | null;
    emits: string[];
    rationale: string;
  }>;
  config?: Array<{ key: string; value: string | number | boolean; rationale: string }>;
  responsibilities?: Array<{ text: string; rationale: string }>;
}

const tuple = (ids: readonly string[]) =>
  ids.length === 0 ? null : (ids as [string, ...string[]]);
const rationale = z
  .string()
  .max(PROPOSAL_RATIONALE_MAX_LENGTH)
  .describe('One sentence: why this design needs it.');

/** A field's value schema is its domain — the same domain the validator enforces. */
function valueSchema(field: ConfigFieldSpec) {
  switch (field.input) {
    case 'select':
      return z.enum(tuple(field.options ?? []) ?? ['']);
    case 'checkbox':
      return z.boolean();
    case 'text':
      return z.string().min(1).max(60);
    case 'number': {
      const base = z.number().min(field.min ?? 0);
      return field.max === undefined ? base : base.max(field.max);
    }
  }
}

/**
 * Ids and values come from enums built per request, so the model cannot name
 * an op kind this role does not allow, a workflow item this node may not
 * fulfill, an event the prompt never declared, or a knob this kind does not
 * offer — the `buildProposalSchema` pattern, per section.
 */
function buildInterfaceSchema(vocabulary: Vocabulary): z.ZodType<InterfaceCritique> {
  const shape: Record<string, z.ZodTypeAny> = {};

  const kinds = tuple(vocabulary.operationKinds);
  if (kinds) {
    const fulfillIds = tuple([
      ...new Set([...vocabulary.fulfillable.values()].flat().map((item) => item.id)),
    ]);
    const eventIds = tuple(vocabulary.eventIds);
    shape['operations'] = z
      .array(
        z.object({
          name: z.string().min(1).max(OPERATION_NAME_MAX_LENGTH),
          kind: z.enum(kinds),
          idempotent: z.boolean(),
          fulfills: (fulfillIds ? z.enum(fulfillIds).nullable() : z.null()).describe(
            'The workflow item this operation realizes, or null when it serves none of them.',
          ),
          emits: (eventIds
            ? z.array(z.enum(eventIds)).max(OPERATION_MAX_EMITS)
            : z.array(z.string()).max(0)
          ).describe('Workflow events a command publishes when it runs. Empty for queries.'),
          rationale,
        }),
      )
      .max(NODE_MAX_OPERATIONS);
  }

  if (vocabulary.fields.length > 0) {
    const [first, ...rest] = vocabulary.fields.map((field) =>
      z.object({ key: z.literal(field.key), value: valueSchema(field), rationale }),
    );
    shape['config'] = z
      .array(first === undefined ? z.never() : z.discriminatedUnion('key', [first, ...rest]))
      .max(vocabulary.fields.length);
  }

  if (vocabulary.mayDeclareResponsibilities) {
    shape['responsibilities'] = z
      .array(z.object({ text: z.string().min(1).max(RESPONSIBILITY_MAX_LENGTH), rationale }))
      .max(NODE_MAX_RESPONSIBILITIES);
  }

  return z.object(shape) as unknown as z.ZodType<InterfaceCritique>;
}

function buildUserPrompt(
  node: CanvasNode,
  vocabulary: Vocabulary,
  input: {
    graph: CanvasGraph;
    nfrs: readonly NfrItem[];
    functionalRequirements: readonly string[];
    narrative: string | null;
  },
): string {
  const lines = [
    `# The component to advise on`,
    `  ${node.id} — ${node.label} (${node.kind}, interface role: ${vocabulary.role})`,
    '',
    '# Requirements',
    ...input.nfrs.map(
      (nfr) =>
        `  ${nfr.id} [${nfr.kind}] ${JSON.stringify(nfr.statement)}${nfr.target ? ` target ${nfr.target}` : ''}`,
    ),
    '',
    '# What the system must do',
    ...input.functionalRequirements.map((requirement) => `  - ${requirement}`),
    '',
    describeCanvas(input.graph),
    '',
    `# What a ${node.kind} may declare`,
  ];

  if (vocabulary.operationKinds.length > 0) {
    lines.push(
      `${vocabulary.editorLabel ?? 'Operations'} of kind: ${vocabulary.operationKinds.join(', ')}`,
    );
    for (const kind of vocabulary.operationKinds) {
      const items = vocabulary.fulfillable.get(kind) ?? [];
      if (items.length === 0) continue;
      lines.push(`  a ${kind} may fulfill one of:`);
      lines.push(...items.map((item) => `    ${item.id} — ${item.label}`));
    }
    if (vocabulary.eventIds.length > 0) {
      lines.push(`  a command may emit: ${vocabulary.eventIds.join(', ')}`);
    }
  }
  if (vocabulary.fields.length > 0) {
    lines.push('Config knobs:');
    lines.push(
      ...vocabulary.fields.map(
        (field) =>
          `  ${field.key} — ${field.label}${field.options ? ` (${field.options.join(' | ')})` : field.input === 'checkbox' ? ' (true | false)' : ''}`,
      ),
    );
  }
  if (vocabulary.mayDeclareResponsibilities) {
    lines.push(
      `Responsibilities: up to ${NODE_MAX_RESPONSIBILITIES} short clauses, "owns order lifecycle".`,
    );
  }

  if (input.narrative && input.narrative.trim().length > 0) {
    lines.push('', "# The author's own walkthrough", input.narrative.trim());
  }
  return lines.join('\n');
}

/**
 * Two layers, as every other LLM caller here does it: the schema locks the
 * vocabulary, and this drops whatever survived it and still would not be
 * accepted. Each item is applied ALONE to a copy of the graph and must pass
 * the same referential checks submit runs — so a proposal the author cannot
 * act on is never offered, and one bad item never sinks its neighbours.
 */
function admissible(
  critique: InterfaceCritique,
  node: CanvasNode,
  vocabulary: Vocabulary,
  input: { graph: CanvasGraph; spec: WorkflowSpec | null },
): InterfaceProposal[] {
  const kept: InterfaceProposal[] = [];
  const nextId = () => interfaceProposalId(kept.length);
  const declaredNames = new Set((node.operations ?? []).map((op) => op.name));
  const declaredResponsibilities = new Set(node.responsibilities ?? []);

  const withNode = (patch: Partial<CanvasNode>): CanvasGraph => ({
    ...input.graph,
    nodes: input.graph.nodes.map((candidate) =>
      candidate.id === node.id ? { ...candidate, ...patch } : candidate,
    ),
  });
  const survivesSubmit = (graph: CanvasGraph): boolean =>
    validateGraphReferences(graph).length === 0 &&
    validateWorkflowReferences(graph, input.spec).length === 0;

  for (const proposed of critique.operations ?? []) {
    const name = proposed.name.trim();
    if (name.length === 0 || declaredNames.has(name)) continue;
    // The schema's fulfills enum spans every allowed kind; the editor's rule
    // is per kind, so re-check against what THIS kind may claim.
    const fulfills =
      proposed.fulfills !== null &&
      (vocabulary.fulfillable.get(proposed.kind) ?? []).some(
        (item) => item.id === proposed.fulfills,
      )
        ? proposed.fulfills
        : undefined;
    // Emission is a command's producer story, as the editor gates it.
    const emits =
      proposed.kind === 'command'
        ? [...new Set(proposed.emits)].filter((id) => vocabulary.eventIds.includes(id))
        : [];
    const operation: NodeOperation = {
      name,
      kind: proposed.kind,
      idempotent: proposed.idempotent,
      ...(fulfills !== undefined ? { fulfills } : {}),
      ...(emits.length > 0 ? { emits } : {}),
    };
    if (!survivesSubmit(withNode({ operations: [...(node.operations ?? []), operation] })))
      continue;
    declaredNames.add(name);
    kept.push({ id: nextId(), kind: 'operation', operation, rationale: proposed.rationale.trim() });
  }

  const fieldByKey = new Map(vocabulary.fields.map((field) => [field.key, field]));
  for (const proposed of critique.config ?? []) {
    const field = fieldByKey.get(proposed.key);
    if (!field || !isConfigValueInDomain(field, proposed.value)) continue;
    // Proposing what is already set is not a suggestion.
    if (node.config?.[proposed.key] === proposed.value) continue;
    kept.push({
      id: nextId(),
      kind: 'config',
      key: proposed.key,
      value: proposed.value,
      rationale: proposed.rationale.trim(),
    });
  }

  let responsibilityCount = declaredResponsibilities.size;
  for (const proposed of critique.responsibilities ?? []) {
    const text = proposed.text.trim();
    if (text.length === 0 || declaredResponsibilities.has(text)) continue;
    if (responsibilityCount >= NODE_MAX_RESPONSIBILITIES) break;
    declaredResponsibilities.add(text);
    responsibilityCount += 1;
    kept.push({ id: nextId(), kind: 'responsibility', text, rationale: proposed.rationale.trim() });
  }

  return kept.slice(0, MAX_INTERFACE_PROPOSALS);
}
