import {
  recoverySchema,
  REGISTER_DIGEST_MAX_PARTS,
  STRATEGY_REGISTERS_BOUND,
} from '@sysdesign/contracts';

import {
  INGEST_ENV,
  INGEST_RECOVERY,
  IngestConfigError,
  loadIngestConfig,
  NONE,
  PARTS_PER_CHUNK_BOUND,
  registerNames,
  spaceName,
  subjectName,
  tenantName,
} from './config';
import { MAX_PARTS_PER_CHUNK } from './core/chunk';
import { chunkBytes, forgetReason, ingestKind, partsPerChunkWithin } from './flag-values';

describe('INGEST_RECOVERY', () => {
  it('is a recovery a client can ride a restart out by: a window and a pause, as the contract declares them', () => {
    expect(recoverySchema.parse(INGEST_RECOVERY)).toEqual(INGEST_RECOVERY);
    // A window, not a single attempt: a restarting service is asked again before a start counts as unreachable.
    expect(INGEST_RECOVERY.windowMs).toBeGreaterThan(INGEST_RECOVERY.pauseMs);
  });
});

describe('loadIngestConfig', () => {
  it('answers the defaults from an empty environment: the loop sink, every service at its declared address', () => {
    expect(loadIngestConfig({})).toEqual({
      loopUrl: INGEST_ENV.loopUrl.fallback,
      studioUrl: INGEST_ENV.studioUrl.fallback,
      home: INGEST_ENV.home.fallback,
      subject: undefined,
      memoryUrl: INGEST_ENV.memoryUrl.fallback,
      sink: { kind: 'loop' },
    });
    expect(INGEST_ENV.sink.fallback).toBe('loop');
    for (const variable of [
      INGEST_ENV.memoryTenant,
      INGEST_ENV.memorySpace,
      INGEST_ENV.memoryRegisters,
    ]) {
      expect(variable.fallback).toBe(NONE);
    }
  });

  it('reads each declared variable, trimmed, treating blank as unset', () => {
    expect(
      loadIngestConfig({
        [INGEST_ENV.loopUrl.name]: 'https://loop.example.test/ ',
        [INGEST_ENV.studioUrl.name]: 'https://studio.example.test// ',
        [INGEST_ENV.memoryUrl.name]: ' https://memory.example.test/ ',
        [INGEST_ENV.home.name]: ' /tmp/ingest ',
        [INGEST_ENV.subject.name]: ' Ada Lovelace ',
      }),
    ).toEqual({
      loopUrl: 'https://loop.example.test',
      studioUrl: 'https://studio.example.test',
      home: '/tmp/ingest',
      subject: 'Ada Lovelace',
      memoryUrl: 'https://memory.example.test',
      sink: { kind: 'loop' },
    });
    expect(
      loadIngestConfig({ [INGEST_ENV.home.name]: '  ', [INGEST_ENV.subject.name]: '' }),
    ).toMatchObject({ home: INGEST_ENV.home.fallback, subject: undefined });
  });

  it('[ING-4] reads the space sink: the tenant, the space by name and the registers a digest may file into, comma-separated and trimmed', () => {
    expect(
      loadIngestConfig({
        [INGEST_ENV.sink.name]: 'space',
        [INGEST_ENV.memoryTenant.name]: ' north ',
        [INGEST_ENV.memorySpace.name]: 'notes-space',
        [INGEST_ENV.memoryRegisters.name]: 'profile_fact, profile_story ,claim_boundary',
      }).sink,
    ).toEqual({
      kind: 'space',
      tenant: 'north',
      space: 'notes-space',
      registers: ['profile_fact', 'profile_story', 'claim_boundary'],
    });
  });

  it('[ING-4] refuses by name a space variable left at none, or unset, when the sink is a space — and reads none of them under the loop', () => {
    const space = {
      [INGEST_ENV.sink.name]: 'space',
      [INGEST_ENV.memoryTenant.name]: 'north',
      [INGEST_ENV.memorySpace.name]: 'notes-space',
      [INGEST_ENV.memoryRegisters.name]: 'profile_fact',
    };
    for (const variable of [
      INGEST_ENV.memoryTenant,
      INGEST_ENV.memorySpace,
      INGEST_ENV.memoryRegisters,
    ]) {
      for (const value of [NONE, undefined, '  ']) {
        const env = { ...space, [variable.name]: value };
        expect(() => loadIngestConfig(env), `${variable.name}=${value}`).toThrow(
          `${variable.name} must be set when ${INGEST_ENV.sink.name} is space, got ${NONE}`,
        );
      }
    }
    expect(() =>
      loadIngestConfig({ ...space, [INGEST_ENV.memorySpace.name]: 'Not A Space' }),
    ).toThrow(`${INGEST_ENV.memorySpace.name} must name a memory space`);
    expect(() => loadIngestConfig({ ...space, [INGEST_ENV.memoryRegisters.name]: 'a, a' })).toThrow(
      `${INGEST_ENV.memoryRegisters.name} names a register twice`,
    );
    // Under the loop the space variables are not read: a stray value refuses nothing.
    expect(loadIngestConfig({ [INGEST_ENV.memorySpace.name]: 'Not A Space' }).sink).toEqual({
      kind: 'loop',
    });
  });

  it('refuses a sink it does not know, and a memory host URL it cannot use, naming the variable', () => {
    expect(() => loadIngestConfig({ [INGEST_ENV.sink.name]: 'lake' })).toThrow(
      `${INGEST_ENV.sink.name} must be one of loop, space, got lake`,
    );
    expect(() => loadIngestConfig({ [INGEST_ENV.memoryUrl.name]: 'memory' })).toThrow(
      new RegExp(`^${INGEST_ENV.memoryUrl.name} must be a URL`),
    );
  });

  it('refuses a subject past the contract bound, naming the variable', () => {
    expect(() => loadIngestConfig({ [INGEST_ENV.subject.name]: 'x'.repeat(121) })).toThrow(
      `${INGEST_ENV.subject.name} must name the subject in 1 to 120 characters, got 121`,
    );
  });

  it('refuses a studio or a loop URL it cannot use, naming the variable', () => {
    expect(() => loadIngestConfig({ [INGEST_ENV.studioUrl.name]: 'studio' })).toThrow(
      new RegExp(`^${INGEST_ENV.studioUrl.name} must be a URL`),
    );
    expect(() => loadIngestConfig({ [INGEST_ENV.studioUrl.name]: 'file:///studio' })).toThrow(
      new RegExp(`^${INGEST_ENV.studioUrl.name} must be an http\\(s\\) URL`),
    );
    expect(() => loadIngestConfig({ [INGEST_ENV.loopUrl.name]: 'not a url' })).toThrow(
      new RegExp(`^${INGEST_ENV.loopUrl.name} must be a URL`),
    );
    expect(() => loadIngestConfig({ [INGEST_ENV.loopUrl.name]: 'ftp://loop' })).toThrow(
      new RegExp(`^${INGEST_ENV.loopUrl.name} must be an http\\(s\\) URL`),
    );
    expect(() => loadIngestConfig({ [INGEST_ENV.loopUrl.name]: 'ftp://loop' })).toThrow(
      IngestConfigError,
    );
  });
});

