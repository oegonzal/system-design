/**
 * The register-memory orchestrator's own wire types, and the host's reading of
 * them. It digests one text the host of a memory space composed into the typed
 * memories the space's registers keep, and reports which of them the space may
 * write; the host writes those itself, through the runtime's own write path,
 * and records the apply once. The run itself is an `OrchestrationRunDto`, and
 * the orchestrator observes nothing at open.
 */
import { z } from 'zod';

import type { IsoDateString, Uuid } from '../primitives';
import { ADMISSIONS, withheldRefSchema } from '../quality-loop/admission';
import type { OrchestrationStepDto } from '../quality-loop/orchestration';
import type { QualityRunStatus } from '../quality-loop/runs';
import type { MemoryRefusalDto, WriteOutcome } from './memory';
import { REGISTER_KINDS } from './register-kinds';

export const REGISTER_MEMORY_ORCHESTRATOR_ID = 'register-memory';

/** The step that runs the digest and reports what it endorses: the step a host reads. */
export const REGISTER_MEMORY_DIGEST_STEP = 'digest';

/**
 * Why the digest step endorsed nothing — beyond the runner's own reasons. A
 * digest that was judged and fell short is `not-accepted`; one that was never
 * judged says why instead (`no-rubric`, `no-artifact`). An admitted digest is
 * still not drawn on when a lens it declares answered no sample — the lens
 * confirmed nothing, so what it would have withheld was never looked for
 * (`judges-lost`) — or when a safeguard criterion settled `fail`
 * (`safeguard-failed`). `no-memories` is a digest drawn on that left nothing
 * to write.
 */
export const REGISTER_MEMORY_STEP_REASONS = [
  'not-accepted',
  'no-rubric',
  'no-artifact',
  'judges-lost',
  'safeguard-failed',
  'no-memories',
] as const;
export type RegisterMemoryStepReason = (typeof REGISTER_MEMORY_STEP_REASONS)[number];

/**
 * One memory the digest proposed, as the step read it: where it is in the
 * digest, the register it is filed under, the one kind slot it filled with the
 * candidate there — both null when it filled none or more than one — and the
 * sections it rests on. The candidate is loose on purpose: the runtime's
 * strict parse is its one authority, and one body that drifts never voids the
 * report.
 */
const proposedMemorySchema = z.strictObject({
  ref: z.string().min(1),
  register: z.string().min(1),
  kind: z.enum(REGISTER_KINDS).nullable(),
  evidence: z.array(z.string()),
  candidate: z.record(z.string(), z.unknown()).nullable(),
});

/**
 * What the digest step reports — the one shape the step writes, the runner
 * holds it to and the host reads it with: the run's admission, every memory
 * the digest proposed, the refs of those the step endorses — none unless it
 * may draw on the digest — and every memory withheld, with what withheld it.
 */
export const registerDigestReportSchema = z.strictObject({
  admission: z.enum(ADMISSIONS),
  memories: z.array(proposedMemorySchema),
  endorsed: z.array(z.string().min(1)),
  withheld: z.array(withheldRefSchema),
});
export type RegisterDigestReportDto = z.infer<typeof registerDigestReportSchema>;

/**
 * One endorsed memory as remembering it went: what the write did and the
 * record it left current, or the runtime's refusal of that one memory. A
 * refusal of the whole apply is never an item: it aborts the apply.
 */
export type DigestItemDto =
  | { ref: string; outcome: WriteOutcome; recordId: Uuid; refusal: null }
  | { ref: string; outcome: null; recordId: null; refusal: MemoryRefusalDto };

/** A digest as it was remembered into its space, once: what each endorsed memory's write did, in the order written. */
export interface AppliedDigestDto {
  orchestrationRunId: Uuid;
  spaceId: Uuid;
  /** The register-digest run the endorsed memories came from; null when the step opened none. */
  digestRunId: string | null;
  items: DigestItemDto[];
  appliedAt: IsoDateString;
}

/**
 * A digest as its host reads it back from the loop's record: the
 * orchestration's status, the digest step as recorded, the run it opened, its
 * report as the contract reads it — null when it does not read — and the
 * apply, once there is one.
 */
export interface DigestDto {
  orchestrationRunId: Uuid;
  status: QualityRunStatus;
  step: Pick<OrchestrationStepDto, 'status' | 'reason' | 'note' | 'counts'>;
  /** The register-digest run the step opened; null until it opens one. */
  digestRunId: string | null;
  report: RegisterDigestReportDto | null;
  applied: AppliedDigestDto | null;
}
