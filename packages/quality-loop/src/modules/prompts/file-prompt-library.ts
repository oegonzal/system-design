import type { PromptLibraryDocumentDto, PromptLibraryEntryDto } from '@sysdesign/contracts';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import type { PromptLibrary } from './prompt-library';

const EXTENSION = '.md';

/** The first ATX H1 in the document names it; a prompt whose first H1 is not its title is a malformed prompt. */
export const titleOf = (markdown: string, fallback: string): string =>
  /^# +(\S.*?) *$/m.exec(markdown)?.[1] ?? fallback;

const isMissing = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT';

/**
 * One markdown file per prompt, anywhere beneath a root directory, walked on
 * every request so a new file shows up without a restart. Entries come back
 * sorted by id so the library reads the same on every machine.
 *
 * A prompt's id is its path below the root without the extension, in POSIX
 * form — `agentic/workflow-graph-engine`. The filesystem already guarantees
 * that is unique, which is why grouping prompts into folders needs no rule for
 * resolving two files that share a name: there cannot be two.
 *
 * There is deliberately no pattern check on the id any more. The old one
 * existed because `get` joined the id onto the root, so a request could name a
 * file outside the library; nothing here builds a path from a request. An id
 * is answered only if the walk already found it, so `../secrets` is not
 * rejected by a rule — it is simply not a key. That is the stronger property,
 * and it holds for inputs no pattern anticipated.
 */
export class FilePromptLibrary implements PromptLibrary {
  constructor(private readonly dir: string) {}

  /** id → absolute path, for every markdown file below the root. */
  private async index(): Promise<Map<string, string>> {
    const entries = await readdir(this.dir, { recursive: true, withFileTypes: true });
    const found = new Map<string, string>();
    for (const entry of entries) {
      // `isFile()` and not merely "ends in .md": a *directory* called `x.md`
      // is not a prompt, and a symlink is not followed out of the library.
      if (!entry.isFile() || !entry.name.endsWith(EXTENSION)) continue;
      const path = join(entry.parentPath, entry.name);
      const id = relative(this.dir, path).slice(0, -EXTENSION.length).split(sep).join('/');
      found.set(id, path);
    }
    return found;
  }

  async list(): Promise<PromptLibraryEntryDto[]> {
    const entries = await Promise.all(
      [...(await this.index())].map(async ([id, path]) => ({
        id,
        title: titleOf(await readFile(path, 'utf8'), id),
      })),
    );
    return entries.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  }

  async get(id: string): Promise<PromptLibraryDocumentDto | null> {
    const path = (await this.index()).get(id);
    if (path === undefined) return null;
    try {
      const markdown = await readFile(path, 'utf8');
      return { id, title: titleOf(markdown, id), markdown };
    } catch (error) {
      // Deleted between the walk and the read; to a caller that is "unknown".
      if (isMissing(error)) return null;
      throw error;
    }
  }
}
