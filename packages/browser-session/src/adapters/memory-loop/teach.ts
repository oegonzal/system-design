import { createHash } from 'node:crypto';

import {
  MemoryHostRefused,
  type BoundSpace,
  type MemoryClient,
  type RememberRequest,
} from '@sysdesign/agentic-memory-client';
import {
  REGISTER_KIND_DECLARATIONS,
  excerpt,
  quoted,
  rememberRequestSchema,
  type OperatorGuidanceDto,
  type WriteResultDto,
} from '@sysdesign/contracts';

import type { SessionStepRef, TeachReceipt } from '../../core/ports';
import type { MemoryBrainSettings } from '../../settings';
import { scopeOf, TEACH_METADATA, TEACH_REGISTER_KIND } from './binding';

/**
 * An operator's answer taught to the space as one deterministic fact — no
 * model in the path. The fact's identity is the subject and the question,
 * hashed as its predicate, so the same question is one record whatever its
 * length: the same answer again leaves it unchanged, a new one supersedes it
 * with the history kept. The fact's words carry the question, the options the
 * answer was chosen among and the answer, so a recall by a form's question
 * finds it by meaning; where and on which channel it was given is provenance,
 * and the fields the binding declares of the teach register are its metadata.
 * The scope is the one the answerer declared the question holds in: of the
 * subject wherever asked, or of the unit of work it was given in. A fact the
 * register's candidate shape refuses — a value past its ceiling — is not
 * written and reported refused, never cut. Each answer is its own receipt.
 */

/** The predicate an answer is kept under: the question hashed, so one question is one identity. */
const PREDICATE_PREFIX = 'asked.';

/**
 * The identity a question's answer is kept under — what the brain writes, and
 * what a reader of a recalled record tells a standing answer by: the same
 * question, however many times it is answered, is this one predicate.
 */
export const predicateOf = (question: string): string =>
  `${PREDICATE_PREFIX}${createHash('sha256').update(question).digest('hex')}`;

/** Who wrote the fact: the operator, on the channel the answer came by. */
const PROVENANCE_SOURCE_PREFIX = 'operator:';

/** The most characters a metadata value may run to, read off the wire shape every write is parsed with. */
const METADATA_VALUE_MAX_LENGTH =
  rememberRequestSchema.shape.metadata.unwrap().valueType.maxLength ?? Number.MAX_SAFE_INTEGER;

/**
 * The status from which a host's answer is the host failing, not refusing the
 * fact: a write such a host did not take is the brain's fault, counted by the
 * session's rail, never a refusal recorded against the answer as if the fact
 * were at fault.
 */
const HOST_FAILING_FROM = 500;

/** The fact as the register's text embeds it: the question's words, the options it was chosen among, the subject's answer. */
const factValueOf = (answer: OperatorGuidanceDto, subject: string): string => {
  const options =
    answer.field.options === null ? '' : `, offering ${answer.field.options.join(' | ')}`;
  return `Asked ${quoted(answer.field.question)}${options}, ${subject} answered ${quoted(answer.answer)}.`;
};

/** An answer this adapter declines to write, before the host is asked, and why. */
class NotTaught extends Error {
  override readonly name = 'NotTaught';
}

/** The declared metadata of the teach register, each field filled from the answer, within the value's bound. */
function metadataOf(
  settings: MemoryBrainSettings,
  answer: OperatorGuidanceDto,
): Record<string, string> {
  const declared = settings.binding.registers[settings.teach]?.metadata ?? [];
  return Object.fromEntries(
    declared.flatMap((field) => {
      const read = TEACH_METADATA[field];
      return read === undefined ? [] : [[field, excerpt(read(answer), METADATA_VALUE_MAX_LENGTH)]];
    }),
  );
}

/**
 * The unit of work the fact is kept under, by the scope the answerer declared
 * — the unit's key for `unit`, none for `subject`, and when no answerer
 * declared one, the open unit's key or none. An answer declared about a unit
 * when none was open is nobody's fact to place: not written, and said so.
 */
