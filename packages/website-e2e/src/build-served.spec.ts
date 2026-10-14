import { readFileSync } from 'node:fs';

import { expect, type Request, test } from '@playwright/test';

import { type ServedFile, servedFiles } from './support/site';

/**
 * How long a new version may take to reach the edge. wrangler dev serves the
 * build at once; Cloudflare propagates a version in seconds, and two minutes is
 * the margin.
 */
const LIVE_WITHIN = 120_000;

/**
 * A built file as one asker got it: the status production gave for its URL,
 * and whether the body is the build's.
 */
interface Answer {
  url: string;
  status: number | undefined;
  same: boolean;
}

/**
 * Waits up to LIVE_WITHIN for every file to come back as built, then names each
 * one that did not, with the status production gave for it.
 */
const expectServedAsBuilt = async (
  files: ServedFile[],
  ask: (files: ServedFile[]) => Promise<Answer[]>,
): Promise<void> => {
  expect(files.length).toBeGreaterThan(0);
  await expect(async () => {
    expect(
      (await ask(files)).filter(({ same }) => !same).map(({ url, status }) => `${url} (${status})`),
      'served differently from the build: an older version, or a zone feature rewriting or challenging responses (docs/enfav/website.md)',
    ).toEqual([]);
  }).toPass({ timeout: LIVE_WITHIN, intervals: [5_000] });
};

/**
 * The first request of a redirect chain, whose response is production's answer
 * for the URL itself.
 */
const firstRequest = (request: Request): Request => {
  const from = request.redirectedFrom();
  return from === null ? request : firstRequest(from);
};

/**
 * Whether a file is UTF-8 without a byte-order mark. A browser hands a page's
 * body back as the text it decoded, encoded again as UTF-8 — on 2026-10-14
 * Playwright returned a page saved with a byte-order mark without it, and a
 * windows-1252 page re-encoded — so only such a page compares byte for byte.
 */
const bomlessUtf8 = (file: string): boolean => {
  const bytes = readFileSync(file);
  try {
    return Buffer.from(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).equals(bytes);
  } catch {
    return false;
  }
};

/*
 * The project every other one depends on (playwright.config.ts): all the other
 * checks are about this build, so none runs until the server answers with it,
 * byte for byte. In production that is the wait for a new version to reach the
 * edge. A zone feature can answer askers differently — on 2026-10-14
 * Cloudflare's automatic Web Analytics added its script to pages requested with
 * an Accept header naming text/html, as a browser's does, and not with the plain
 * client's wildcard one — so the build is asked for twice: every file as a plain
 * HTTP client asks for it, and every page as a browser opening it does.
 */

test.describe.configure({ timeout: LIVE_WITHIN + 30_000 });

test('[SITE-5] the server answers a plain HTTP client with this build, byte for byte', async ({
  request,
}) => {
  await expectServedAsBuilt(servedFiles(), (files) =>
    Promise.all(
      files.map(async ({ file, url, status }) => {
        const response = await request.get(url, { maxRedirects: 0 });
        const same =
          response.status() === status && (await response.body()).equals(readFileSync(file));
        return { url, status: response.status(), same };
      }),
    ),
  );
});

test('[SITE-5] the server answers a browser opening each page with this build, byte for byte', async ({
  page,
}) => {
  const pages = servedFiles().filter(({ kind }) => kind !== 'asset');
  expect(
    pages.filter(({ file }) => !bomlessUtf8(file)).map(({ file }) => file),
    'pages a browser cannot hand back byte for byte: save them as UTF-8 without a byte-order mark',
  ).toEqual([]);

  await expectServedAsBuilt(pages, async (files) => {
    const answers: Answer[] = [];
    for (const { file, url, status } of files) {
      const response = await page.goto(url, { waitUntil: 'commit' });
      const first = response === null ? null : await firstRequest(response.request()).response();
      const same =
        first?.status() === status &&
        response !== null &&
        (await response.body()).equals(readFileSync(file));
      answers.push({ url, status: first?.status(), same });
    }
    return answers;
  });
});
