/**
 * What a knowledge digest endorses: the generic reader bound to this pipeline's
 * schema and index, and then the typed half of each item read off the artifact
 * beside it.
 *
 * The admission rule, the per-item exclusion and the resolution of evidence
 * aliases are `endorsedMemories`' and stay there — three digests bind that one
 * function, and a second copy of the rule would mean one fault meaning
 * different things in different pipelines. What this adds is only what the
 * generic item shape has no room for: the kind, the topics, and the claims about
 * what is already stored. They are zipped on by `position`, which the reader
 * already hands back, so the shared file needs no widening.
 *
 * The claims are resolved against what the step recalled rather than against the
 * goal, because a claim is pinned to the exact text it was made about and a text
 * hash in the goal would be noise to every stage that reads it. The goal's index
 * still lists the aliases — that is what the references validator holds the
 * digest to — so an alias the digest invented is refused before this is reached.
 */
import type { RunOutputs } from '../../../core/outputs';
import { readIndex } from '../../../pipelines/knowledge-digest/input';
import {
  knowledgeDigestSchema,
  polarityOf,
  type KnowledgeItem,
} from '../../../pipelines/knowledge-digest/output';
import {
  endorsedMemories,
  type DigestReadout,
  type MemoryToStore,
} from '../../memory/digest/endorsed';
import type { PointRef } from '../../memory/ports';

/** A stored item as the digest was shown it: the alias it cites, the point, and the text it saw. */
export interface KnownRef {
  alias: string;
  point: PointRef;
  contentHash: string;
}

/** A claim one run's evidence makes about one stored item. */
export interface SupportClaim {
  point: PointRef;
  contentHash: string;
}

/**
 * An endorsed item with the typed half of what the digest wrote. An item that
 * confirms anything is not stored again — its evidence becomes support for what
 * is already there, which is what `storable: false` says.
 */
export interface KnowledgeToStore extends MemoryToStore {
  kind: KnowledgeItem['kind'];
  polarity: 'do' | 'avoid' | null;
  dimension: string;
  topics: string[];
  confirms: SupportClaim[];
  contradicts: SupportClaim[];
  storable: boolean;
}

export interface KnowledgeReadout extends Omit<DigestReadout, 'memories'> {
  memories: KnowledgeToStore[];
  /** Claims naming an alias the recall did not hand over; counted, never guessed at. */
  unresolved: number;
}

const codec = { schema: knowledgeDigestSchema, readIndex };

export function readKnowledgeDigest(
  outputs: RunOutputs,
  acceptAt: number,
  known: readonly KnownRef[],
): KnowledgeReadout {
  const base = endorsedMemories(outputs, acceptAt, codec);
  const best = outputs.best;
  if (base.admission !== 'admitted' || best === null) {
    return { ...base, memories: [], unresolved: 0 };
  }

  const parsed = knowledgeDigestSchema.safeParse(best.artifact);
  // Admitted and resolvable is what `endorsedMemories` already established; if
  // the artifact is somehow unreadable here, nothing of it is drawn on.
  if (!parsed.success) return { ...base, admission: 'fell-short', memories: [], unresolved: 0 };

  const byAlias = new Map(known.map((item) => [item.alias, item]));
  let unresolved = 0;
  const claimsOf = (aliases: readonly string[]): SupportClaim[] =>
    aliases.flatMap((alias) => {
      const item = byAlias.get(alias);
      if (item === undefined) {
        unresolved += 1;
        return [];
      }
      return [{ point: item.point, contentHash: item.contentHash }];
    });

  const memories = base.memories.flatMap((memory): KnowledgeToStore[] => {
    const item = parsed.data.memories[memory.position - 1];
    if (item === undefined) return [];
    const confirms = claimsOf(item.confirms);
    const contradicts = claimsOf(item.contradicts);
    return [
      {
        ...memory,
        kind: item.kind,
        polarity: polarityOf(item.kind),
        dimension: item.dimension,
        topics: [...item.topics],
        confirms,
        contradicts,
        // An item that confirms what is stored reinforces it; storing it again is
        // the duplication the delta exists to prevent. One that only contradicts
        // is stored, because what holds instead is knowledge of its own.
        storable: confirms.length === 0,
      },
    ];
  });

  return { ...base, memories, unresolved };
}