function unitKeyOf(bound: BoundSpace, answer: OperatorGuidanceDto): string | null {
  const openUnit = answer.context.unitKey;
  const about = answer.about ?? (openUnit === null ? 'subject' : 'unit');
  if (about === 'subject') return null;
  if (openUnit === null) {
    throw new NotTaught(
      'the answer is declared about the unit of work, and none was open when it was given',
    );
  }
  if (bound.scope.unit === null) {
    throw new NotTaught(
      'the answer is declared about the unit of work, and the binding declares no unit key to keep it under',
    );
  }
  return openUnit;
}

/** The write for one answer, every part of it declared data or refused before the host is asked. */
function requestOf(
  bound: BoundSpace,
  settings: MemoryBrainSettings,
  tenant: string,
  answer: OperatorGuidanceDto,
  session: SessionStepRef,
  subject: string,
): RememberRequest {
  const register = bound.registers[settings.teach];
  if (register === undefined) throw new Error(`the binding has no role ${settings.teach}`);
  const unitKey = unitKeyOf(bound, answer);
  const candidate = REGISTER_KIND_DECLARATIONS[TEACH_REGISTER_KIND].candidate.safeParse({
    subject,
    predicate: predicateOf(answer.field.question),
    value: factValueOf(answer, subject),
    validFrom: answer.capturedAt,
  });
  if (!candidate.success) {
    const faults = candidate.error.issues
      .map((issue) => `${issue.path.join('.')} ${issue.message}`)
      .join('; ');
    throw new NotTaught(`the fact is not one the register takes, and is not written: ${faults}`);
  }
  return {
    register,
    scope: scopeOf(bound, tenant, settings.project, unitKey),
    candidate: candidate.data,
    provenance: {
      source: `${PROVENANCE_SOURCE_PREFIX}${answer.via}`,
      sourceRunId: session.sessionId,
    },
    metadata: metadataOf(settings, answer),
  };
}

/** The write, sent again once when another write to the register landed first. */
async function rememberRidingConflict(
  client: MemoryClient,
  spaceId: string,
  request: RememberRequest,
): Promise<WriteResultDto> {
  try {
    return await client.remember(spaceId, request);
  } catch (error) {
    if (error instanceof MemoryHostRefused && error.code === 'conflict') {
      return client.remember(spaceId, request);
    }
    throw error;
  }
}

/**
 * Whether an error is a refusal of the answer — by this adapter before the
 * host, or by the host in its own words — rather than a host that is failing:
 * a server error says nothing of the fact, and is left to the brain's fault
 * table.
 */
const refusedTheAnswer = (error: unknown): error is NotTaught | MemoryHostRefused =>
  error instanceof NotTaught ||
  (error instanceof MemoryHostRefused && error.status < HOST_FAILING_FROM);

/** One answer written, or refused — before the host, or by the host in its own words. A host nobody answers, or one failing, throws. */
async function rememberOne(
  client: MemoryClient,
  bound: BoundSpace,
  settings: MemoryBrainSettings,
  tenant: string,
  answer: OperatorGuidanceDto,
  session: SessionStepRef,
  subject: string,
): Promise<TeachReceipt> {
  try {
    const request = requestOf(bound, settings, tenant, answer, session, subject);
    const written = await rememberRidingConflict(client, bound.spaceId, request);
    return { ref: written.record.id, outcome: written.outcome, fault: null };
  } catch (error) {
    if (refusedTheAnswer(error)) return { ref: null, outcome: 'refused', fault: error.message };
    throw error;
  }
}

/**
 * The answers taught in order, each its own fact on the teach register and
 * its own receipt, in the answers' order. A refusal is that answer's receipt
 * and stops nothing after it; a host that does not answer, or is failing,
 * throws as the brain's fault, and the answers after it are not attempted.
 */
export async function rememberAnswers(
  client: MemoryClient,
  bound: BoundSpace,
  settings: MemoryBrainSettings,
  tenant: string,
  answers: readonly OperatorGuidanceDto[],
  session: SessionStepRef,
  subject: string,
): Promise<TeachReceipt[]> {
  const receipts: TeachReceipt[] = [];
  for (const answer of answers) {
    receipts.push(await rememberOne(client, bound, settings, tenant, answer, session, subject));
  }
  return receipts;
}
