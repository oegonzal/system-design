/**
 * Does a finding's quoted evidence actually appear in what the critic was shown?
 *
 * The corpus is the **whole prompt**, not just the diff. The architecture critic
 * is told to ground itself in the generated repository map, so a legitimate
 * finding may quote the map — "studio-ui may depend only on contracts and
 * design-system" — rather than a diff line. Checking against the diff alone
 * would delete every map-grounded architecture finding.
 *
 * The failure mode to design against is not a fabricated quote slipping
 * through; it is a *true* finding being deleted because a model re-wrapped a
 * line. That is strictly worse than a false positive: the developer never
 * learns the pipeline had something to say, and the run record shows a clean
 * pass. So every ambiguous case here resolves toward keeping the finding.
 */

export interface EvidenceCheck {
  verified: boolean;
  reason?: 'empty' | 'not-found' | 'error';
}

/** Typography a model substitutes when quoting prose. */
const SUBSTITUTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  // Written as escapes, not literals: an invisible character in source is both
  // a lint error and impossible to review.
  [/[\u2018\u2019\u201B]/g, "'"],
  [/[\u201C\u201D\u201F]/g, '"'],
  [/[\u2013\u2014]/g, '-'],
  // Non-breaking, narrow no-break and figure spaces.
  [/[\u00A0\u202F\u2007]/g, ' '],
  // Zero-width space, non-joiner, joiner, and the byte-order mark. Alternation
  // rather than a character class: the joiner inside a class reads as a
  // combining sequence and eslint rejects it.
  [/\u200B|\u200C|\u200D|\uFEFF/g, ''],
];

/**
 * Normalises for comparison.
 *
 * Whitespace is **removed**, not collapsed. That is the load-bearing choice: it
 * absorbs indentation drift, tabs against spaces, and the `\n   * ` continuation
 * of a block comment in one step. Collapsing to a single space still fails when
 * the model re-wraps a long line at a different column, which is exactly what a
 * quoted docstring does.
 *
 * Case is preserved — models quote code casing accurately, and folding it buys
 * little against a filter already biased toward keeping.
 */
export function normaliseForMatch(text: string): string {
  let out = text.normalize('NFC');
  for (const [pattern, replacement] of SUBSTITUTIONS) out = out.replace(pattern, replacement);
  return out.replace(/\s+/g, '');
}

/**
 * Strips the leading `+`, `-` and space of diff body lines.
 *
 * Some models quote a diff line with its marker and some without. Once
 * whitespace is removed a kept `+` sits flush against the code while a stripped
 * one does not, so the two normalise differently — hence matching against both
 * this and the raw corpus.
 */
export function stripDiffMarkers(diff: string): string {
  return diff
    .split('\n')
    .map((line) => (/^[+\- ]/.test(line) && !/^(\+\+\+|---)/.test(line) ? line.slice(1) : line))
    .join('\n');
}

/**
 * The file as the change leaves it: removed lines gone, markers stripped.
 *
 * A critic quoting a modified region naturally quotes the *result* — the diff
 * reads `-  @Length(1, 50)` / `+  @Length(1, MAX)`, and the quote is the `+`
 * line sitting directly under the unchanged line above it. In the raw patch
 * those two are separated by the removed line, so searching the patch text
 * alone reports a perfectly good quote as unfound. That is a false negative,
 * and under `enforce` it deletes a true finding.
 */
export function sideOf(diff: string, side: 'after' | 'before'): string {
  const drop = side === 'after' ? '-' : '+';

  return diff
    .split('\n')
    .filter((line) => !(line.startsWith(drop) && !/^(\+\+\+|---)/.test(line)))
    .map((line) => (/^[+\- ]/.test(line) && !/^(\+\+\+|---)/.test(line) ? line.slice(1) : line))
    .join('\n');
}

/** Segments of a quote that used `…` to elide the middle. */
function segmentsOf(evidence: string): string[] {
  return evidence
    .replace(/(…|\.\.\.)\s*$/, '')
    .split(/…|\.\.\./)
    .map(normaliseForMatch)
    .filter(Boolean);
}

const containsInOrder = (haystack: string, segments: string[]): boolean => {
  let cursor = 0;
  for (const segment of segments) {
    const at = haystack.indexOf(segment, cursor);
    if (at === -1) return false;
    cursor = at + segment.length;
  }
  return true;
};

/**
 * Total by construction: any internal failure returns `verified: true`.
 *
 * A crash in the matcher must never be able to delete a finding, so the catch
 * is a safety property rather than defensive habit.
 *
 * Matching is plain `indexOf`, never a constructed regular expression —
 * evidence routinely contains `(`, `[`, `$` and `.*`, which would either throw
 * or silently match the wrong thing.
 */
export function evidenceAppearsIn(evidence: string, corpus: string): EvidenceCheck {
  try {
    const segments = segmentsOf(evidence ?? '');
    if (segments.length === 0) return { verified: false, reason: 'empty' };

    // Four readings of the same text: the patch as written, the patch with its
    // markers stripped, and each side of the change as a file. A quote is
    // legitimate against any of them.
    const haystacks = [
      normaliseForMatch(corpus),
      normaliseForMatch(stripDiffMarkers(corpus)),
      normaliseForMatch(sideOf(corpus, 'after')),
      normaliseForMatch(sideOf(corpus, 'before')),
    ];
    const found = haystacks.some((haystack) => containsInOrder(haystack, segments));

    return found ? { verified: true } : { verified: false, reason: 'not-found' };
  } catch {
    return { verified: true, reason: 'error' };
  }
}
