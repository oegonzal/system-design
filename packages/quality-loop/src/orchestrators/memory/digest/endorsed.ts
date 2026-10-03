/**
 * What a digest endorses, read from the digest run's own outputs: the memories
 * its findings do not withhold, with their evidence resolved through the index
 * the digest's goal carries.
 *
 * Which findings withhold is declared, not assumed. A finding saying a fact is
 * wrong — invented, or a section misread — must withhold every item it names,
 * because storing it is worse than losing it. A finding saying a true fact is
 * merely written weakly — a pronoun where the name belongs, a condition that
 * restates its insight — must withhold nothing: the fact is sound, and dropping
 * it loses a detail the corpus will never answer with. Measured on the first
 * live JSON Lines chunk, where three of eight true facts were withheld for a
 * pronoun. A pipeline that declares no table keeps the strict default. Over engine facts, never over prose — and over any
 * digest pipeline that proposes `{ evidence, insight, appliesWhen }` items
 * against an aliased index: the experience digest reads a run's findings and
 * criteria, the document digest reads a document's sections, and the store
 * consumes what either endorsed through the same reader.
 */
import type { ZodType } from 'zod';

import { admission, type Admission, type RunOutputs } from '../../../core/outputs';
import type { EvidenceRef } from '../ports';

export interface MemoryToStore {
  position: number;
  insight: string;
  appliesWhen: string;
  evidence: EvidenceRef[];
  /**
   * What the stored chunk's kind becomes — the shape a probe may narrow to.
   * Absent when the digest proposes no kind, and the store then falls back to
   * the one kind every memory had before any digest declared one.
   */
  kind?: string;
}

export interface DigestReadout {
  /** What `admission` said of the run; anything but `admitted` means no memory was even considered. */
  admission: Admission;
  /** How many memories the digest proposed, faulted or not. */
  proposed: number;
  memories: MemoryToStore[];
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
  }[];
}

/** The index every digest goal carries: each alias, what kind of evidence it is, and the id behind it. */
export interface DigestIndexLike {
  evidence: readonly { alias: string; kind: EvidenceRef['kind']; ref: string }[];
}

/** What a finding of some type withholds from the store. */
export const WITHHOLDS = ['every-ref', 'all-but-one', 'none'] as const;
export type Withhold = (typeof WITHHOLDS)[number];

/**
 * What a finding withholds when its pipeline declares nothing for its type:
 * every item it names. A new finding type is strict until someone decides it is
 * not, which is the safe direction for a store of facts about a person.
 */
export const DEFAULT_WITHHOLD: Withhold = 'every-ref';

/** How one digest pipeline's artifact and goal are read: its output schema and its own index reader. */
export interface DigestCodec<D extends DigestLike, I extends DigestIndexLike> {
  schema: ZodType<D>;
  readIndex(goal: string): I | null;
  /** What each finding type withholds; a type not named here withholds by the default. */
  withholds?: Readonly<Record<string, Withhold>>;
}

/** The items a run's findings withhold, by the declared rule for each finding's type. */
export function withheldRefs(
  findings: readonly { type: string; locationRefs: readonly string[] }[],
  withholds: Readonly<Record<string, Withhold>> = {},
): Set<string> {
  const refs = new Set<string>();
  for (const finding of findings) {
    const rule = withholds[finding.type] ?? DEFAULT_WITHHOLD;
    if (rule === 'none') continue;
    // `all-but-one` is for a finding that faults a set for sharing something —
    // two memories stating one fact — where keeping one of them is the repair.
    const named = rule === 'all-but-one' ? finding.locationRefs.slice(1) : finding.locationRefs;
    for (const ref of named) refs.add(ref);
  }
  return refs;
}

/** The location id of the memory at `position` (zero-based) — the place a finding is located at. */
const memoryLocation = (position: number): string => `memory.${position + 1}`;

export function endorsedMemories<D extends DigestLike, I extends DigestIndexLike>(
  outputs: RunOutputs,
  acceptAt: number,
  codec: DigestCodec<D, I>,
): DigestReadout {
  const { best } = outputs;
  const digest = best === null ? null : codec.schema.safeParse(best.artifact);
  const proposed = digest?.success ? digest.data.memories.length : 0;
  const verdict = admission(outputs, acceptAt);
  if (verdict !== 'admitted') return { admission: verdict, proposed, memories: [] };
  const index = codec.readIndex(outputs.trace.contract.goal);
  // Admitted, yet not a digest this reader can resolve: nothing of it is drawn on.
  if (best === null || !digest?.success || index === null) {
    return { admission: 'fell-short', proposed, memories: [] };
  }
  const faulted = withheldRefs(best.ledger.findings, codec.withholds);
  const refOf = new Map(index.evidence.map((item) => [item.alias, item]));
  const memories = digest.data.memories.flatMap((memory, position) => {
    if (faulted.has(memoryLocation(position))) return [];
    const evidence = memory.evidence.flatMap((name) => {
      const item = refOf.get(name);
      return item ? [{ kind: item.kind, ref: item.ref }] : [];
    });
    return [
      {
        position: position + 1,
        insight: memory.insight,
        appliesWhen: memory.appliesWhen,
        evidence,
        ...(memory.kind === undefined ? {} : { kind: memory.kind }),
      },
    ];
  });
  return { admission: 'admitted', proposed, memories };
}
