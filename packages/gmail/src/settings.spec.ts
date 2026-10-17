import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { PACKAGE_ROOT, GmailConfigError } from './config';
import { readSettings } from './settings';

describe('the service settings', () => {
  it('[GML-2] reads the four kinds the package ships, says where each came from, and refuses a kind left unchosen by name', () => {
    const settings = readSettings(PACKAGE_ROOT);
    expect(settings.session.rails.maxSteps).toBeGreaterThan(0);
    expect(settings.watch).toEqual({
      enabled: true,
      pollEveryMs: 60_000,
      noticeTtlMs: 604_800_000,
    });
    expect(settings.peers.peers).toEqual(['google-calendar']);
    expect(settings.mailbox.searchMax).toBeLessThanOrEqual(settings.mailbox.searchCeiling);
    // Where each came from, as a path from wherever the process runs — the repo root or the package.
    const shipped = (kind: string) =>
      relative(process.cwd(), resolve(PACKAGE_ROOT, 'config', kind, 'standard.json'));
    expect(settings.sources).toEqual({
      session: shipped('session'),
      watch: shipped('watch'),
      peers: shipped('peers'),
      mailbox: shipped('mailbox'),
    });
    const without = (kind: string) => (at: string) => {
      if (at.endsWith('engine.json'))
        return JSON.stringify({
          session: 'standard',
          watch: 'standard',
          peers: 'standard',
          mailbox: 'standard',
          [kind]: undefined,
        });
      return readFileSync(at, 'utf8');
    };
    expect(() => readSettings(PACKAGE_ROOT, without('watch'))).toThrow(GmailConfigError);
    expect(() => readSettings(PACKAGE_ROOT, without('watch'))).toThrow(/chooses no watch/);
  });
});
