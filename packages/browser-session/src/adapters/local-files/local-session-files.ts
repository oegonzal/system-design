import type { SessionFiles } from '../../core/ports';

/**
 * The session's files where nothing lives beyond this machine — the laptop,
 * where `BROWSER_PROFILE_BUCKET` is `none`: the profile is the directory the
 * browser opens, the sign-in is whatever that profile holds, and the
 * documents are the files the command line names. Nothing is restored,
 * nothing is archived.
 */
export const localSessionFiles = (): SessionFiles => ({
  async profile() {
    return { kind: 'none' };
  },
  async saveProfile() {
    // Nothing to keep beyond the disk the browser wrote.
  },
  async documents() {
    // The command line names the files; they are already here.
  },
});
