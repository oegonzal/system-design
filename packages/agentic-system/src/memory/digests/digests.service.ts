import { MemoryRefused, type MemoryService } from '@sysdesign/agentic-memory';
import {
  GoalBudgetExceeded,
  readRegisterDigestIndex,
  REGISTER_DIGEST_MAX_ITERATIONS,
  REGISTER_MEMORY_DIGEST_STEP,
  REGISTER_MEMORY_ORCHESTRATOR_ID,
  registerDigestReportSchema,
  renderRegisterDigestGoal,
  type AppliedDigestDto,
  type DigestDto,
  type DigestItemDto,
  type MemoryRefusal,
  type OrchestrationRunDto,
  type OrchestrationRunStartedDto,
  type OrchestrationStepDto,
  type RegisterDigestIndex,
  type RegisterDigestInput,
  type RegisterDigestReportDto,
  type RegisterDigestRequest,
  type WritableRegisterDto,
} from '@sysdesign/contracts';
import type { LoopClient } from '@sysdesign/loop-client';

import type { Clock } from '../../common/clock';
import { HostRefused } from '../host-refusal';
import type { AppliedDigest, DigestLedger } from './ledger';

/**
 * The runtime's refusals that are about the whole apply, not one memory: the
 * space is not kept or no longer compiles, the scope is not one its policy
 * declares, or a write lost its race and is to be sent again. One aborts the
 * apply with nothing recorded, so the apply is retried whole; every other
 * refusal is that memory's alone, answered as its item.
 */
const BATCH_REFUSALS: readonly MemoryRefusal[] = [
  'space.not_found',
  'space.not_compiled',
  'scope.invalid',
  'conflict',
];

type ProposedMemory = RegisterDigestReportDto['memories'][number];

/** A register-memory record read for the space its goal's index names: its digest step, and the step's report as read. */
interface ReadDigest {
  record: OrchestrationRunDto;
  index: RegisterDigestIndex;
  step: OrchestrationStepDto;
  /** The report as the contract the step wrote it by reads it; null when it does not read. */
  report: RegisterDigestReportDto | null;
}

/**
 * A memory space's digests: a text its owner hands in, digested on the loop
 * into the typed memories the space's registers keep, read back from the
 * loop's own record, and remembered once. Nothing is kept between the three:
 * the loop's record is the job, and the ledger holds only applies.
 *
 * - `start` briefs the text against the space before any model is asked, so a
 *   digest is refused wherever its writes would be — a space the runtime does
 *   not keep or cannot compile, a scope its policy does not declare (the
 *   runtime's refusals), no register left to write, a goal past the engine's
 *   budget — and otherwise starts one register-memory orchestration under the
 *   declared iteration budget.
 * - `get` reads the record back. A digest is found only on the orchestrator
 *   that digests one, and only under the space its goal's index names, so its
 *   existence never leaks across spaces; its report is answered as read.
 * - `remember` writes what the step endorsed, never recomputed and nothing it
 *   withheld, through the runtime's own write path under the scope and
 *   provenance the index carries, in report order, so a later memory of one
 *   identity supersedes an earlier one. A digest still running, one that left
 *   no report that reads, and one applied already are refused; the apply is
 *   recorded once, after the writes.
 */
export class DigestsService {
  constructor(
    private readonly loop: Pick<LoopClient, 'startOrchestration' | 'getOrchestration'>,
    private readonly memory: Pick<MemoryService, 'writeBrief' | 'remember'>,
    private readonly ledger: DigestLedger,
    private readonly clock: Clock,
  ) {}

  async start(
    spaceId: string,
    request: RegisterDigestRequest,
  ): Promise<OrchestrationRunStartedDto> {
    const { registers: named, ...text } = request;
    const brief = await this.memory.writeBrief(spaceId, text.scope);
    const goal = composed({ ...text, spaceId, registers: targetsOf(brief.registers, named) });
    return this.loop.startOrchestration(REGISTER_MEMORY_ORCHESTRATOR_ID, {
      goal,
      maxIterations: REGISTER_DIGEST_MAX_ITERATIONS,
    });
  }

  async get(spaceId: string, orchestrationRunId: string): Promise<DigestDto> {
    const { record, step, report } = await this.read(spaceId, orchestrationRunId);
    const applied = await this.ledger.find(orchestrationRunId);
    return {
      orchestrationRunId,
      status: record.status,
      step: { status: step.status, reason: step.reason, note: step.note, counts: step.counts },
      digestRunId: digestRunOf(step),
      report,
      applied: applied === null ? null : appliedDto(applied),
    };
  }

  async remember(spaceId: string, orchestrationRunId: string): Promise<AppliedDigestDto> {
    const digest = await this.read(spaceId, orchestrationRunId);
    const report = settledReport(orchestrationRunId, digest);
    if ((await this.ledger.find(orchestrationRunId)) !== null) {
      throw alreadyApplied(orchestrationRunId);
    }
    const applied: AppliedDigest = {
      orchestrationRunId,
      spaceId,
      digestRunId: digestRunOf(digest.step),
      items: await this.write(spaceId, digest.index, report),
      appliedAt: this.clock(),
    };
    if ((await this.ledger.record(applied)) === 'exists') throw alreadyApplied(orchestrationRunId);
    return appliedDto(applied);
  }

