/**
 * The agentic-system service: the memory-design cycle it keeps. A cycle is one
 * coach-and-learn pass over a memory brief — the service runs the
 * memory-architecture coach on the brief and hands the finished run to the
 * memory-design orchestrator to learn from.
 */

/** Where a memory-design cycle is in its lifecycle. */
export const MEMORY_DESIGN_CYCLE_STATUSES = ['running', 'coached', 'stored', 'failed'] as const;
export type MemoryDesignCycleStatus = (typeof MEMORY_DESIGN_CYCLE_STATUSES)[number];
