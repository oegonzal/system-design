import { expect, test } from '@playwright/test';

/**
 * Runs in the desktop project only (playwright.config.ts): printing to PDF is a
 * Chromium feature, and the printed page does not depend on the window width.
 */
test('[SITE-7] the government page prints as a one-page US Letter capability statement', async ({
  page,
}) => {
  const response = await page.goto('/government/');
  expect(response?.status()).toBe(200);

  // The stylesheet's @page rule sets US Letter and the margins. A4 is only the
  // fallback, so a Letter page can come from nothing but that rule.
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, format: 'A4' });
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await getDocument({ data: new Uint8Array(pdf) }).promise;
  expect(document.numPages).toBe(1);
  // 8.5 × 11 inches, in PDF points.
  expect((await document.getPage(1)).view).toEqual([0, 0, 612, 792]);
});
