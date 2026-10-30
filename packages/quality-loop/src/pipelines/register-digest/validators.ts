/**
 * The exact checks: what the index says against what the digest wrote. All
 * four warn, each at the one memory it names, and each withholds that memory
 * alone (`every-ref`): a fault in one memory never refuses the digest, and
 * reaches a revise as a remediation. They are four validators, not one, so a
 * reader counts what withheld a memory by cause — as data, never as prose.
 *
 * - `references`: every section a memory rests on is one the goal lists.
 * - `register`: the memory is filed under a listed register — only registers
 *   a writer may remember into are listed — and fills exactly one slot, of
 *   that register's kind.
 * - `candidate`: the filled slot is one the runtime's own candidate schema
 *   accepts, strictly. The model's view relaxes each valid time to text and the
 *   lenient read keeps text past the runtime's ceiling, so a malformed time,
 *   an undated episode or an overlong value is withheld here, by the loop,
 *   rather than refused by the runtime when the memory is written.
 * - `reserved`: the memory takes no identity value its register keeps for
 *   what consolidation writes into it.
 *
 * Nothing here reads prose: every rule is a lookup against what the codec
 * wrote into the index, or the runtime's own schema.
 */
import {
  REGISTER_KIND_DECLARATIONS,
  quotedJson,
  schemaIssuesOf,
  type ValidationProblem,
} from '@sysdesign/contracts';

import {
  asWarning,
  indexedValidator,
  problem,
  REFERENCES_VALIDATOR_ID,
  type IndexedRule,
} from '../../core/contracts';
import type { Validator } from '../../core/ports';
import { readIndex, REGISTER_DIGEST_ID, type RegisterDigestIndex } from './input';
import {
  filledSlot,
  filledSlots,
  memoryLocation,
  type DigestMemory,
  type FilledSlot,
  type RegisterDigest,
} from './output';

type Rule = IndexedRule<RegisterDigest, RegisterDigestIndex>;
type Register = RegisterDigestIndex['registers'][number];

/** Each memory's faults, as problems located at that memory alone. */
const perMemory = (
  digest: RegisterDigest,
  faultsOf: (memory: DigestMemory, location: string) => string[],
): ValidationProblem[] =>
  digest.memories.flatMap((memory, position) => {
    const location = memoryLocation(position);
    return faultsOf(memory, location).map((message) => problem('high', message, [location]));
  });

const registersOf = (index: RegisterDigestIndex): ReadonlyMap<string, Register> =>
  new Map(index.registers.map((register) => [register.name, register]));

const unlistedSections: Rule = (digest, index) => {
  const listed = new Set(index.sections);
  return perMemory(digest, (memory, location) =>
    memory.evidence
      .filter((alias) => !listed.has(alias))
      .map((alias) => `${location} rests on ${alias}, which is not a listed section`),
  );
};

/** What is wrong with the slots a memory filled, against the register it names. */
function slotFaults(
  slots: readonly FilledSlot[],
  listed: Register | undefined,
  location: string,
): string[] {
  if (slots.length !== 1) {
    const filled =
      slots.length === 0
        ? 'no kind slot'
        : `${slots.length} kind slots (${slots.map((slot) => slot.kind).join(', ')})`;
    return [`${location} fills ${filled}; a memory fills exactly one`];
  }
  const [slot] = slots;
  if (listed === undefined || slot.kind === listed.kind) return [];
  return [
    `${location} fills the ${slot.kind} slot, and ${quotedJson(listed.name)} keeps ${listed.kind} memories`,
  ];
}

const misfiledSlots: Rule = (digest, index) => {
  const registers = registersOf(index);
  return perMemory(digest, (memory, location) => {
    const listed = registers.get(memory.register);
    const unlisted =
      listed === undefined
        ? [
            `${location} is filed under ${quotedJson(memory.register)}, which is not a listed register`,
          ]
        : [];
    return [...unlisted, ...slotFaults(filledSlots(memory), listed, location)];
  });
};

/** The index plays no part: the runtime's schema is the whole rule. */
const refusedCandidates: Rule = (digest) =>
  perMemory(digest, (memory, location) => {
    const slot = filledSlot(memory);
    if (slot === null) return [];
    const parsed = REGISTER_KIND_DECLARATIONS[slot.kind].candidate.safeParse(slot.candidate);
    if (parsed.success) return [];
    const faults = schemaIssuesOf(parsed.error.issues).map(
      (issue) => `${issue.path}: ${issue.message}`,
    );
    return [
      `${location} writes a candidate the runtime's ${slot.kind} schema refuses — ${faults.join('; ')}`,
    ];
  });

const reservedIdentities: Rule = (digest, index) => {
  const registers = registersOf(index);
  return perMemory(digest, (memory, location) => {
    const slot = filledSlot(memory);
    if (slot === null) return [];
    const keeps = registers.get(memory.register)?.reserved ?? [];
    return keeps
      .filter(({ field, value }) => slot.candidate[field] === value)
      .map(
        ({ field, value }) =>
          `${location} takes ${field} = ${quotedJson(value)}, which ${quotedJson(memory.register)} keeps for what consolidation writes`,
      );
  });
};

/** A warning over the index that withholds the one memory each problem names. */
const withholdingEach = (
  id: string,
  rule: Rule,
  whenNoIndex: ValidationProblem[] = [],
): Validator<RegisterDigest> =>
  asWarning(indexedValidator(id, readIndex, rule, whenNoIndex), 'every-ref');

export const referencesValidator = withholdingEach(REFERENCES_VALIDATOR_ID, unlistedSections, [
  problem('critical', `the goal carries no ${REGISTER_DIGEST_ID} index`),
]);
export const registerValidator = withholdingEach('register', misfiledSlots);
export const candidateValidator = withholdingEach('candidate', refusedCandidates);
export const reservedValidator = withholdingEach('reserved', reservedIdentities);
