/**
 * An expectation is a capability the prompt demands the design demonstrate —
 * the positive half of grading. Where a rule asks "did you do something
 * wrong?", an expectation asks "did you solve this at all?", and an empty
 * canvas now earns the score an empty canvas deserves.
 */
import type {
  Archetype,
  EvalDimension,
  GraphPatch,
  NfrKind,
  PromptDifficulty,
  Severity,
} from '@sysdesign/contracts';

import type { PromptFacts, RuleContext } from '../../types';

export interface ExpectationCheck {
  met: boolean;
  /** Met: the elements that prove it. Unmet: the elements that should satisfy it. */
  evidenceNodeIds: string[];
  evidenceEdgeIds: string[];
  /**
   * Optional unmet message computed from what the check actually saw (e.g.
   * naming the components the narrative skipped) — wins over `teach`, which
   * only sees the prompt facts.
   */
  unmetDetail?: string;
}

export interface Expectation {
  /** `exp.<archetype-abbr>.<slug>`, ≤60 chars (persists into finding rows). */
  id: string;
  dimension: EvalDimension;
  /** Coverage weight within its dimension — how much of the base it earns. */
  weight: number;
  severityIfUnmet: Severity;
  /** Applies only when the prompt carries this NFR kind. */
  nfrKind?: NfrKind;
  /**
   * Citation-only: names the NFR kind this expectation embodies for nfrId
   * lookup, WITHOUT gating applicability — use nfrKind when the expectation
   * should also be skipped when the kind is absent.
   */
  citesNfrKind?: NfrKind;
  /** The easiest difficulty that demands this capability. */
  minDifficulty: PromptDifficulty;
  archetypes: readonly Archetype[] | 'all';
  /** Extra gating beyond archetype/difficulty/NFR (e.g. functional keywords). */
  appliesWhen?: (facts: PromptFacts) => boolean;
  /**
   * Brief-scoped: its `satisfiedBy` receives the submitted brief. Diagram
   * expectations never set this and never see it, so a brief can never add or
   * remove a demand on the diagram. Skipped by default when no brief was
   * submitted — there is nothing of its kind to grade.
   */
  requiresBrief?: true;
  /**
   * The opt-out for the one expectation whose subject IS the absence: it stays
   * applicable with no brief, so silence scores zero instead of vanishing from
   * the rubric. Exactly one expectation should set this.
   */
  appliesWithoutBrief?: true;
  /**
   * Narration-scoped: its `satisfiedBy` receives the narrative's typed
   * projection (`ctx.narration`) — and the brief, since a narrative claim is
   * graded relative to the components the brief accounts for. Skipped by default
   * when no substantive narrative was submitted; the inverse of the brief flag.
   */
  requiresNarration?: true;
  /**
   * The opt-out for the one narration expectation whose subject IS the absence:
   * it stays applicable with no narrative, so a missing walkthrough scores zero
   * and trips the "no top grade without a narrative" cap instead of vanishing.
   * Exactly one expectation should set this.
   */
  appliesWithoutNarration?: true;
  /** Finding title when unmet. */
  title: string;
  /** The lesson: why this capability matters at the prompt's scale. */
  teach: (facts: PromptFacts) => string;
  satisfiedBy: (ctx: RuleContext) => ExpectationCheck;
  /** Ghost-fix factory for the unmet finding; null/absent when the author must design it. */
  suggest?: (ctx: RuleContext) => GraphPatch | null;
}

const DIFFICULTY_RANK: Record<PromptDifficulty, number> = {
  intro: 0,
  standard: 1,
  advanced: 2,
};

export function expectationApplies(expectation: Expectation, facts: PromptFacts): boolean {
  if (expectation.archetypes !== 'all' && !expectation.archetypes.includes(facts.archetype)) {
    return false;
  }
  if (DIFFICULTY_RANK[facts.difficulty] < DIFFICULTY_RANK[expectation.minDifficulty]) return false;
  if (expectation.nfrKind && !facts.nfrKinds.includes(expectation.nfrKind)) return false;
  if (expectation.appliesWhen && !expectation.appliesWhen(facts)) return false;
  return true;
}

export function met(evidenceNodeIds: string[], evidenceEdgeIds: string[] = []): ExpectationCheck {
  return { met: true, evidenceNodeIds, evidenceEdgeIds };
}

export function unmet(
  evidenceNodeIds: string[] = [],
  evidenceEdgeIds: string[] = [],
  unmetDetail?: string,
): ExpectationCheck {
  return { met: false, evidenceNodeIds, evidenceEdgeIds, unmetDetail };
}
