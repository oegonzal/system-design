/** The reviewable slice of the review policy: the one section the critics are held to. */

/**
 * Extracts `## Code Review Expectations` from `review-policy.md` — the file in
 * this directory that states what a reviewer here is entitled to expect — and
 * nothing else.
 *
 * A dedicated file rather than the repository's working notes, because working
 * notes carry product framing, tool lists and local paths that read as policy
 * the moment they appear under a system-prompt heading. The pipeline reads only
 * what was written to be read by it.
 *
 * Fence-aware, because a `##` inside a fenced example must not end the section,
 * and it stops at the next `##` but deliberately not at a `###`.
 */
export function codeReviewExpectations(markdown: string): { text: string; warnings: string[] } {
  const lines = markdown.split('\n');
  const warnings: string[] = [];
  const sections: string[] = [];

  let fence: string | null = null;
  let collecting = false;
  let current: string[] = [];

  for (const line of lines) {
    const fenceMatch = /^\s*(```|~~~)/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1] as string;
      fence = fence === null ? marker : fence === marker ? null : fence;
    }

    if (fence === null && /^##\s/.test(line)) {
      if (collecting) {
        sections.push(current.join('\n').trim());
        current = [];
      }
      collecting = /^##\s+Code Review Expectations\s*$/.test(line);
      continue;
    }

    if (collecting) current.push(line);
  }

  if (collecting) sections.push(current.join('\n').trim());

  if (sections.length === 0) {
    // Refuse to run rather than hand a critic an invented rule set — the same
    // stance repo-map.ts takes when the eslint constraints cannot be derived.
    throw new Error(
      'review-policy.md has no "## Code Review Expectations" section; the review pipeline reads its policy from there',
    );
  }

  if (sections.length > 1) {
    // Silently picking a winner between two versions of the policy is not this
    // tool's call. Concatenating loses no rule and the warning gets it fixed.
    warnings.push(
      `review-policy.md declares "## Code Review Expectations" ${sections.length} times; all copies were sent`,
    );
  }

  return { text: sections.join('\n\n'), warnings };
}
