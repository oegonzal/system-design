import { expect, test } from '@playwright/test';

/**
 * Runs in the desktop project only (playwright.config.ts): printing to PDF is a
 * Chromium feature, and the printed page does not depend on the window width.
 */
test('[SITE-7] the government page prints as a one-page US Letter capability statement', async ({
  page,
}) => {
  await page.goto('/government/');

  // The stylesheet's @page rule sets US Letter and the margins.
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await getDocument({ data: new Uint8Array(pdf) }).promise;
  expect(document.numPages).toBe(1);
});
