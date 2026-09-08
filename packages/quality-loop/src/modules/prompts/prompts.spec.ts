import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PromptLibraryEntryDto } from '@sysdesign/contracts';
import { ensureDatabase } from '@sysdesign/db';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fakeLlm, tinyPipeline } from '../../core/testing';
import { FilePromptLibrary, titleOf } from './file-prompt-library';

// The library reads a directory of this file's own, wired through the same env
// var the service reads, so the module's factory is what the HTTP half exercises.
const PROMPTS_DIR = mkdtempSync(join(tmpdir(), 'sysdesign-quality-loop-prompts-'));
process.env['QUALITY_LOOP_PROMPTS_DIR'] = PROMPTS_DIR;
process.env['EVAL_DUMP_DIR'] = mkdtempSync(join(tmpdir(), 'sysdesign-quality-loop-dumps-'));
writeFileSync(join(PROMPTS_DIR, 'zebra.md'), '\n# Prompt — Stripe the zebra\n\nBody.\n');
writeFileSync(join(PROMPTS_DIR, 'apple.md'), 'No heading here, just a goal.\n');
writeFileSync(join(PROMPTS_DIR, 'notes.txt'), '# Not a prompt\n');
// A prompt in a subdirectory, and a *directory* whose name ends in .md — the
// walk must find the first and must not mistake the second for a document.
mkdirSync(join(PROMPTS_DIR, 'agentic'));
writeFileSync(join(PROMPTS_DIR, 'agentic', 'nested.md'), '# Prompt — Nested one\n\nBody.\n');
mkdirSync(join(PROMPTS_DIR, 'trap.md'));

const { AppModule } = await import('../app/app.module');
const { configureApp } = await import('../app/configure-app');
const { PIPELINES_TOKEN, QUALITY_LOOP_LLM } = await import('../runs/tokens');

describe('FilePromptLibrary', () => {
  const library = new FilePromptLibrary(PROMPTS_DIR);

  it('[QL-11] lists every markdown file below the root, titled by its first H1 or its id', async () => {
    expect(await library.list()).toEqual([
      { id: 'agentic/nested', title: 'Prompt — Nested one' },
      { id: 'apple', title: 'apple' },
      { id: 'zebra', title: 'Prompt — Stripe the zebra' },
    ]);
  });

  it('[QL-11] a prompt in a subdirectory is identified by its path below the root', async () => {
    expect(await library.get('agentic/nested')).toEqual({
      id: 'agentic/nested',
      title: 'Prompt — Nested one',
      markdown: '# Prompt — Nested one\n\nBody.\n',
    });
    // The stem alone is not the id: the path is, so it cannot collide.
    expect(await library.get('nested')).toBeNull();
  });

  it('[QL-11] serves the document verbatim and answers null for the unknown or the unsafe', async () => {
    expect(await library.get('zebra')).toEqual({
      id: 'zebra',
      title: 'Prompt — Stripe the zebra',
      markdown: '\n# Prompt — Stripe the zebra\n\nBody.\n',
    });
    expect(await library.get('nope')).toBeNull();
    // Not rejected by a pattern — never walked to, so never a key.
    expect(await library.get('../zebra')).toBeNull();
    expect(await library.get('/etc/passwd')).toBeNull();
    expect(await library.get('notes')).toBeNull();
    expect(await library.get('trap')).toBeNull();
  });

  it('[QL-11] sees a file added after boot — the directory is read per request', async () => {
    writeFileSync(join(PROMPTS_DIR, 'mango.md'), '# Later\n');
    expect((await library.list()).map((entry) => entry.id)).toEqual([
      'agentic/nested',
      'apple',
      'mango',
      'zebra',
    ]);
    rmSync(join(PROMPTS_DIR, 'mango.md'));
  });

  it('titleOf takes the first H1 anywhere and never a lower heading', () => {
    expect(titleOf('intro\n\n## Sub\n# Title here  \n# Second', 'x')).toBe('Title here');
    expect(titleOf('## Only a sub-heading', 'fallback')).toBe('fallback');
  });
});

describe('GET /prompts', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    await ensureDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(QUALITY_LOOP_LLM)
      .useValue(fakeLlm())
      .overrideProvider(PIPELINES_TOKEN)
      .useValue(new Map([['tiny', tinyPipeline()]]))
      .compile();
    app = configureApp(moduleRef.createNestApplication(), {});
    await app.listen(0);
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    rmSync(PROMPTS_DIR, { recursive: true, force: true });
  });

  it('[QL-11] lists the library, serves one document, 404s the rest, and allows the web client origin', async () => {
    const listed = await fetch(`${url}/prompts`, { headers: { origin: 'http://localhost:4201' } });
    expect(listed.headers.get('access-control-allow-origin')).toBe('http://localhost:4201');
    const { data } = (await listed.json()) as { data: PromptLibraryEntryDto[] };
    expect(data.map((entry) => entry.id)).toEqual(['agentic/nested', 'apple', 'zebra']);

    const document = (await (await fetch(`${url}/prompts/zebra`)).json()) as {
      data: { markdown: string };
    };
    expect(document.data.markdown).toContain('Stripe the zebra');

    expect((await fetch(`${url}/prompts/nope`)).status).toBe(404);
  });

  it('[QL-11] a nested id resolves both as path segments and percent-encoded', async () => {
    const asPath = (await (await fetch(`${url}/prompts/agentic/nested`)).json()) as {
      data: { id: string };
    };
    expect(asPath.data.id).toBe('agentic/nested');

    const encoded = (await (
      await fetch(`${url}/prompts/${encodeURIComponent('agentic/nested')}`)
    ).json()) as { data: { id: string } };
    expect(encoded.data.id).toBe('agentic/nested');

    expect((await fetch(`${url}/prompts/agentic/missing`)).status).toBe(404);
  });
});
