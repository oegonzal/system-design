import type { PromptLibraryDocumentDto, PromptLibraryEntryDto } from '@sysdesign/contracts';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { PromptLibrary } from './prompt-library';

/** A prompt's id is its file name; this keeps a request's id from naming anything else. */
const ID = /^[a-z0-9][a-z0-9._-]*$/i;
const EXTENSION = '.md';

/** The first ATX H1 in the document names it; a prompt whose first H1 is not its title is a malformed prompt. */
export const titleOf = (markdown: string, fallback: string): string =>
  /^# +(\S.*?) *$/m.exec(markdown)?.[1] ?? fallback;

const isMissing = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT';

/**
 * One markdown file per prompt in a directory, read on every request so a new
 * file shows up without a restart. Entries come back sorted by id so the
 * library reads the same on every machine.
 */
export class FilePromptLibrary implements PromptLibrary {
  constructor(private readonly dir: string) {}

  async list(): Promise<PromptLibraryEntryDto[]> {
    const names = (await readdir(this.dir)).filter((name) => name.endsWith(EXTENSION));
    const entries = await Promise.all(
      names.map(async (name) => {
        const id = name.slice(0, -EXTENSION.length);
        return { id, title: titleOf(await readFile(join(this.dir, name), 'utf8'), id) };
      }),
    );
    return entries.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  }

  async get(id: string): Promise<PromptLibraryDocumentDto | null> {
    if (!ID.test(id)) return null;
    try {
      const markdown = await readFile(join(this.dir, `${id}${EXTENSION}`), 'utf8');
      return { id, title: titleOf(markdown, id), markdown };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }
}
