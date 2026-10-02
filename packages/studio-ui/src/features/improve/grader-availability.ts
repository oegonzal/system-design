import type { GradingAvailabilityDto, RunHeartbeatDto } from '@sysdesign/contracts';

/**
 * Whether the grader — and so the coach — can run. A booted quality loop
 * always has a model, so the only states are: still asking, reachable with
 * the model it names and the pace its runs keep, or unreachable (the
 * studio's 503).
 */
export type GraderAvailability =
  | { status: 'checking' }
  | { status: 'reachable'; model: string; heartbeat: RunHeartbeatDto }
  | { status: 'unreachable' };

export const CHECKING: GraderAvailability = { status: 'checking' };
export const UNREACHABLE: GraderAvailability = { status: 'unreachable' };

export const reachable = ({ model, heartbeat }: GradingAvailabilityDto): GraderAvailability => ({
  status: 'reachable',
  model,
  heartbeat,
});

/** The pace a reachable grader's runs keep — what a quiet run is judged by; null until it is known. */
export const heartbeatOf = (availability: GraderAvailability): RunHeartbeatDto | null =>
  availability.status === 'reachable' ? availability.heartbeat : null;
