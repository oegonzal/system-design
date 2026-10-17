import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { z } from 'zod';

/** The grant a consent obtained, as the file keeps it: the refresh token, what it may reach, for which client, and when. */
export const storedTokenSchema = z.strictObject({
  refreshToken: z.string().min(1),
  scopes: z.array(z.string().min(1)),
  clientId: z.string().min(1),
  obtainedAt: z.iso.datetime(),
});
export type StoredToken = z.infer<typeof storedTokenSchema>;

/** A token file that is there and is not a token. */
export class TokenFileInvalid extends Error {
  override readonly name = 'TokenFileInvalid';
  constructor(
    readonly path: string,
    detail: string,
  ) {
    super(`${path} is not a token file: ${detail}`);
  }
}

/** How the file system is reached; a spec hands in its own. */
export interface TokenFileSystem {
  read(path: string): string | null;
  write(path: string, text: string): void;
}

const isMissing = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';

/** The owner alone reads a token: the directory made, the file written, its mode set. */
export const nodeTokenFileSystem: TokenFileSystem = {
  read: (path) => {
    try {
      return readFileSync(path, 'utf8');
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  },
  write: (path, text) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, { mode: 0o600 });
    chmodSync(path, 0o600);
  },
};

/** The token the file holds, null when there is no file, refused by name when the file is not a token. */
export function readTokenFile(
  path: string,
  fs: TokenFileSystem = nodeTokenFileSystem,
): StoredToken | null {
  const text = fs.read(path);
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new TokenFileInvalid(path, `not JSON (${(error as Error).message})`);
  }
  const token = storedTokenSchema.safeParse(parsed);
  if (!token.success) {
    throw new TokenFileInvalid(
      path,
      token.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; '),
    );
  }
  return token.data;
}

export function writeTokenFile(
  path: string,
  token: StoredToken,
  fs: TokenFileSystem = nodeTokenFileSystem,
): void {
  fs.write(path, `${JSON.stringify(token, null, 2)}\n`);
}
