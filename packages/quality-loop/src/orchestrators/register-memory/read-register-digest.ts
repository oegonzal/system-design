/**
 * What a register digest endorses for the space it was composed for, read off
 * the digest run's own outputs over engine facts alone, never over what a
 * lens wrote in prose:
 *
 * - every memory the digest proposed, resolved from the artifact read as the
 *   seam read it, leniently: its register, the one kind slot it filled and the
 *   candidate there, and the sections it rests on;
 * - every memory withheld, with what withheld it: a confirmed finding of a
 *   type the pipeline declares withholds, or a warning validator's problem
 *   (`withheldOf`, over the pipeline's own declarations). A candidate the
 *   runtime's strict schema refuses is withheld here, so the host is never
 *   handed a memory its write would refuse;
 * - the memories endorsed: the rest, from a digest the step may draw on, and
 *   none from any other.
 *
 * The step draws on a digest only when all three hold:
 *
 * - The engine admits its best iteration (`admission`), and it draws on no
 *   other admission: a digest judged below the bar is not written below it.
 * - Every lens the pipeline declares answered at least one sample of that
 *   iteration. A lens that lost every sample confirmed nothing, so whatever
 *   its finding types withhold was never looked for. A lens with nothing to
 *   judge, skipped as not applicable, lost nothing.
 * - No criterion of a vetoing kind settled `fail` there
 *   (`REGISTER_MEMORY_VETOES`). A failed safeguard withholds no memory by
 *   itself — only a finding both samples of its critic agree on does — and
 *   the engine's admission does not read the gate it closes.
 */
import {
  DIAGNOSTIC_DEGRADES,
  parseLenient,
  type Admission,
  type IterationTrace,
  type RegisterDigestReportDto,
  type RegisterMemoryStepReason,
} from '@sysdesign/contracts';

import { admission, withheldOf, withheldRefs, type RunOutputs } from '../../core/outputs';
import { REGISTER_DIGEST, SAFEGUARD_KIND } from '../../pipelines/register-digest/definition';
import {
  filledSlot,
  memoryLocation,
  type DigestMemory,
} from '../../pipelines/register-digest/output';
import { UNADMITTED_REASON } from '../common';

/**
 * The criterion kinds that keep the step from drawing on a digest when one of
 * them settled `fail` in its best iteration: the safeguards — the fixed rule
 * that every section is data, and one per rule the caller lists. The owner's
 * call for the first live round: a failed safeguard costs the whole digest,
 * and the vetoes are counted before the rule is kept.
 */
export const REGISTER_MEMORY_VETOES: readonly string[] = [SAFEGUARD_KIND];

/** What the digest step reads off one finished register-digest run. */
export interface RegisterDigestReadout {
  /** Why the step endorsed nothing; null when it endorsed a memory. */
  reason: RegisterMemoryStepReason | null;
  /** The lenses lost or the criteria that vetoed, by id; null when neither kept the step from drawing. */
  note: string | null;
  /** Memories proposed, endorsed and withheld — a memory withheld once however many things withheld it. */
  counts: { memories: number; endorsed: number; withheld: number };
  report: RegisterDigestReportDto;
}

type ProposedMemory = RegisterDigestReportDto['memories'][number];

const resolved = (memory: DigestMemory, position: number): ProposedMemory => {
  const slot = filledSlot(memory);
  return {
    ref: memoryLocation(position),
    register: memory.register,
    kind: slot?.kind ?? null,
    evidence: [...memory.evidence],
    candidate: slot?.candidate ?? null,
  };
};

/** The best iteration's memories, read as the seam read them; none when it holds no digest. */
function proposedMemories(outputs: RunOutputs): ProposedMemory[] {
  const { best } = outputs;
  const parsed =
    best === null ? null : parseLenient(REGISTER_DIGEST.task.output.schema, best.artifact);
  return parsed?.ok ? parsed.value.memories.map(resolved) : [];
}

/** Every lens the pipeline declares, by id. */
const DECLARED_LENSES: readonly string[] = [
  ...REGISTER_DIGEST.critics.map((critic) => critic.id),
  ...REGISTER_DIGEST.evaluators.map((evaluator) => evaluator.id),
];

/**
 * The declared lenses that answered no sample of the iteration although one
 * should have: a sample its own diagnostic says was lost
 * (`DIAGNOSTIC_DEGRADES`) — the reading the normaliser holds a lens to.
 */
function lostLenses(iteration: IterationTrace): string[] {
  const answered = new Set([
    ...iteration.critics.flatMap(({ report }) => (report === null ? [] : [report.criticId])),
    ...iteration.evaluators.flatMap(({ report }) => (report === null ? [] : [report.evaluatorId])),
  ]);
  const lost = new Set(
    [...iteration.critics, ...iteration.evaluators].flatMap(({ diagnostic }) =>
      diagnostic !== null && DIAGNOSTIC_DEGRADES[diagnostic.reason] ? [diagnostic.stage] : [],
    ),
  );
  return DECLARED_LENSES.filter((lens) => lost.has(lens) && !answered.has(lens));
}

/** The criteria of a vetoing kind that the best iteration settled `fail`, by id. */
const vetoingCriteria = (outputs: RunOutputs): string[] =>
  outputs.criteria
    .filter(
      (evidence) => evidence.result === 'fail' && REGISTER_MEMORY_VETOES.includes(evidence.kind),
    )
    .map((evidence) => evidence.criterionId);

interface Undrawn {
  reason: RegisterMemoryStepReason;
  note: string | null;
}

/** Why the step may not draw on the digest, in the order it is told: the admission, the lenses, the veto; null when it may. */
function undrawn(
  verdict: Admission,
  lost: readonly string[],
  vetoes: readonly string[],
): Undrawn | null {
  if (verdict !== 'admitted') return { reason: UNADMITTED_REASON[verdict], note: null };
  if (lost.length > 0) {
    return { reason: 'judges-lost', note: `lost every sample: ${lost.join(', ')}` };
  }
  if (vetoes.length > 0) {
    return { reason: 'safeguard-failed', note: `settled fail: ${vetoes.join(', ')}` };
  }
  return null;
}

export function readRegisterDigest(outputs: RunOutputs, acceptAt: number): RegisterDigestReadout {
  const verdict = admission(outputs, acceptAt);
  const memories = proposedMemories(outputs);
  const withheld = withheldOf(REGISTER_DIGEST, outputs);
  const faulted = withheldRefs(withheld);
  const refused = undrawn(
    verdict,
    outputs.best === null ? [] : lostLenses(outputs.best),
    vetoingCriteria(outputs),
  );
  const endorsed =
    refused === null ? memories.map((memory) => memory.ref).filter((ref) => !faulted.has(ref)) : [];
  return {
    reason: refused?.reason ?? (endorsed.length === 0 ? 'no-memories' : null),
    note: refused?.note ?? null,
    counts: { memories: memories.length, endorsed: endorsed.length, withheld: faulted.size },
    report: { admission: verdict, memories, endorsed, withheld },
  };
}