  private async read(spaceId: string, orchestrationRunId: string): Promise<ReadDigest> {
    const record = await this.loop.getOrchestration(orchestrationRunId);
    const index =
      record?.orchestrator === REGISTER_MEMORY_ORCHESTRATOR_ID
        ? readRegisterDigestIndex(record.request.goal)
        : null;
    // A record carries every step its orchestrator declares; one without the
    // digest step is not a digest this host can read, whatever it is.
    const step = record?.steps[REGISTER_MEMORY_DIGEST_STEP];
    if (record === null || index?.spaceId !== spaceId || step === undefined) {
      throw new HostRefused(
        'run.not_found',
        `memory space ${spaceId} has no digest ${orchestrationRunId}`,
      );
    }
    const report = registerDigestReportSchema.safeParse(step.report);
    return { record, index, step, report: report.success ? report.data : null };
  }

  /** Each endorsed memory written in report order, its outcome or its own refusal answered as its item. */
  private async write(
    spaceId: string,
    index: RegisterDigestIndex,
    report: RegisterDigestReportDto,
  ): Promise<DigestItemDto[]> {
    const endorsed = new Set(report.endorsed);
    const items: DigestItemDto[] = [];
    for (const memory of report.memories) {
      if (endorsed.has(memory.ref)) items.push(await this.writeItem(spaceId, index, memory));
    }
    return items;
  }

  /** One endorsed memory through the runtime's write path: its outcome, or the runtime's refusal of it alone. */
  private async writeItem(
    spaceId: string,
    index: RegisterDigestIndex,
    memory: ProposedMemory,
  ): Promise<DigestItemDto> {
    try {
      const { outcome, record } = await this.memory.remember(spaceId, {
        register: memory.register,
        scope: index.scope,
        candidate: memory.candidate,
        provenance: index.provenance,
        metadata: {},
      });
      return { ref: memory.ref, outcome, recordId: record.id, refusal: null };
    } catch (error) {
      if (!(error instanceof MemoryRefused) || BATCH_REFUSALS.includes(error.code)) throw error;
      const { code, message, issues } = error;
      return { ref: memory.ref, outcome: null, recordId: null, refusal: { code, message, issues } };
    }
  }
}

/**
 * The registers a digest is filed under: the brief's, narrowed to the ones the
 * request names. Refused when a name is not one the space lets a writer
 * remember into, or when none is left.
 */
function targetsOf(
  writable: readonly WritableRegisterDto[],
  named: readonly string[] | null,
): WritableRegisterDto[] {
  const names = writable.map(({ name }) => name);
  const unwritable = (named ?? []).filter((name) => !names.includes(name));
  if (unwritable.length > 0) {
    throw new HostRefused(
      'digest.no_registers',
      `a digest may not write ${unwritable.join(', ')}: the space lets a writer remember into ${names.length > 0 ? names.join(', ') : 'no register'}`,
    );
  }
  const targets =
    named === null ? [...writable] : writable.filter(({ name }) => named.includes(name));
  if (targets.length === 0) {
    throw new HostRefused(
      'digest.no_registers',
      'the space lets a writer remember into no register',
    );
  }
  return targets;
}

/** The goal, or a refusal when it would not fit the engine's budget. */
function composed(input: RegisterDigestInput): string {
  try {
    return renderRegisterDigestGoal(input);
  } catch (error) {
    if (!(error instanceof GoalBudgetExceeded)) throw error;
    throw new HostRefused('digest.too_large', `the digest is too large to judge: ${error.message}`);
  }
}

/** A step as the record says it ended: its status, then its reason and note when it has them. */
const stepSaid = ({ status, reason, note }: OrchestrationStepDto): string =>
  `${status}${reason === null ? '' : ` (${reason})`}${note === null ? '' : `: ${note}`}`;

/** The report a settled digest step left to remember; refused while the digest runs, and when no report reads. */
function settledReport(
  orchestrationRunId: string,
  { record, step, report }: ReadDigest,
): RegisterDigestReportDto {
  if (record.status === 'running') {
    throw new HostRefused(
      'run.in_flight',
      `digest ${orchestrationRunId} is still running; a digest is remembered once it has settled`,
    );
  }
  if (step.status !== 'complete' || report === null) {
    throw new HostRefused(
      'digest.no_report',
      `digest ${orchestrationRunId} left no report that reads: its ${REGISTER_MEMORY_DIGEST_STEP} step is ${stepSaid(step)}`,
    );
  }
  return report;
}

const alreadyApplied = (orchestrationRunId: string): HostRefused =>
  new HostRefused(
    'digest.applied',
    `digest ${orchestrationRunId} has been remembered into its space already`,
  );

/** The register-digest run the step opened; null until it opens one. */
const digestRunOf = (step: OrchestrationStepDto): string | null => step.runIds.at(0) ?? null;

const appliedDto = ({ appliedAt, ...applied }: AppliedDigest): AppliedDigestDto => ({
  ...applied,
  appliedAt: appliedAt.toISOString(),
});
