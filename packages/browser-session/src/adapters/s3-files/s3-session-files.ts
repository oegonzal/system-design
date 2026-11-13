import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { errorMessage } from '@sysdesign/contracts';
import { z } from 'zod';

import type { SessionFiles, StorageState } from '../../core/ports';
import { SessionRefused } from '../../core/unit-advice';
import { archiveProfile, extractProfile } from './profile-archive';

/**
 * The session's files in an S3 bucket — the cloud, where a task's disk is
 * new every run: `profiles/<name>.tar.gz` is the profile as the last run
 * left it, `state/<name>.json` the sign-in exported from the laptop that a
 * fresh profile is seeded with once, and `docs/<file>` the documents a
 * mission uploads, pushed once and never baked into an image. The bucket
 * encrypts every object with its own key, so nothing here names an
 * encryption header. The SDK's one call, `send`, is given from outside, so
 * the specs record it; the client reads its region and credentials from the
 * task's environment, as the SDK does.
 */

/** The commands the adapter sends. */
export type S3Command =
  GetObjectCommand | PutObjectCommand | ListObjectsV2Command | HeadObjectCommand;

/** What the adapter reads of an answer — the fields it uses of the four outputs — so a spec answers with no more. */
export interface S3Answer {
  Body?: { transformToByteArray(): Promise<Uint8Array> } | undefined;
  Contents?: { Key?: string | undefined }[] | undefined;
  ContentLength?: number | undefined;
  IsTruncated?: boolean | undefined;
  NextContinuationToken?: string | undefined;
}

/** The SDK's `send`, as the adapter calls it. */
export type SendCommand = (command: S3Command) => Promise<S3Answer>;

export interface S3SessionFilesOptions {
  bucket: string;
  profilesDir: string;
  docsDir: string;
  send: SendCommand;
  log: (text: string) => void;
}

/** Where each kind of file lives in the bucket. */
const KEYS = {
  profile: (name: string): string => `profiles/${name}.tar.gz`,
  state: (name: string): string => `state/${name}.json`,
  docs: 'docs/',
};

/** The errors the SDK raises for an object that is not there: HEAD's and GET's. */
const ABSENT = new Set(['NotFound', 'NoSuchKey']);
const isAbsent = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  typeof error.name === 'string' &&
  ABSENT.has(error.name);

/**
 * The exported sign-in as the file holds it, each field as Playwright's own
 * type declares it; what else an origin carries — its IndexedDB stores, which
 * the type leaves unlisted — is kept, never stripped, for `setStorageState`
 * to read.
 */
const storageStateSchema = z.looseObject({
  cookies: z.array(
    z.looseObject({
      name: z.string(),
      value: z.string(),
      domain: z.string(),
      path: z.string(),
      expires: z.number(),
      httpOnly: z.boolean(),
      secure: z.boolean(),
      sameSite: z.enum(['Strict', 'Lax', 'None']),
    }),
  ),
  origins: z.array(
    z.looseObject({
      origin: z.string(),
      localStorage: z.array(z.looseObject({ name: z.string(), value: z.string() })),
    }),
  ),
}) satisfies z.ZodType<StorageState>;

