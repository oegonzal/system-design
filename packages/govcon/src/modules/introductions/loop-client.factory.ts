import { HttpLoopClient, type LoopClient } from '@sysdesign/loop-client';

const DEFAULT_QUALITY_LOOP_URL = 'http://localhost:3003';

/**
 *   QUALITY_LOOP_URL  the quality loop that writes introduction notes (default http://localhost:3003)
 *
 * Refused by name when it is not a URL, so a misspelt loop fails the boot and not the first draft.
 */
export function loopUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const url = env['QUALITY_LOOP_URL']?.trim() || DEFAULT_QUALITY_LOOP_URL;
  try {
    new URL(url);
  } catch {
    throw new Error(`QUALITY_LOOP_URL must be a URL, got ${JSON.stringify(url)}`);
  }
  return url;
}

/** The loop over HTTP at the address the environment names. */
export const loopClientFromEnv = (env: NodeJS.ProcessEnv = process.env): LoopClient =>
  new HttpLoopClient(loopUrlFromEnv(env));
