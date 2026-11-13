import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { archiveProfile, extractProfile, PROFILE_ARCHIVE_EXCLUDES } from './profile-archive';

/** The files of a profile that hold its sign-in and settings: kept. */
const KEPT = [
  'Default/Cookies',
  'Default/Local Storage/leveldb/000003.log',
  'Default/IndexedDB/https_x.test_0.indexeddb.leveldb/CURRENT',
  'Default/Preferences',
  'Default/Service Worker/Database/MANIFEST-000001',
  'Local State',
];

/** The caches and spools Chrome rebuilds or nobody reads back: left out. */
const DROPPED = [
  'Default/Cache/Cache_Data/index',
  'Default/Code Cache/js/index',
  'Default/GPUCache/data_0',
  'Default/DawnGraphiteCache/data_0',
  'Default/DawnWebGPUCache/data_0',
  'GraphiteDawnCache/data_0',
  'GrShaderCache/data_0',
  'ShaderCache/data_0',
  'Default/Service Worker/CacheStorage/abc/index',
  'Default/Service Worker/ScriptCache/index',
  'Crashpad/settings.dat',
  'BrowserMetrics/active.pma',
  'BrowserMetrics-spare.pma',
];

describe('a profile archive', () => {
  it('[BRW-32] keeps the files that hold the sign-in and leaves out the caches, the crash and metrics spools and the Singleton lock, through the system tar and back', async () => {
    const root = mkdtempSync(join(tmpdir(), 'browser-session-archive-'));
    const profiles = join(root, 'profiles');
    const restored = join(root, 'restored');
    const file = (path: string): void => {
      mkdirSync(join(profiles, 'linkedin', dirname(path)), { recursive: true });
      writeFileSync(join(profiles, 'linkedin', path), path);
    };
    try {
      for (const path of [...KEPT, ...DROPPED]) file(path);
      // Chrome's lock: a symlink naming the host and pid that held the profile.
      symlinkSync('mac-host-4242', join(profiles, 'linkedin', 'SingletonLock'));
      symlinkSync('mac-host-4242', join(profiles, 'linkedin', 'SingletonSocket'));
      const archive = join(root, 'linkedin.tar.gz');
      await archiveProfile(profiles, 'linkedin', archive);
      mkdirSync(restored);
      await extractProfile(archive, restored);

      const under = (path: string): boolean => existsSync(join(restored, 'linkedin', path));
      for (const path of KEPT) expect(under(path), `${path} kept`).toBe(true);
      for (const path of DROPPED) expect(under(path), `${path} dropped`).toBe(false);
      // A dangling symlink would read as absent too, so the lock's absence is read from the listing.
      const top = readdirSync(join(restored, 'linkedin')).sort();
      expect(top).toEqual(['Default', 'Local State']);
      // The parent of an excluded folder stays, with the rest of what it holds.
      expect(readdirSync(join(restored, 'linkedin', 'Default', 'Service Worker'))).toEqual([
        'Database',
      ]);
      // Every declared exclusion is one the files above exercise.
      expect(PROFILE_ARCHIVE_EXCLUDES).toHaveLength(13);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
