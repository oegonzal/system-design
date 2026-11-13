import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * A Chrome profile as a gzipped tar, made and read by the system `tar` with
 * no shell between — the one tool that keeps the profile's hundreds of small
 * files, their modes and its symlinks whole on both the laptop and a Debian
 * task. What stays out, as `--exclude` patterns both bsdtar (macOS) and GNU
 * tar (Debian) read the same way — checked 2026-11-11 on both: a bare name
 * matches at any depth, and a star before the slash (as in the Cache entry)
 * matches a component under another:
 *
 * - the caches Chrome rebuilds on its own, which are the bulk of a profile
 *   (measured 2026-11-11: 470 of one signed-in profile's 510 MB) and carry no
 *   sign-in;
 * - the `Singleton*` lock files, which name the host and pid that held the
 *   profile — on a new host they would block the browser from opening it;
 * - the crash and metrics spools nobody reads back.
 */
export const PROFILE_ARCHIVE_EXCLUDES = [
  'Singleton*',
  '*/Cache',
  '*/Code Cache',
  '*/GPUCache',
  '*/DawnGraphiteCache',
  '*/DawnWebGPUCache',
  'GraphiteDawnCache',
  'GrShaderCache',
  'ShaderCache',
  '*/Service Worker/CacheStorage',
  '*/Service Worker/ScriptCache',
  'Crashpad',
  'BrowserMetrics*',
] as const;

/** The profile `name` under `profilesDir` written to `archive`, its members `<name>/…`, the excluded files left out. */
export async function archiveProfile(
  profilesDir: string,
  name: string,
  archive: string,
): Promise<void> {
  await run('tar', [
    '-czf',
    archive,
    '-C',
    profilesDir,
    ...PROFILE_ARCHIVE_EXCLUDES.map((pattern) => `--exclude=${pattern}`),
    name,
  ]);
}

/** An archive extracted under `profilesDir`: its members are `<name>/…`, so the profile lands where the browser opens it. */
export async function extractProfile(archive: string, profilesDir: string): Promise<void> {
  await run('tar', ['-xzf', archive, '-C', profilesDir]);
}
