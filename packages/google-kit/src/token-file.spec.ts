import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  readTokenFile,
  TokenFileInvalid,
  writeTokenFile,
  type StoredToken,
  type TokenFileSystem,
} from './token-file';

const token: StoredToken = {
  refreshToken: 'rt-1',
  scopes: ['https://www.googleapis.com/auth/gmail.modify'],
  clientId: 'client',
  obtainedAt: '2026-10-16T12:00:00.000Z',
};

describe('the token file', () => {
  it('[GGL-2] is written for the owner alone, in a directory made on the way, and read back whole; a missing file reads as none', () => {
    const dir = mkdtempSync(join(tmpdir(), 'google-kit-'));
    try {
      const path = join(dir, 'deeper', 'oauth-token.json');
      expect(readTokenFile(path)).toBeNull();
      writeTokenFile(path, token);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(token);
      expect(readTokenFile(path)).toEqual(token);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('[GGL-2] refuses by name a file that is there and is not a token', () => {
    const fs = (text: string): TokenFileSystem => ({ read: () => text, write: () => undefined });
    expect(() => readTokenFile('/x/t.json', fs('{not json'))).toThrow(TokenFileInvalid);
    expect(() => readTokenFile('/x/t.json', fs('{"refreshToken":""}'))).toThrow(
      /\/x\/t\.json is not a token file: refreshToken:/,
    );
    expect(() => readTokenFile('/x/t.json', fs(JSON.stringify({ ...token, extra: 1 })))).toThrow(
      TokenFileInvalid,
    );
  });
});
