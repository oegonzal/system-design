import type { ApiValidationIssue, CompileReportDto, SpaceRefusal } from '@sysdesign/contracts';

/**
 * What a memory client throws, and the whole of it. Transport-agnostic on
 * purpose: the HTTP adapter raises these from a socket and a status, the
 * in-process adapter raises the same ones from the runtime's own refusals,
 * and a consumer maps them onto its own faults in one place. A space or a
 * digest the host does not have is `null` from an unscoped read, never one
 * of these.
 */

/** Nobody answered: the socket is dead, or the host is not there. */
export class MemoryHostUnreachable extends Error {
  constructor(detail = 'no answer') {
    super(`the memory host is unreachable: ${detail}`);
    this.name = 'MemoryHostUnreachable';
  }
}

/** The host did not answer in time. */
export class MemoryHostTimeout extends Error {
  constructor(
    readonly route: string,
    readonly timeoutMs: number,
  ) {
    super(`the memory host did not answer ${route} within ${timeoutMs} ms`);
    this.name = 'MemoryHostTimeout';
  }
}

/**
 * The host answered, and refused. `status` is the status it answered at and
 * `route` what was asked; `code` is the refusal's declared code when the body
 * carried one the contracts declare (`SPACE_REFUSALS`), null for a refusal
 * with none — the validation pipe's 400, a framework error; `issues` names
 * each offending field of a refused body, and `missing` what a 404 did not
 * find, by kind. A caller branches on `code`, `status` and `missing`, never
 * on the message: the message is the host's own, kept for the person who
 * reads the fault.
 */
export class MemoryHostRefused extends Error {
  readonly status: number;
  readonly route: string;
  readonly code: SpaceRefusal | null;
  readonly issues: ApiValidationIssue[];
  readonly missing: string | null;

  constructor(refusal: {
    status: number;
    route: string;
    code: SpaceRefusal | null;
    message: string;
    issues?: ApiValidationIssue[];
    missing?: string | null;
  }) {
    super(refusal.message);
    this.name = 'MemoryHostRefused';
    this.status = refusal.status;
    this.route = refusal.route;
    this.code = refusal.code;
    this.issues = refusal.issues ?? [];
    this.missing = refusal.missing ?? null;
  }
}

/**
 * A space could not be ensured because the run's strategy does not compile:
 * the host's 422 with the compile report, its problems named. The report is
 * the whole of the answer — there is no space, so there is no code — and the
 * message is composed from the problems' codes, never from prose.
 */
export class SpaceNotCompiled extends Error {
  constructor(readonly report: CompileReportDto) {
    const problems = report.problems.map(({ code }) => code).join(', ');
    super(`the strategy does not compile: ${problems}`);
    this.name = 'SpaceNotCompiled';
  }
}
