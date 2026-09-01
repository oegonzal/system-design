import type { CanvasGraph } from './canvas';
import type { ApiResponse } from './envelope';
import type { MechanismClaim } from './mechanisms';

/**
 * Machine-proposed bindings the author accepts or dismisses.
 *
 * Authoring a brief from nothing means choosing among eighteen mechanisms for
 * each requirement and then finding the components that provide it. The
 * expensive part is usually vocabulary — knowing that the thing you drew is
 * what this rubric calls `queue-buffer` — so the model reads the diagram and
 * the author's own walkthrough and offers candidates.
 *
 * A proposal is NOT a binding. It carries no weight until a human accepts it,
 * and the graded artifact is only ever what the author chose. That is what
 * keeps this outside the eval pipeline and out of tension with EVAL-6: the
 * suggestion endpoint lives in the API, produces no evidence artifact, and has
 * no path to `DesignRevision.brief` except through an explicit human act.
 */
export interface BriefBindingProposal {
  /** An id from the prompt's `nonFunctionalRequirements`. */
  nfrId: string;
  mechanism: MechanismClaim;
  /** Components the model believes hold it. Always eligible for the mechanism. */
  nodeIds: string[];
  /**
   * One sentence on why. DISPLAY ONLY — it is never written into the brief.
   * Model prose stored as the author's own reasoning would be a lie about
   * provenance, and `note` is the author's field.
   */
  rationale: string;
}

/**
 * The canvas is sent in the request rather than read from the latest revision:
 * the author is mid-draft, and the design they want help with has not been
 * submitted yet — that is the whole point of asking.
 */
export interface BriefSuggestionsRequest {
  graph: CanvasGraph;
  /** The walkthrough, when they have written one. */
  narrative?: string;
}

export interface BriefSuggestionsDto {
  proposals: BriefBindingProposal[];
  /**
   * The model that produced them, or null when none ran. The shape does not
   * change when the model is off — an empty list is the deterministic answer,
   * not an error — so the same response is exercised with and without a key.
   */
  model: string | null;
}

export type BriefSuggestionsResponse = ApiResponse<BriefSuggestionsDto>;

/** Matches `BINDING_NOTE_MAX_LENGTH`; a rationale is one sentence, not an essay. */
export const PROPOSAL_RATIONALE_MAX_LENGTH = 200;

/** One proposal per requirement, so accepting can never need a merge. */
export const MAX_BINDING_PROPOSALS = 12;
