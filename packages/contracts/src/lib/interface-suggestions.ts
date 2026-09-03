import type { CanvasGraph, NodeOperation } from './canvas';
import type { ApiResponse } from './envelope';

/**
 * Machine-proposed additions to ONE component's interface — an operation with
 * its workflow grounding, a config knob, a responsibility — that the author
 * accepts or dismisses one at a time.
 *
 * The sibling of `BriefBindingProposal`, and bound by the same line: a
 * proposal is not part of the design until a human takes it. Every item is
 * drawn from the component's GRADEABLE vocabulary — the op kinds its role
 * allows, the workflow items its role and kind may fulfill, the knobs its kind
 * offers — so the model selects a best fit from what the grader can read, and
 * never invents a knob or a contract the engine could not corroborate. The
 * deterministic validators submit runs verify each item before it is offered.
 */
export type InterfaceProposal =
  | { id: string; kind: 'operation'; operation: NodeOperation; rationale: string }
  | { id: string; kind: 'config'; key: string; value: string | number | boolean; rationale: string }
  | { id: string; kind: 'responsibility'; text: string; rationale: string };

export type InterfaceProposalKind = InterfaceProposal['kind'];

/** The draft as it stands plus the component to advise on; the design is unsubmitted. */
export interface InterfaceSuggestionsRequest {
  graph: CanvasGraph;
  nodeId: string;
  narrative?: string;
}

export interface InterfaceSuggestionsDto {
  nodeId: string;
  proposals: InterfaceProposal[];
  /** The model that produced them, or null when none ran — an empty list is the deterministic answer. */
  model: string | null;
}

export type InterfaceSuggestionsResponse = ApiResponse<InterfaceSuggestionsDto>;

/** Enough to fill an interface, few enough to read one at a time. */
export const MAX_INTERFACE_PROPOSALS = 8;

/** Deterministic, index-based — like flow ids — so specs and stories stay reproducible. */
export function interfaceProposalId(index: number): string {
  return `proposal-${index}`;
}
