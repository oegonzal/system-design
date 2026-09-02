import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { buildNaiveDesign, openPracticeSession } from '../support/canvas.page';

/**
 * A run exports as a portable, DB-independent copy. One click on Export yields a
 * single `.zip`; the deterministic engine (EVAL_DETERMINISTIC=1) means the
 * bundled feedback is reproducible.
 */
test.describe('exporting a run', () => {
  test('[UX-10] downloads one zip of the diagram PDF plus per-artifact markdown', async ({
    page,
    request,
  }) => {
    const canvas = await openPracticeSession(page, request);
    await buildNaiveDesign(canvas);
    await canvas.submit();
    await canvas.expectEvaluationComplete(1);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-run').click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.zip$/);

    // Open the zip and assert each artifact is its own file, as asked.
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
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
    // The prompt file is real markdown, not empty.
    expect(await zip.files['prompt.md'].async('string')).toContain('# Prompt');
  });
});
