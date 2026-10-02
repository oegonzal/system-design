/**
 * What a digest endorses, read from the experience-digest run's own outputs:
 * memories no confirmed finding names, with their evidence resolved through
 * the index the digest's goal carries. Over engine facts, never over prose.
 */
import { admission, type Admission, type RunOutputs } from '../../../core/outputs';
import { readIndex as readDigestIndex } from '../../../pipelines/experience-digest/input';
import { experienceDigestSchema } from '../../../pipelines/experience-digest/output';
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

/** What the digest step hands on: the run that digested, and what it endorsed. */
export interface Digested {
  digestRunId: string;
  memories: MemoryToStore[];
}

export function memoriesToStore(outputs: RunOutputs, acceptAt: number): DigestReadout {
  const { best } = outputs;
  const digest = best === null ? null : experienceDigestSchema.safeParse(best.artifact);
  const proposed = digest?.success ? digest.data.memories.length : 0;
  const verdict = admission(outputs, acceptAt);
  if (verdict !== 'admitted') return { admission: verdict, proposed, memories: [] };
  const index = readDigestIndex(outputs.trace.contract.goal);
  // Admitted, yet not a digest this reader can resolve: nothing of it is drawn on.
  if (best === null || !digest?.success || index === null) {
    return { admission: 'fell-short', proposed, memories: [] };
  }
  const faulted = new Set(best.ledger.findings.flatMap((finding) => finding.locationRefs));
  const refOf = new Map(index.evidence.map((item) => [item.alias, item]));
  const memories = digest.data.memories.flatMap((memory, position) => {
    const id = `memory.${position + 1}`;
    if (faulted.has(id)) return [];
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
