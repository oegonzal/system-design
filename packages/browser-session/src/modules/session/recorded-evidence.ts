import {
  evidenceItemSchema,
  FIELD_EVIDENCE_HEADING,
  MEMORY_SCOPES,
  readEvidenceItems,
  readFieldIndex,
  type EvidenceItem,
} from '@sysdesign/contracts';

/**
 * The evidence a recorded form goal lists, read back by whichever codec wrote
 * it — the versioned read the replay rests on. A goal recorded today reads by
 * the codec's own inverse (`readEvidenceItems`). One the loop's recall wrote
 * before an item's source was generalised lists each item on a line of the
 * previous grammar,
 *
 *   - [alias] <kind> · <scope> — <text> · stored <when> · <pipeline> <ref> (run <runId>)
 *
 * and is read by that grammar alone, mapped onto today's shape: the origin is
 * the pipeline that digested the fact, the address the run and the ref within
 * it as one token — the address today's loop writes for the same point. The
 * recorded goals are fixed data, so their grammar is fixed here beside them;
 * a goal neither codec reads whole is null, never half-read.
 */

/** The heading every recorded form goal closes its evidence with — the codec's then and now. */
const LIMITS_HEADING = '## Limits';
const EVIDENCE_MARKER = `\n${FIELD_EVIDENCE_HEADING}\n`;
const LIMITS_MARKER = `\n${LIMITS_HEADING}\n`;

/** An item's line as the previous codec wrote it: the head ends at the scope word, the tail begins at the last `stored` a tail follows. */
const PREVIOUS_LINE = new RegExp(
  `^- \\[([^\\]]+)\\] (.+?) · (${MEMORY_SCOPES.join('|')}) — (.*) · stored (.*?) · (\\S+) (\\S+) \\(run (\\S+)\\)$`,
);

/** One item from a line of the previous grammar, in today's shape; null for a line of any other shape. */
function previousItem(line: string): EvidenceItem | null {
  const match = PREVIOUS_LINE.exec(line);
  if (match === null) return null;
  const [, alias, kind, scope, text, when, pipeline, ref, runId] = match;
  const parsed = evidenceItemSchema.safeParse({
    alias,
    text,
    when,
    scope,
    kind,
    source: { origin: pipeline, ref: `${runId}#${ref}` },
  });
  return parsed.success ? parsed.data : null;
}

/**
 * The items of the evidence section read by the previous grammar: every list
 * line an item, and the items exactly those the index lists, in order — or
 * null. The section runs from the evidence heading to the Limits, as it did
 * then; a goal listing none in its index and holding no section lists none.
 */
function readPreviousItems(goal: string, listed: readonly string[]): EvidenceItem[] | null {
  const at = goal.lastIndexOf(EVIDENCE_MARKER);
  const end = at < 0 ? -1 : goal.indexOf(LIMITS_MARKER, at + EVIDENCE_MARKER.length);
  if (end < 0) return listed.length === 0 ? [] : null;
  const items: EvidenceItem[] = [];
  for (const line of goal.slice(at + EVIDENCE_MARKER.length, end).split('\n')) {
    if (!line.startsWith('- ')) continue;
    const item = previousItem(line);
    if (item === null) return null;
    items.push(item);
  }
  return items.map((item) => item.alias).join(' ') === listed.join(' ') ? items : null;
}

/**
 * The evidence items a recorded form goal lists: by today's codec when it
 * wrote the goal, else by the previous grammar; null for a goal no form codec
 * wrote, and for one whose evidence neither grammar reads whole.
 */
export function readRecordedEvidenceItems(goal: string): EvidenceItem[] | null {
  const index = readFieldIndex(goal);
  if (index === null) return null;
  try {
    return readEvidenceItems(goal);
  } catch {
    return readPreviousItems(
      goal,
      index.evidence.map((entry) => entry.alias),
    );
  }
}
