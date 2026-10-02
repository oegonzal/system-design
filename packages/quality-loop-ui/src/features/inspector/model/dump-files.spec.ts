import type { RunDumpEntryDto } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { dumpFolders, filesForCall, LLM_FOLDER, parseLlmFileName } from './dump-files';

const entry = (path: string, bytes = 10): RunDumpEntryDto => ({ path, bytes });

/** A real dump's shape: the writer's own folders and stems. */
const LISTING: RunDumpEntryDto[] = [
  entry('manifest.json', 100),
  entry('04-iterations/01/artifact.json', 42_265),
  entry('05-llm/01.critic.requirements.s2.1.system.txt', 1200),
  entry('05-llm/01.critic.requirements.s2.1.user.txt', 35_427),
  entry('05-llm/01.critic.requirements.s2.1.response.json', 9000),
  entry('05-llm/01.critic.requirements.s2.1.meta.json', 300),
  entry('05-llm/02.requirements.s2.1.user.txt', 500),
  entry('05-llm/03.producer.2.user.txt', 700),
];

describe('joining dump files to the calls that wrote them', () => {
  it('[QLU-13] decomposes the writer’s stem exactly, from the end', () => {
    // The scope may hold dots, so the name is read from the end: extension,
    // kind, ordinal, and what lies between the position and the ordinal.
    expect(parseLlmFileName('01.critic.requirements.s2.1.user.txt')).toEqual({
      position: 1,
      scope: 'critic.requirements.s2',
      ordinal: 1,
      kind: 'user',
      extension: 'txt',
    });
    expect(parseLlmFileName('14.evaluator.quality.s2.3.response.json')).toMatchObject({
      scope: 'evaluator.quality.s2',
      ordinal: 3,
      kind: 'response',
    });
    // A kind the writer may grow is carried rather than guessed at.
    expect(parseLlmFileName('02.producer.1.whatever.txt')?.kind).toBe('other');
    for (const name of ['manifest.json', 'a.b.c.d', '', 'x.producer.1.user.txt']) {
      expect(parseLlmFileName(name), name).toBeNull();
    }
  });

  it('[QLU-13] a call takes only its own files, never another whose scope ends the same way', () => {
    // Substring matching would let `requirements.s2` claim
    // `critic.requirements.s2`'s files, which is why the name is decomposed.
    const mine = filesForCall(LISTING, 'critic.requirements.s2', 1);
    expect(mine.map((file) => file.path)).toEqual([
      `${LLM_FOLDER}01.critic.requirements.s2.1.system.txt`,
      `${LLM_FOLDER}01.critic.requirements.s2.1.user.txt`,
      `${LLM_FOLDER}01.critic.requirements.s2.1.response.json`,
      `${LLM_FOLDER}01.critic.requirements.s2.1.meta.json`,
    ]);
    // Asked, then answered: the order a reader wants.
    expect(mine.map((file) => file.kind)).toEqual(['system', 'user', 'response', 'meta']);
    expect(filesForCall(LISTING, 'requirements.s2', 1).map((file) => file.path)).toEqual([
      `${LLM_FOLDER}02.requirements.s2.1.user.txt`,
    ]);
  });

  it('[QLU-13] the ordinal is part of the identity, so a later attempt is a different call', () => {
    expect(filesForCall(LISTING, 'producer', 2)).toHaveLength(1);
    expect(filesForCall(LISTING, 'producer', 1)).toEqual([]);
    expect(filesForCall([], 'producer', 1)).toEqual([]);
  });

  it('[QLU-13] the listing groups by its first segment, and interprets no name beyond that', () => {
    // The leading number on a model-call file is deliberately not read as a
    // label: measured, it means something different in nearly every run.
    expect(dumpFolders(LISTING).map((group) => [group.folder, group.entries.length])).toEqual([
      ['', 1],
      ['04-iterations', 1],
      ['05-llm', 6],
    ]);
    expect(dumpFolders(LISTING).find((group) => group.folder === '05-llm')?.bytes).toBe(
      1200 + 35_427 + 9000 + 300 + 500 + 700,
    );
    expect(dumpFolders([])).toEqual([]);
  });
});
