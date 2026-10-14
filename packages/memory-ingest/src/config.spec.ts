import { recoverySchema } from '@sysdesign/contracts';

import { COMMANDS } from './cli';
import {
  chunkBytes,
  DEFAULT_CHUNK_BYTES,
  DEFAULT_HOME,
  DEFAULT_LOOP_URL,
  DEFAULT_STUDIO_URL,
  INGEST_ENV,
  INGEST_FLAGS,
  INGEST_LOOP_RECOVERY,
  IngestConfigError,
  ingestKind,
  loadIngestConfig,
  subjectName,
} from './config';

describe('INGEST_LOOP_RECOVERY', () => {
  it('is a recovery the loop client can ride a restart out by: a window and a pause, as the contract declares them', () => {
    expect(recoverySchema.parse(INGEST_LOOP_RECOVERY)).toEqual(INGEST_LOOP_RECOVERY);
    // A window, not a single attempt: a restarting loop is asked again before a start counts as unreachable.
    expect(INGEST_LOOP_RECOVERY.windowMs).toBeGreaterThan(INGEST_LOOP_RECOVERY.pauseMs);
  });
});

describe('loadIngestConfig', () => {
  it('answers the defaults from an empty environment', () => {
    expect(loadIngestConfig({})).toEqual({
      loopUrl: DEFAULT_LOOP_URL,
      studioUrl: DEFAULT_STUDIO_URL,
      home: DEFAULT_HOME,
      subject: undefined,
    });
  });

  it('reads each declared variable, trimmed, treating blank as unset', () => {
    expect(
      loadIngestConfig({
        [INGEST_ENV.loopUrl]: 'https://loop.example.test/ ',
        [INGEST_ENV.studioUrl]: 'https://studio.example.test// ',
        [INGEST_ENV.home]: ' /tmp/ingest ',
        [INGEST_ENV.subject]: ' Ada Lovelace ',
      }),
    ).toEqual({
      loopUrl: 'https://loop.example.test',
      studioUrl: 'https://studio.example.test',
      home: '/tmp/ingest',
      subject: 'Ada Lovelace',
    });
    expect(loadIngestConfig({ [INGEST_ENV.home]: '  ', [INGEST_ENV.subject]: '' })).toMatchObject({
      home: DEFAULT_HOME,
      subject: undefined,
    });
  });

  it('refuses a subject past the contract bound, naming the variable', () => {
    expect(() => loadIngestConfig({ [INGEST_ENV.subject]: 'x'.repeat(121) })).toThrow(
      `${INGEST_ENV.subject} must name the subject in 1 to 120 characters, got 121`,
    );
  });

  it('refuses a studio URL it cannot use, naming the variable', () => {
    expect(() => loadIngestConfig({ [INGEST_ENV.studioUrl]: 'studio' })).toThrow(
      new RegExp(`^${INGEST_ENV.studioUrl} must be a URL`),
    );
    expect(() => loadIngestConfig({ [INGEST_ENV.studioUrl]: 'file:///studio' })).toThrow(
      new RegExp(`^${INGEST_ENV.studioUrl} must be an http\\(s\\) URL`),
    );
  });

  it('refuses a loop URL it cannot use, naming the variable', () => {
    expect(() => loadIngestConfig({ [INGEST_ENV.loopUrl]: 'not a url' })).toThrow(
      new RegExp(`^${INGEST_ENV.loopUrl} must be a URL`),
    );
    expect(() => loadIngestConfig({ [INGEST_ENV.loopUrl]: 'ftp://loop' })).toThrow(
      new RegExp(`^${INGEST_ENV.loopUrl} must be an http\\(s\\) URL`),
    );
    expect(() => loadIngestConfig({ [INGEST_ENV.loopUrl]: 'ftp://loop' })).toThrow(
      IngestConfigError,
    );
  });
});

describe('flag values', () => {
  it('reads --chunk-bytes as a positive integer within the engine budget, defaulting when absent', () => {
    expect(chunkBytes(undefined)).toBe(DEFAULT_CHUNK_BYTES);
    expect(chunkBytes('4000')).toBe(4000);
    for (const bad of ['0', '-5', '1.5', 'lots', '64001']) {
      expect(() => chunkBytes(bad)).toThrow(/^--chunk-bytes must be a positive integer/);
    }
  });

  it('reads --subject trimmed and within the contract bound, naming the flag when it is not', () => {
    expect(subjectName(undefined, '--subject')).toBeUndefined();
    expect(subjectName(' Ada Lovelace ', '--subject')).toBe('Ada Lovelace');
    expect(subjectName('x'.repeat(120), '--subject')).toHaveLength(120);
    for (const bad of ['', '   ', 'x'.repeat(121)]) {
      expect(() => subjectName(bad, '--subject')).toThrow(IngestConfigError);
      expect(() => subjectName(bad, '--subject')).toThrow(
        /^--subject must name the subject in 1 to 120 characters/,
      );
    }
  });

  it('reads --kind from the declared kinds, defaulting to notes', () => {
    expect(ingestKind(undefined)).toBe('notes');
    expect(ingestKind('resume')).toBe('resume');
    expect(() => ingestKind('guidance')).toThrow('--kind must be one of resume, notes');
  });

  it('declares every flag a command takes, and no flag no command takes', () => {
    const taken = new Set(Object.values(COMMANDS).flatMap((command) => [...command.flags]));
    expect([...taken].sort()).toEqual(Object.keys(INGEST_FLAGS).sort());
  });
});
