/**
 * The critic registry.
 *
 * One place defines what a critic is called, which prompt it runs, and which
 * categories it may use. `review.ts` injects those categories into the schema as
 * an `enum` before each call, so the allowed set is enforced by the API rather
 * than requested in prose — a model left unconstrained will happily invent a
 * category, and prose alone does not hold.
 */
export const CRITIC_NAMES = ['architecture', 'testability', 'readability'] as const;

export type CriticName = (typeof CRITIC_NAMES)[number];

export interface Critic {
  name: CriticName;
  /** Relative to this directory. */
  promptFile: string;
  categories: readonly string[];
  /**
   * Categories whose argument is "this should not exist".
   *
   * They are only decidable against the change's stated purpose, so `sanitise`
   * drops them when none was supplied — in code rather than in prose, so the
   * guard survives someone adding this critic to a profile that has no purpose
   * available. Every critic is given the repository map, so there is no flag
   * for that.
   */
  scopeCategories: readonly string[];
}

export const CRITICS: Record<CriticName, Critic> = {
  architecture: {
    name: 'architecture',
    promptFile: 'critics/architecture.md',
    categories: [
      'duplication',
      'placement',
      'dependency-direction',
      'cross-package-coupling',
      'shared-abstraction-reuse',
      'type-safety',
    ],
    scopeCategories: [],
  },

  testability: {
    name: 'testability',
    promptFile: 'critics/testability.md',
    categories: [
      'missing-test',
      'untestable-behaviour',
      'excessive-mocking',
      'hidden-dependency',
      'non-determinism',
      'wrong-test-level',
    ],
    scopeCategories: [],
  },

  readability: {
    name: 'readability',
    promptFile: 'critics/readability.md',
    categories: [
      'coupling',
      'responsibility-size',
      'control-flow',
      'naming',
      'unnecessary-abstraction',
      'excessive-indirection',
      'disproportionate-complexity',
    ],
    // The category that judges requested work against a baseline. Without a
    // stated purpose there is no baseline, so it is schema-removed rather than
    // prose-discouraged.
    scopeCategories: ['disproportionate-complexity'],
  },
};

/**
 * Which critics run under each profile.
 *
 * Models are pinned by id rather than alias where one exists: an alias
 * retargets without a code change, moving context window, price and behaviour —
 * and `persist.ts` records the literal string, so an aliased run record cannot
 * be reproduced later.
 */
export const PROFILES = {
  /**
   * Pre-commit. One critic, no LLM evaluator pass: with a single critic there
   * is nothing to deduplicate or reconcile, so the deterministic evaluator
   * decides alone and a second call would be pure cost. Readability is the one
   * chosen because it is the critic whose findings are cheapest to act on
   * before a commit — naming, coupling and responsibility size are exactly the
   * things still fluid at commit time — while the deterministic rules already
   * cover boundaries and structure without spending a token.
   */
  quick: {
    critics: ['readability'] as CriticName[],
    model: 'claude-haiku-4-5-20251001',
    budgetUsd: 0.25,
  },

  /**
   * Pull request. The full pipeline: three critics, then the LLM evaluator to
   * deduplicate and reconcile, then the deterministic gates.
   *
   * `budgetUsd` is a cap per CLI call, not per run. It has headroom on purpose:
   * a call that trips it raises ReviewUnavailableError, that critic counts as
   * "did not run", and the incomplete-review rule then means every pull request
   * warns — a quality regression that looks like a code problem.
   */
  full: { critics: [...CRITIC_NAMES] as CriticName[], model: 'claude-sonnet-5', budgetUsd: 1.0 },
} as const;

export type ProfileName = keyof typeof PROFILES;