export function s3SessionFiles(options: S3SessionFilesOptions): SessionFiles {
  const { bucket, profilesDir, docsDir, send, log } = options;
  const at = (key: string): string => `s3://${bucket}/${key}`;

  /** The object's size, or null for one that is not there. */
  const size = async (key: string): Promise<number | null> => {
    try {
      return (await send(new HeadObjectCommand({ Bucket: bucket, Key: key }))).ContentLength ?? 0;
    } catch (error) {
      if (isAbsent(error)) return null;
      throw error;
    }
  };

  const bytes = async (key: string): Promise<Uint8Array> => {
    const answer = await send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (answer.Body === undefined) throw new Error(`${at(key)} came back with no body`);
    return answer.Body.transformToByteArray();
  };

  /** A scratch folder for one archive, gone whatever became of it. */
  const withScratch = async <T>(work: (archive: string) => Promise<T>): Promise<T> => {
    const scratch = mkdtempSync(join(tmpdir(), 'browser-session-archive-'));
    try {
      return await work(join(scratch, 'profile.tar.gz'));
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  };

  const stateOf = async (key: string): Promise<StorageState> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(await bytes(key)).toString('utf8'));
    } catch (error) {
      throw new Error(`${at(key)} is not JSON: ${errorMessage(error)}`);
    }
    const read = storageStateSchema.safeParse(parsed);
    if (!read.success) {
      const problems = read.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`);
      throw new Error(`${at(key)} is not a storage state: ${problems.join('; ')}`);
    }
    return read.data;
  };

  return {
    async profile(name) {
      const dir = join(profilesDir, name);
      const archive = await size(KEYS.profile(name));
      if (archive !== null) {
        await withScratch(async (file) => {
          writeFileSync(file, await bytes(KEYS.profile(name)));
          // Whatever a stale directory holds is an earlier run's, or nothing: the archive is the profile.
          rmSync(dir, { recursive: true, force: true });
          mkdirSync(profilesDir, { recursive: true });
          await extractProfile(file, profilesDir);
        });
        // An archive laid out otherwise — made by hand from inside the
        // profile, or under another name — restored nothing the browser will
        // open; it would open a fresh profile and archive that over this one.
        if (!existsSync(dir)) {
          throw new SessionRefused(
            `${at(KEYS.profile(name))} holds no ${name}/ directory: an archive is made from the profiles dir, its members ${name}/… — remove it (pnpm aws:files rm ${KEYS.profile(name)}) or push one made so`,
          );
        }
        log(`profile ${name}: restored from ${at(KEYS.profile(name))} (${archive} bytes)`);
        return { kind: 'archived' };
      }
      // Both launches need a sign-in, so with a bucket set neither file is a
      // setup not done — never a run: one would go ahead signed out and
      // archive that profile, which wins over any state pushed afterwards.
      if ((await size(KEYS.state(name))) === null) {
        throw new SessionRefused(
          `profile ${name}: no ${KEYS.profile(name)} and no ${KEYS.state(name)} in s3://${bucket} — export the sign-in on the laptop and push it first: pnpm browser-session export-state --profile ${name} --out <file>, then pnpm aws:files push <file> ${KEYS.state(name)}`,
        );
      }
      const state = await stateOf(KEYS.state(name));
      // The seed replaces everything a profile holds, so it goes into a fresh one.
      rmSync(dir, { recursive: true, force: true });
      log(
        `profile ${name}: no archive yet — a fresh profile, seeded from ${at(KEYS.state(name))} (${state.cookies.length} cookie(s), ${state.origins.length} origin(s))`,
      );
      return { kind: 'seed', state };
    },

    async saveProfile(name) {
      if (!existsSync(join(profilesDir, name))) {
        log(`profile ${name}: nothing under ${profilesDir} to archive`);
        return;
      }
      const key = KEYS.profile(name);
      const archived = await withScratch(async (file) => {
        await archiveProfile(profilesDir, name, file);
        const body = readFileSync(file);
        await send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: 'application/gzip',
          }),
        );
        return body.length;
      });
      log(`profile ${name}: archived to ${at(key)} (${archived} bytes)`);
    },

    async documents() {
      mkdirSync(docsDir, { recursive: true });
      let written = 0;
      let token: string | undefined;
      do {
        const page = await send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: KEYS.docs, ContinuationToken: token }),
        );
        for (const object of page.Contents ?? []) {
          const relative = object.Key?.slice(KEYS.docs.length);
          // The prefix itself and a nested folder, as markers, hold no document.
          if (relative === undefined || relative === '' || relative.endsWith('/')) continue;
          if (relative.split('/').includes('..')) {
            throw new Error(`${at(KEYS.docs + relative)} names a path outside the documents dir`);
          }
          const target = join(docsDir, relative);
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, await bytes(KEYS.docs + relative));
          written += 1;
        }
        token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
      } while (token !== undefined);
      log(`documents: ${written} file(s) written under ${docsDir} from ${at(KEYS.docs)}`);
    },
  };
}