describe('flag values', () => {
  it('reads --chunk-bytes as a positive integer within the engine budget, defaulting when absent', () => {
    expect(chunkBytes(undefined)).toBe(6000);
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

  it('[ING-4] holds --parts-per-chunk to the configured store’s digest: the loop’s document digest takes more parts than a space’s register digest', () => {
    expect(PARTS_PER_CHUNK_BOUND).toEqual({
      loop: MAX_PARTS_PER_CHUNK,
      space: REGISTER_DIGEST_MAX_PARTS,
    });
    expect(partsPerChunkWithin(8, 'space')).toBe(8);
    expect(partsPerChunkWithin(REGISTER_DIGEST_MAX_PARTS, 'space')).toBe(REGISTER_DIGEST_MAX_PARTS);
    expect(partsPerChunkWithin(MAX_PARTS_PER_CHUNK, 'loop')).toBe(MAX_PARTS_PER_CHUNK);
    expect(() => partsPerChunkWithin(REGISTER_DIGEST_MAX_PARTS + 1, 'space')).toThrow(
      `--parts-per-chunk must be at most ${REGISTER_DIGEST_MAX_PARTS} when ${INGEST_ENV.sink.name} is space, got ${REGISTER_DIGEST_MAX_PARTS + 1}`,
    );
  });

  it('[ING-4] reads a space, a tenant, registers and a reason within the contracts’ grammars, naming where each came from', () => {
    expect(spaceName(' notes-space ', '--space')).toBe('notes-space');
    expect(() => spaceName('Notes Space', '--space')).toThrow(/^--space must name a memory space/);
    expect(tenantName(' north ', '--tenant')).toBe('north');
    for (const bad of ['', ' ', NONE]) {
      expect(() => tenantName(bad, '--tenant')).toThrow(/^--tenant must name the tenant/);
    }
    expect(registerNames('a, b', 'R')).toEqual(['a', 'b']);
    const most = STRATEGY_REGISTERS_BOUND.ceiling;
    const tooMany = Array.from({ length: most + 1 }, (_, i) => `r${i}`).join(',');
    for (const bad of [' , ', tooMany]) {
      expect(() => registerNames(bad, 'R')).toThrow(`R must name 1 to ${most} registers`);
    }
    expect(() => registerNames('x'.repeat(200), 'R')).toThrow(/^R must name a register in 1 to/);
    expect(forgetReason(' stated of someone else ')).toBe('stated of someone else');
    expect(() => forgetReason(' ')).toThrow(/^--reason must say why/);
    // The contract's bound on a reason accepts its ceiling; past it, the host's door would refuse.
    expect(forgetReason('x'.repeat(301))).toHaveLength(301);
    expect(() => forgetReason('x'.repeat(376))).toThrow(/^--reason must say why/);
  });
});
