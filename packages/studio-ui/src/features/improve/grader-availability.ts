import type { LlmModelDto } from '@sysdesign/contracts';

/**
 * Whether the grader — and so the coach — can run. A booted quality loop
 * always has a model, so the only states are: still asking, reachable with
 * the model it names, or unreachable (the studio's 503).
 */
export type GraderAvailability =
  { status: 'checking' } | { status: 'reachable'; model: string } | { status: 'unreachable' };

export const CHECKING: GraderAvailability = { status: 'checking' };
export const UNREACHABLE: GraderAvailability = { status: 'unreachable' };

export const reachable = (report: LlmModelDto): GraderAvailability =>
  report.model === null ? UNREACHABLE : { status: 'reachable', model: report.model };
