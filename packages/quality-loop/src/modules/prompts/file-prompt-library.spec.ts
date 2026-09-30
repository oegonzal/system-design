import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { FilePromptLibrary, titleOf } from './file-prompt-library';
import { seedPromptLibrary } from './testing';

describe('FilePromptLibrary', () => {
  const dir = seedPromptLibrary();
  const library = new FilePromptLibrary(dir);

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

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
    writeFileSync(join(dir, 'mango.md'), '# Later\n');
    expect((await library.list()).map((entry) => entry.id)).toEqual([
      'agentic/nested',
      'apple',
      'mango',
      'zebra',
    ]);
    rmSync(join(dir, 'mango.md'));
  });

  it('titleOf takes the first H1 anywhere and never a lower heading', () => {
    expect(titleOf('intro\n\n## Sub\n# Title here  \n# Second', 'x')).toBe('Title here');
    expect(titleOf('## Only a sub-heading', 'fallback')).toBe('fallback');
  });
});
