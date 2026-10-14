import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fsDocumentWriter } from './fs-document-writer';

describe('fsDocumentWriter', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'memory-ingest-writer-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('[ING-3] writes a document under the folders it makes, replaces it whole, and removes it, saying whether there was one to remove', async () => {
    const path = join(dir, 'studio', 'studio-experiences.md');
    await fsDocumentWriter.write(path, '# First\n');
    await fsDocumentWriter.write(path, '# Second\n');
    expect(await readFile(path, 'utf8')).toBe('# Second\n');

    expect(await fsDocumentWriter.remove(path)).toBe(true);
    await expect(readFile(path, 'utf8')).rejects.toThrow('ENOENT');
    expect(await fsDocumentWriter.remove(path)).toBe(false);
    expect(await fsDocumentWriter.remove(join(dir, 'never', 'made.md'))).toBe(false);
  });
});
