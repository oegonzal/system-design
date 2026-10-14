/**
 * What a digest endorses, read from the digest run's own outputs: memories
 * nothing confirmed against it withholds (`withheldItems` — as the digest
 * pipeline declares each finding type withholds), with their evidence
 * resolved through the index the digest's goal carries.
 *
 * Which findings withhold is declared, not assumed. A finding saying a fact is
 * wrong — invented, or a section misread — must withhold every item it names,
 * because storing it is worse than losing it. A finding saying a true fact is
 * merely written weakly — a pronoun where the name belongs, a condition that
 * restates its insight — must withhold nothing: the fact is sound, and dropping
 * it loses a detail the corpus will never answer with. Measured on the first
 * live JSON Lines chunk, where three of eight true facts were withheld for a
 * pronoun. A pipeline that declares nothing keeps the strict default.
 *
 * Over engine facts, never over prose — and over any digest pipeline that
 * proposes `{ evidence, insight, appliesWhen }` items against an aliased
 * index: the experience digest reads a run's findings and criteria, the
 * document digest reads a document's sections, and the store consumes what
 * either endorsed through the same reader. The artifact is read as the seam
 * read the reply — leniently — so a lesson kept whole past its ceiling is
 * stored whole, never a digest refused for it.
 *
 * Which admissions a reader draws on is the caller's to declare. The default
 * is `admitted` alone. A caller may also draw on a run judged below the bar,
 * and then only where the engine's own gates held — an artifact present that
 * the validators passed — with every memory a finding withholds still
 * withheld: what the judges confirmed is honoured, what they merely scored is
 * not a reason to lose a true fact.
 */
import { parseLenient, type Admission, type MemoryScope } from '@sysdesign/contracts';
import type { ZodType } from 'zod';

import {
  admission,
  withheldItems,
  withheldRefs,
  WITHHOLD_EVERY_REF,
  type RunOutputs,
  type WithheldItem,
  type WithholdingRules,
} from '../../../core/outputs';
import type { EvidenceRef } from '../ports';

export interface MemoryToStore {
  position: number;
  insight: string;
  appliesWhen: string;
  evidence: EvidenceRef[];
  /**
   * The source run's iterations the evidence it cites belongs to, ascending
   * — what the store stamps it from; empty when its index names none (a
   * document's sections, or a digest written before its index carried them).
   */
  iterations: number[];
  /**
   * What the stored chunk's kind becomes — the shape a probe may narrow to.
   * Absent when the digest proposes no kind, and the store then falls back to
   * the one kind every memory had before any digest declared one.
   */
  kind?: string;
  /**
   * Where the fact holds, as the digest declared it — or as its document did
   * for every memory, which a reader stamps over the digest's
   * (`readDocumentDigest`); absent from a digest that declares no scope.
   */
  scope?: MemoryScope;
}

export interface DigestReadout {
  /** What `admission` said of the run; anything but `admitted` means no memory was even considered. */
  admission: Admission;
  /** How many memories the digest proposed, faulted or not. */
  proposed: number;
  memories: MemoryToStore[];
  /** Each proposed memory withheld, with what withheld it; empty unless admitted. */
  withheld: WithheldItem[];
}

/** What a digest step hands on: the run that digested, and what it endorsed. */
export interface Digested {
  digestRunId: string;
  memories: MemoryToStore[];
}

/** The item shape every digest pipeline proposes and the store consumes. */
export interface DigestLike {
  memories: readonly {
    evidence: readonly string[];
    insight: string;
    appliesWhen: string;
    /** Declared by digests whose items differ in shape; absent from those whose do not. */
    kind?: string;
    scope?: MemoryScope;
  }[];
}

/**
 * The index every digest goal carries: each alias, what kind of evidence it
 * is, the id behind it and — when its evidence was judged in a run's
 * iterations — which.
 */
export interface DigestIndexLike {
  evidence: readonly {
    alias: string;
    kind: EvidenceRef['kind'];
    ref: string;
    iterations?: readonly number[];
  }[];
}

/**
 * How one digest pipeline's artifact and goal are read: its output schema,
 * its own index reader, and what its finding types — and any validator whose
 * problems name a memory — withhold, as its definition declares them
 * (`withholdingOf(definition)`). Without them, everything confirmed against a
 * memory withholds it.
 */
export interface DigestCodec<D extends DigestLike, I extends DigestIndexLike> {
  schema: ZodType<D>;
  readIndex(goal: string): I | null;
  withholding?: WithholdingRules;
}

/** The location id of the memory at `position` (zero-based) — the place a finding is located at. */
const memoryLocation = (position: number): string => `memory.${position + 1}`;

/** The one admission every reader draws on unless it declares more. */
export const ADMITTED_ONLY: readonly Admission[] = ['admitted'];

export function endorsedMemories<D extends DigestLike, I extends DigestIndexLike>(
  outputs: RunOutputs,
  acceptAt: number,
  codec: DigestCodec<D, I>,
  /** The admissions this reader draws on; a run admitted otherwise proposes its memories and endorses none. */
  admits: readonly Admission[] = ADMITTED_ONLY,
): DigestReadout {
  const { best } = outputs;
  const digest = best === null ? null : parseLenient(codec.schema, best.artifact);
  const proposed = digest?.ok ? digest.value.memories.length : 0;
  const verdict = admission(outputs, acceptAt);
  if (!admits.includes(verdict))
    return { admission: verdict, proposed, memories: [], withheld: [] };
  const index = codec.readIndex(outputs.trace.contract.goal);
  // Drawn on, yet not a digest this reader can resolve: nothing of it is used.
  if (best === null || !digest?.ok || index === null) {
    return { admission: 'fell-short', proposed, memories: [], withheld: [] };
  }
  // Below the bar, a digest is drawn on only where the engine's own gates held.
  if (
    verdict !== 'admitted' &&
    !(best.ledger.artifactPresent && best.decision.gates.validatorsPassed)
  ) {
    return { admission: verdict, proposed, memories: [], withheld: [] };
  }
  const withheld = withheldItems(
    best.ledger,
    digest.value.memories.map((_, position) => memoryLocation(position)),
    codec.withholding ?? WITHHOLD_EVERY_REF,
  );
  const faulted = withheldRefs(withheld);
  const refOf = new Map(index.evidence.map((item) => [item.alias, item]));
  const memories = digest.value.memories.flatMap((memory, position) => {
    if (faulted.has(memoryLocation(position))) return [];
    const cited = memory.evidence.flatMap((name) => {
      const item = refOf.get(name);
      return item ? [item] : [];
    });
    return [
      {
        position: position + 1,
        insight: memory.insight,
        appliesWhen: memory.appliesWhen,
        evidence: cited.map((item) => ({ kind: item.kind, ref: item.ref })),
        iterations: [...new Set(cited.flatMap((item) => item.iterations ?? []))].sort(
          (a, b) => a - b,
        ),
        ...(memory.kind === undefined ? {} : { kind: memory.kind }),
        ...(memory.scope === undefined ? {} : { scope: memory.scope }),
      },
    ];
  });
  return { admission: verdict, proposed, memories, withheld };
}
