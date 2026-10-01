import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { AUTHORED_TITLE } from '../support/backend';
import { buildNaiveDesign, NAIVE_DESIGN_SCORE, openPracticeSession } from '../support/canvas.page';

/**
 * A run exports as a portable, database-independent copy. One click on
 * Export yields a single `.zip`; the stub grader means the bundled feedback
 * is a literal.
 */
test.describe('exporting a run', () => {
  test('[UX-10] downloads one zip of the diagram PDF plus per-artifact markdown', async ({
    page,
    request,
  }) => {
    const { canvas } = await openPracticeSession(page, request);
    await buildNaiveDesign(canvas);
    await canvas.submit();
    await canvas.expectEvaluationComplete(1);
    // The export reads the timeline, which refreshes its grade asynchronously
    // after the feedback lands — wait for the chip before bundling it.
    await expect(canvas.revisionChip(1).getByTestId('revision-score')).toHaveText(
      String(NAIVE_DESIGN_SCORE),
    );

    const path = await canvas.exportRun();

    // Open the zip and assert each artifact is its own file, as asked.
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(readFileSync(path));
    const names = Object.keys(zip.files);
    for (const artifact of [
      'prompt.md',
      'narrative.md',
      'brief.md',
      'feedback.md',
      'revisions.md',
    ]) {
      expect(names).toContain(artifact);
    }
    // The diagram is a PDF (best-effort — a fallback note only if capture failed).
    expect(names.some((name) => name === 'diagram.pdf' || name === 'diagram.pdf.txt')).toBe(true);

    // The prompt file is the markdown as written, followed by the rubric —
    // each kind in the words the studio shows it in, not the wire token.
    const prompt = await zip.files['prompt.md'].async('string');
    expect(prompt.startsWith(`# ${AUTHORED_TITLE}\n`)).toBe(true);
    expect(prompt).toContain('## Criteria');
    expect(prompt).toContain('| c1 | Functional |');
    expect(prompt).toContain('| c5 | Constraint |');

    // The feedback file carries the grade and the criterion results.
    const feedback = await zip.files['feedback.md'].async('string');
    expect(feedback).toContain('# Feedback — revision #1');
    expect(feedback).toContain(`**${NAIVE_DESIGN_SCORE}/100 · revise**`);
    expect(feedback).toContain('| Coverage |');
    expect(feedback).toContain('| c1 — ');

    const revisions = await zip.files['revisions.md'].async('string');
    expect(revisions).toContain(`| 1 | ${NAIVE_DESIGN_SCORE} | revise | complete |`);
  });
});
