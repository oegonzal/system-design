/**
 * Why the memory host refuses a request before the runtime is asked, in its
 * own vocabulary beside the runtime's refusals. A loop record is the subject
 * of the `run.*` codes, whichever route reads one: the loop has no such run,
 * or not one this route reads (`run.not_found`); it is still going
 * (`run.in_flight`); or it holds no memory strategy that reads
 * (`run.no_strategy`). A digest is refused when no register is left for it to
 * write (`digest.no_registers`), when its goal would not fit the engine's
 * budget (`digest.too_large`), when its digest step left no report to
 * remember (`digest.no_report`), and when it has been remembered already
 * (`digest.applied`). The HTTP door gives each one declared status.
 */
export type HostRefusal =
  | 'run.not_found'
  | 'run.in_flight'
  | 'run.no_strategy'
  | 'digest.no_registers'
  | 'digest.too_large'
  | 'digest.no_report'
  | 'digest.applied';

export class HostRefused extends Error {
  constructor(
    readonly code: HostRefusal,
    message: string,
  ) {
    super(message);
    this.name = 'HostRefused';
  }
}
