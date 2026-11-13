import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

import { SessionRefused } from '../../core/unit-advice';
import { archiveProfile, extractProfile } from './profile-archive';
import {
  s3SessionFiles,
  type S3Answer,
  type S3Command,
  type SendCommand,
} from './s3-session-files';

/** A bucket as a map of keys to bytes, answering the four commands the adapter sends and recording each. */
function bucketOf(objects: Record<string, Uint8Array>) {
  const sent: string[] = [];
  const absent = (name: string): Error => Object.assign(new Error(name), { name });
  const send: SendCommand = async (command: S3Command): Promise<S3Answer> => {
    if (command instanceof HeadObjectCommand) {
      const key = command.input.Key ?? '';
      sent.push(`HEAD ${key}`);
      const bytes = objects[key];
      if (bytes === undefined) throw absent('NotFound');
      return { ContentLength: bytes.length };
    }
    if (command instanceof GetObjectCommand) {
      const key = command.input.Key ?? '';
      sent.push(`GET ${key}`);
      const bytes = objects[key];
      if (bytes === undefined) throw absent('NoSuchKey');
      return { Body: { transformToByteArray: async () => bytes } };
    }
    if (command instanceof PutObjectCommand) {
      const key = command.input.Key ?? '';
      sent.push(`PUT ${key} ${command.input.ContentType ?? ''}`);
      const body = command.input.Body;
      objects[key] = body instanceof Uint8Array ? body : new Uint8Array();
      return {};
    }
    const prefix = command.input.Prefix ?? '';
    sent.push(`LIST ${prefix}`);
    return {
      Contents: Object.keys(objects)
        .filter((key) => key.startsWith(prefix))
        .sort()
        .map((Key) => ({ Key })),
      IsTruncated: false,
    };
  };
  return { sent, send, objects };
}

