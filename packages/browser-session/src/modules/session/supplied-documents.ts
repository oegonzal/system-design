import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { SuppliedDocument } from '../../core/ports';
import { SessionRefused } from '../../core/unit-advice';

/**
 * The files the command line supplies for the mission's documents, each
 * resolved and checked to be there before the session has a row: a path
 * nobody can open is a session that would cut every upload it plans. The
 * engine reads no disk, so the check lives here beside the service; what the
 * names are held to is the engine's own `resolveDocuments`.
 */
export async function presentDocuments(
  supplied: readonly SuppliedDocument[],
  present: (path: string) => Promise<boolean> = exists,
): Promise<SuppliedDocument[]> {
  const resolved: SuppliedDocument[] = [];
  for (const document of supplied) {
    const path = resolve(document.path);
    if (!(await present(path))) {
      throw new SessionRefused(`document ${document.name}: no file at ${path}`);
    }
    resolved.push({ name: document.name, path });
  }
  return resolved;
}

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};
