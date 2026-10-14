import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { servedFiles } from './support/site';

/**
 * How long a new version may take to reach the edge. wrangler dev serves the
 * build at once; Cloudflare propagates a version in seconds, and two minutes is
 * the margin.
 */
const LIVE_WITHIN = 120_000;

/**
 * The project every other one depends on (playwright.config.ts): all the other
 * checks are about this build, so none runs until the server answers with it,
 * byte for byte. In production that is the wait for a new version to reach the
 * edge, and a zone feature that rewrites or challenges responses fails it.
 */
test('[SITE-5] the server answers with this build, byte for byte', async ({ request }) => {
  test.setTimeout(LIVE_WITHIN + 30_000);
  const files = servedFiles();
  expect(files.length).toBeGreaterThan(0);

  await expect(async () => {
    const answers = await Promise.all(
      files.map(async ({ file, url, status }) => {
        const response = await request.get(url, { maxRedirects: 0 });
        const same =
          response.status() === status && (await response.body()).equals(readFileSync(file));
        return { url, same, status: response.status() };
      }),
    );
    expect(
      answers.filter(({ same }) => !same).map(({ url, status }) => `${url} (${status})`),
      'served differently from the build: an older version, or a zone feature rewriting responses (docs/enfav/website.md)',
    ).toEqual([]);
  }).toPass({ timeout: LIVE_WITHIN, intervals: [5_000] });
});
