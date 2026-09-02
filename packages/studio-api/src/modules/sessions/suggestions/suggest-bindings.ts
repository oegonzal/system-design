import {
  BINDING_MAX_NODES,
  DESIGN_BRIEF_VERSION,
  MAX_BINDING_PROPOSALS,
  MECHANISM_CLAIMS,
  MECHANISM_GUIDE,
  MECHANISM_KINDS,
  PROPOSAL_RATIONALE_MAX_LENGTH,
  validateBriefReferences,
  type BriefBindingProposal,
  type CanvasGraph,
  type NfrItem,
  type NodeKind,
} from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';
import { z } from 'zod';

import { describeCanvas } from './describe-canvas';

/**
 * Ask the model which components hold each requirement.
 *
 * A free function taking the client as its first argument, like `enrichPrompt`
 * — so the enabled path is testable without booting Nest, which matters because
 * every automated context here runs `EVAL_DETERMINISTIC=1` and would otherwise
 * only ever exercise the no-op.
 *
 * WHAT THE MODEL IS DELIBERATELY NOT TOLD: how corroboration is computed.
 * `MECHANISM_GUIDE` carries a `proof` string per claim — "the bound database
 * has backups enabled" — and feeding those over would turn this into an answer
 * key: a model that knows the predicate can propose only bindings the engine is
 * guaranteed to corroborate, and the explanation dimension would stop measuring
 * the author entirely. It gets the vocabulary (labels) and the design, and has
 * to reason about the design like a reader would. Proposals it gets wrong are
 * visible to the author as an uncorroborated chip, and cost points if accepted
 * blindly — which is the incentive that keeps a human in the loop.
 */
export async function suggestBindings(
  llm: LlmClient,
  input: {
    graph: CanvasGraph;
    narrative: string | null;
    nfrs: readonly NfrItem[];
    functionalRequirements: readonly string[];
  },
): Promise<BriefBindingProposal[]> {
  // The deterministic answer is "no suggestions", so every failure path — no
  // key, refusal, schema miss, API error — lands on the same empty list.
  if (!llm.enabled) return [];
  if (input.nfrs.length === 0 || input.graph.nodes.length === 0) return [];

  const schema = buildProposalSchema(input.nfrs, input.graph);
  const result = await llm.completeStructured({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(input),
    schema,
    maxTokens: 2048,
  });
  if (!result) return [];

  return admissible(result.proposals, input);
}

const SYSTEM_PROMPT = [
  'You are helping an engineer explain their own system design. They have drawn',
  'a diagram and must now say which components hold each non-functional',
  'requirement, and by what mechanism, choosing from a fixed vocabulary.',
  'Propose one binding per requirement, naming only components that plausibly',
  'provide that mechanism in THIS design. Prefer proposing nothing for a',
  'requirement over naming a component that has nothing to do with it — a wrong',
  'binding costs the engineer marks. Keep each rationale to one sentence.',
].join(' ');

/**
 * Ids come from enums built per request, so the model cannot name a requirement
 * or a component that does not exist — the `buildScenarioSchema` pattern. The
 * mechanism enum is the contract tuple itself.
 */
function buildProposalSchema(nfrs: readonly NfrItem[], graph: CanvasGraph) {
  const nfrIds = nfrs.map((nfr) => nfr.id) as [string, ...string[]];
  const nodeIds = graph.nodes.map((node) => node.id) as [string, ...string[]];

  return z.object({
    proposals: z
      .array(
        z.object({
          nfrId: z.enum(nfrIds).describe('The requirement this binding is about.'),
          mechanism: z.enum(MECHANISM_CLAIMS).describe('How the design holds it.'),
          nodeIds: z
            .array(z.enum(nodeIds))
            .min(1)
            .max(BINDING_MAX_NODES)
            .describe('The components that provide it. Name only the ones that do.'),
          rationale: z
            .string()
            .max(PROPOSAL_RATIONALE_MAX_LENGTH)
            .describe('One sentence: why these components hold this requirement.'),
        }),
      )
      .max(MAX_BINDING_PROPOSALS),
  });
}

function buildUserPrompt(input: {
  graph: CanvasGraph;
  narrative: string | null;
  nfrs: readonly NfrItem[];
  functionalRequirements: readonly string[];
}): string {
  const lines = [
    '# Requirements to bind',
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
    '# The mechanism vocabulary',
    // Labels only. The `proof` half of MECHANISM_GUIDE stays out — see above.
    ...MECHANISM_CLAIMS.map((claim) => `  ${claim} — ${MECHANISM_GUIDE[claim].label}`),
  ];

  if (input.narrative && input.narrative.trim().length > 0) {
    lines.push('', "# The author's own walkthrough", input.narrative.trim());
  }
  return lines.join('\n');
}

/**
 * Two layers, as every other LLM caller here does it: the schema locks the
 * vocabulary, and this drops whatever survived it and still would not be
 * accepted. A proposal the author cannot act on is worse than none — the picker
 * would refuse to offer those components, and submit would reject the binding.
 */
function admissible(
  proposals: readonly BriefBindingProposal[],
  input: {
    graph: CanvasGraph;
    nfrs: readonly NfrItem[];
    functionalRequirements: readonly string[];
  },
): BriefBindingProposal[] {
  const kindById = new Map(input.graph.nodes.map((node) => [node.id, node.kind]));
  const seen = new Set<string>();
  const kept: BriefBindingProposal[] = [];

  for (const proposal of proposals) {
    // One per requirement: the editor holds one binding per NFR, so a second
    // proposal for the same one could only silently overwrite the first.
    if (seen.has(proposal.nfrId)) continue;

    const eligible: readonly NodeKind[] = MECHANISM_KINDS[proposal.mechanism];
    const nodeIds = [...new Set(proposal.nodeIds)].filter((id) => {
      const kind = kindById.get(id);
      return kind !== undefined && eligible.includes(kind);
    });
    if (nodeIds.length === 0) continue;

    const candidate = { ...proposal, nodeIds, rationale: proposal.rationale.trim() };
    // The same referential check submit runs, so a proposal can never be one
    // the API would 422. Free reuse: `BriefPromptRefs` is structural.
    const problems = validateBriefReferences(
      input.graph,
      { version: DESIGN_BRIEF_VERSION, nfrBindings: [candidate], flows: [] },
      {
        nonFunctionalRequirements: input.nfrs,
        functionalRequirements: input.functionalRequirements,
      },
    );
    if (problems.length > 0) continue;

    seen.add(proposal.nfrId);
    kept.push(candidate);
  }

  return kept.slice(0, MAX_BINDING_PROPOSALS);
}
