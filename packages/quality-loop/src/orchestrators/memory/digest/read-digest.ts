/**
 * What a digest endorses, read from the experience-digest run's own outputs:
 * memories no confirmed finding names, with their evidence resolved through
 * the index the digest's goal carries. Over engine facts, never over prose.
 */
import { admits, type RunOutputs } from '../../../core/outputs';
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
  /** Whether the run cleared `admits` at all; false means nothing was even considered. */
  admitted: boolean;
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
  if (best === null || !digest?.success) return { admitted: false, proposed: 0, memories: [] };
  const proposed = digest.data.memories.length;
  const index = readDigestIndex(outputs.trace.contract.goal);
  if (index === null || !admits(outputs, acceptAt)) {
    return { admitted: false, proposed, memories: [] };
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
  return { admitted: true, proposed, memories };
}