/** A state as the laptop exports it, an IndexedDB store among its origins' fields. */
const STATE = {
  cookies: [
    {
      name: 'li_at',
      value: 'secret',
      domain: '.jobs.test',
      path: '/',
      expires: 1_800_000_000,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ],
  origins: [
    {
      origin: 'https://jobs.test',
      localStorage: [{ name: 'k', value: 'v' }],
      indexedDB: [{ name: 'db', version: 1, stores: [] }],
    },
  ],
};

describe('the session’s files in a bucket', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'browser-session-s3-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const filesOver = (objects: Record<string, Uint8Array>) => {
    const bucket = bucketOf(objects);
    const logs: string[] = [];
    const files = s3SessionFiles({
      bucket: 'files-1',
      profilesDir: join(root, 'profiles'),
      docsDir: join(root, 'docs'),
      send: bucket.send,
      log: (text) => logs.push(text),
    });
    return { ...bucket, logs, files };
  };

  it('[BRW-32] restores the profile from its archive over any stale directory, and archives it back under its key as gzip, caches left out', async () => {
    // An archive as a run left it, made the way the adapter makes one.
    const earlier = join(root, 'earlier');
    mkdirSync(join(earlier, 'linkedin', 'Default', 'Cache'), { recursive: true });
    writeFileSync(join(earlier, 'linkedin', 'Default', 'Cookies'), 'signed in');
    const archive = join(root, 'linkedin.tar.gz');
    await archiveProfile(earlier, 'linkedin', archive);
    const { files, sent, logs, objects } = filesOver({
      'profiles/linkedin.tar.gz': readFileSync(archive),
    });
    // A stale directory an earlier task left on this disk.
    mkdirSync(join(root, 'profiles', 'linkedin'), { recursive: true });
    writeFileSync(join(root, 'profiles', 'linkedin', 'stale'), 'x');

    expect(await files.profile('linkedin')).toEqual({ kind: 'archived' });
    expect(readFileSync(join(root, 'profiles', 'linkedin', 'Default', 'Cookies'), 'utf8')).toBe(
      'signed in',
    );
    expect(existsSync(join(root, 'profiles', 'linkedin', 'stale'))).toBe(false);
    expect(sent).toEqual(['HEAD profiles/linkedin.tar.gz', 'GET profiles/linkedin.tar.gz']);
    expect(logs[0]).toMatch(
      /^profile linkedin: restored from s3:\/\/files-1\/profiles\/linkedin\.tar\.gz \(\d+ bytes\)$/,
    );

    // The run wrote into the profile; the save archives it, the cache it refilled left out.
    writeFileSync(join(root, 'profiles', 'linkedin', 'Default', 'Cookies'), 'refreshed');
    mkdirSync(join(root, 'profiles', 'linkedin', 'Default', 'Cache'), { recursive: true });
    writeFileSync(join(root, 'profiles', 'linkedin', 'Default', 'Cache', 'y'), 'cache');
    await files.saveProfile('linkedin');
    expect(sent[2]).toBe('PUT profiles/linkedin.tar.gz application/gzip');
    const stored = objects['profiles/linkedin.tar.gz'];
    expect([stored?.[0], stored?.[1]], 'gzip magic').toEqual([0x1f, 0x8b]);
    expect(logs[1]).toMatch(
      /^profile linkedin: archived to s3:\/\/files-1\/profiles\/linkedin\.tar\.gz \(\d+ bytes\)$/,
    );
    const back = join(root, 'back');
    writeFileSync(join(root, 'back.tar.gz'), stored ?? new Uint8Array());
    mkdirSync(back);
    await extractProfile(join(root, 'back.tar.gz'), back);
    expect(readFileSync(join(back, 'linkedin', 'Default', 'Cookies'), 'utf8')).toBe('refreshed');
    expect(existsSync(join(back, 'linkedin', 'Default', 'Cache'))).toBe(false);
  });

  it('[BRW-36] refuses an archive that holds no directory of the profile’s name, naming its key, instead of restoring nothing and archiving a fresh profile over it', async () => {
    // An archive made by hand under another name: its members are other/…, never linkedin/….
    const elsewhere = join(root, 'elsewhere');
    mkdirSync(join(elsewhere, 'other', 'Default'), { recursive: true });
    writeFileSync(join(elsewhere, 'other', 'Default', 'Cookies'), 'signed in');
    const archive = join(root, 'other.tar.gz');
    await archiveProfile(elsewhere, 'other', archive);
    const { files, logs } = filesOver({ 'profiles/linkedin.tar.gz': readFileSync(archive) });
    const refused = files.profile('linkedin');
    await expect(refused).rejects.toThrow(SessionRefused);
    await expect(refused).rejects.toThrow(
      's3://files-1/profiles/linkedin.tar.gz holds no linkedin/ directory',
    );
    await expect(refused).rejects.toThrow('pnpm aws:files rm profiles/linkedin.tar.gz');
    expect(existsSync(join(root, 'profiles', 'linkedin'))).toBe(false);
    expect(logs).toEqual([]);
  });

  it('[BRW-31] seeds a fresh profile from the exported state when no archive exists — its IndexedDB kept — and refuses, naming both keys and the push command, where neither exists', async () => {
    const { files, sent, logs } = filesOver({
      'state/linkedin.json': Buffer.from(JSON.stringify(STATE)),
    });
    mkdirSync(join(root, 'profiles', 'linkedin'), { recursive: true });
    writeFileSync(join(root, 'profiles', 'linkedin', 'stale'), 'x');
    expect(await files.profile('linkedin')).toEqual({ kind: 'seed', state: STATE });
    // The seed replaces everything a profile holds: whatever was on disk is gone.
    expect(existsSync(join(root, 'profiles', 'linkedin'))).toBe(false);
    expect(sent).toEqual([
      'HEAD profiles/linkedin.tar.gz',
      'HEAD state/linkedin.json',
      'GET state/linkedin.json',
    ]);
    expect(logs).toEqual([
      'profile linkedin: no archive yet — a fresh profile, seeded from s3://files-1/state/linkedin.json (1 cookie(s), 1 origin(s))',
    ]);

    // [BRW-36] With a bucket set, neither file is a setup not done — never a run signed out.
    const empty = filesOver({});
    const refused = empty.files.profile('builtin');
    await expect(refused).rejects.toThrow(SessionRefused);
    await expect(refused).rejects.toThrow(
      'profile builtin: no profiles/builtin.tar.gz and no state/builtin.json in s3://files-1 — export the sign-in on the laptop and push it first: pnpm browser-session export-state --profile builtin --out <file>, then pnpm aws:files push <file> state/builtin.json',
    );
    expect(empty.sent).toEqual(['HEAD profiles/builtin.tar.gz', 'HEAD state/builtin.json']);

    // A state the schema does not read is refused naming the key and the field; so is one that is not JSON.
    const broken = filesOver({
      'state/linkedin.json': Buffer.from(JSON.stringify({ cookies: [{ name: 'a' }], origins: [] })),
    });
    await expect(broken.files.profile('linkedin')).rejects.toThrow(
      's3://files-1/state/linkedin.json is not a storage state: cookies.0.value',
    );
    const notJson = filesOver({ 'state/linkedin.json': Buffer.from('{') });
    await expect(notJson.files.profile('linkedin')).rejects.toThrow(
      's3://files-1/state/linkedin.json is not JSON',
    );
  });

  it('[BRW-32] writes every document under the documents dir and says how many; a profile with nothing to archive is said, not failed', async () => {
    const { files, sent, logs } = filesOver({
      'docs/': new Uint8Array(),
      'docs/Resume_2026_c.pdf': Buffer.from('%PDF-1.7'),
      'docs/letters/cover.pdf': Buffer.from('%PDF'),
    });
    await files.documents();
    expect(readFileSync(join(root, 'docs', 'Resume_2026_c.pdf'), 'utf8')).toBe('%PDF-1.7');
    expect(readFileSync(join(root, 'docs', 'letters', 'cover.pdf'), 'utf8')).toBe('%PDF');
    expect(sent).toEqual([
      'LIST docs/',
      'GET docs/Resume_2026_c.pdf',
      'GET docs/letters/cover.pdf',
    ]);
    expect(logs).toEqual([
      `documents: 2 file(s) written under ${join(root, 'docs')} from s3://files-1/docs/`,
    ]);

    await files.saveProfile('nobody');
    expect(logs[1]).toBe(`profile nobody: nothing under ${join(root, 'profiles')} to archive`);
    expect(sent).toHaveLength(3);

    const outside = filesOver({ 'docs/../.env': Buffer.from('x') });
    await expect(outside.files.documents()).rejects.toThrow(
      'names a path outside the documents dir',
    );
  });
});
