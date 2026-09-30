import type { INestApplication } from '@nestjs/common';
import type { PromptLibraryEntryDto } from '@sysdesign/contracts';
import { ensureDatabase } from '@sysdesign/db';
import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fakeLlm, tinyPipeline } from '../../core/testing';
import { bootApp, claimDumpDir, getJson, type Envelope } from '../http/testing';
import { PIPELINES_TOKEN, QUALITY_LOOP_LLM } from '../runs/tokens';
import { seedPromptLibrary } from './testing';

// The library reads a directory of this file's own, wired through the same env
// var the service reads, so the module's factory is what the HTTP half exercises.
const PROMPTS_DIR = seedPromptLibrary();
process.env['QUALITY_LOOP_PROMPTS_DIR'] = PROMPTS_DIR;
claimDumpDir('quality-loop-prompts');

describe('GET /prompts', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    await ensureDatabase();
    ({ app, url } = await bootApp(
      [
        [QUALITY_LOOP_LLM, fakeLlm()],
        [PIPELINES_TOKEN, new Map([['tiny', tinyPipeline()]])],
      ],
      {},
    ));
  });

  afterAll(async () => {
    await app.close();
    rmSync(PROMPTS_DIR, { recursive: true, force: true });
  });

  it('[QL-11] lists the library, serves one document, 404s the rest, and allows the web client origin', async () => {
    const listed = await fetch(`${url}/prompts`, { headers: { origin: 'http://localhost:4201' } });
    expect(listed.headers.get('access-control-allow-origin')).toBe('http://localhost:4201');
    const { data } = (await listed.json()) as Envelope<PromptLibraryEntryDto[]>;
    expect(data.map((entry) => entry.id)).toEqual(['agentic/nested', 'apple', 'zebra']);

    const document = await getJson<Envelope<{ markdown: string }>>(url, '/prompts/zebra');
    expect(document.data.markdown).toContain('Stripe the zebra');

    expect((await fetch(`${url}/prompts/nope`)).status).toBe(404);
  });

  it('[QL-11] a nested id resolves both as path segments and percent-encoded', async () => {
    const asPath = await getJson<Envelope<{ id: string }>>(url, '/prompts/agentic/nested');
    expect(asPath.data.id).toBe('agentic/nested');

    const encoded = await getJson<Envelope<{ id: string }>>(
      url,
      `/prompts/${encodeURIComponent('agentic/nested')}`,
    );
    expect(encoded.data.id).toBe('agentic/nested');

    expect((await fetch(`${url}/prompts/agentic/missing`)).status).toBe(404);
  });
});
