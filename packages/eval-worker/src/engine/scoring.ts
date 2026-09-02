/**
 * Written to every completed evaluation. 2.0.0 is the coverage rubric:
 * expectation-earned bases, decayed violation penalties, grade caps. 2.1.0
 * adds the narrative-scoped expectations that earn the explanation
 * dimension. 2.6.0 gives event-driven compute (worker/batch-job/stream-
 * processor) a distinct interface role so an operation exercised by the
 * message flow is no longer flagged unreferenced, and grades the narrative's
 * component rationales over every real component. The math itself lives in the
 * aggregator, driven by the active profile's declarative policy.
 */
export const ENGINE_VERSION = '2.6.0';
