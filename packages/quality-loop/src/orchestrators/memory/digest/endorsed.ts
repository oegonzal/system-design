/**
 * What a digest endorses, read from the digest run's own outputs: memories no
 * confirmed finding names, with their evidence resolved through the index the
 * digest's goal carries. Over engine facts, never over prose — and over any
 * digest pipeline that proposes `{ evidence, insight, appliesWhen }` items
 * against an aliased index: the experience digest reads a run's findings and
 * criteria, the document digest reads a document's sections, and the store
 * consumes what either endorsed through the same reader. The artifact is read
 * as the seam read the reply — leniently — so a lesson kept whole past its
 * ceiling is stored whole, never a digest refused for it.
 */
import { parseLenient } from '@sysdesign/contracts';
import type { ZodType } from 'zod';

import { admission, type Admission, type RunOutputs } from '../../../core/outputs';
import type { EvidenceRef } from '../ports';

export interface MemoryToStore {
  position: number;
  insight: string;
  appliesWhen: string;
  evidence: EvidenceRef[];
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
  memories: readonly { evidence: readonly string[]; insight: string; appliesWhen: string }[];
}

/** The index every digest goal carries: each alias, what kind of evidence it is, and the id behind it. */
export interface DigestIndexLike {
  evidence: readonly { alias: string; kind: EvidenceRef['kind']; ref: string }[];
}

/** How one digest pipeline's artifact and goal are read: its output schema and its own index reader. */
export interface DigestCodec<D extends DigestLike, I extends DigestIndexLike> {
  schema: ZodType<D>;
  readIndex(goal: string): I | null;
}

/** The location id of the memory at `position` (zero-based) — the place a finding is located at. */
const memoryLocation = (position: number): string => `memory.${position + 1}`;

export function endorsedMemories<D extends DigestLike, I extends DigestIndexLike>(
  outputs: RunOutputs,
  acceptAt: number,
  codec: DigestCodec<D, I>,
): DigestReadout {
  const { best } = outputs;
  const digest = best === null ? null : parseLenient(codec.schema, best.artifact);
  const proposed = digest?.ok ? digest.value.memories.length : 0;
  const verdict = admission(outputs, acceptAt);
  if (verdict !== 'admitted') return { admission: verdict, proposed, memories: [] };
  const index = codec.readIndex(outputs.trace.contract.goal);
  // Admitted, yet not a digest this reader can resolve: nothing of it is drawn on.
  if (best === null || !digest?.ok || index === null) {
    return { admission: 'fell-short', proposed, memories: [] };
  }
  const faulted = new Set(best.ledger.findings.flatMap((finding) => finding.locationRefs));
  const refOf = new Map(index.evidence.map((item) => [item.alias, item]));
  const memories = digest.value.memories.flatMap((memory, position) => {
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
      },
    ];
  });
  return { admission: 'admitted', proposed, memories };
}
