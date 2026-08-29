/**
 * Cross-profile scoring constants. The math itself lives in the aggregator,
 * driven by the active profile's declarative policy — this file holds what
 * every profile shares and what the persistence layer stamps on results.
 */
import { type EvalDimension } from '@sysdesign/contracts';

/**
 * Written to every completed evaluation. 2.0.0 is the coverage rubric:
 * expectation-earned bases, decayed violation penalties, grade caps.
 */
export const ENGINE_VERSION = '2.0.0';

/** How much each dimension contributes to the overall score; sums to 1. */
export const DIMENSION_WEIGHTS = {
  reliability: 0.2,
  scalability: 0.25,
  performance: 0.15,
  data: 0.15,
  messaging: 0.1,
  security: 0.1,
  hygiene: 0.05,
} as const satisfies Record<EvalDimension, number>;
