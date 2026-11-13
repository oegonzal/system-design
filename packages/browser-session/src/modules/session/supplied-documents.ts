import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { SessionFiles, SuppliedDocument } from '../../core/ports';
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
  const resolved = resolvedDocuments(supplied);
  for (const document of resolved) {
    if (!(await present(document.path))) {
      throw new SessionRefused(`document ${document.name}: no file at ${document.path}`);
    }
  }
  return resolved;
}

/** The supplied files by their absolute paths, as the browser will read them; whether each is there is `presentDocuments`'s to say. */
export const resolvedDocuments = (supplied: readonly SuppliedDocument[]): SuppliedDocument[] =>
  supplied.map((document) => ({ name: document.name, path: resolve(document.path) }));

/**
 * The session's files with the supplied documents checked once they can be
 * there: where the files live beyond this machine, the documents are written
 * from the bucket as the session starts — after the lease, before the profile
 * — so a check before that would refuse every run that needs one. The
 * engine's one `documents()` call is where both are true; the rest of the
 * port passes through.
 */
export const checkingDocuments = (
  files: SessionFiles,
  documents: readonly SuppliedDocument[],
): SessionFiles => ({
  profile: (name) => files.profile(name),
  saveProfile: (name) => files.saveProfile(name),
  async documents() {
    await files.documents();
    await presentDocuments(documents);
  },
});

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};
