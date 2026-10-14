import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import type { ExperienceProfileDto } from '@sysdesign/contracts';
import {
  ensureDatabase,
  ExperienceProfile,
  Prompt,
  PromptGeneration,
  StarStory,
  truncateTestTables,
} from '@sysdesign/db';

import { configureApp } from '../common/configure-app';
import { AppModule } from '../modules/app/app.module';
import { QualityLoopClient } from '../modules/quality-loop/quality-loop.client';
import { FakeQualityLoopClient } from './fake-quality-loop.client';

export interface Harness {
  app: INestApplication;
  em: EntityManager;
  /** The grader, as the specs script it. */
  loop: FakeQualityLoopClient;
  /** Absolute base URL including the /api prefix. */
  url: string;
  close: () => Promise<void>;
}

/**
 * Boots the real application on an ephemeral port with one substitution: the
 * quality loop is a fake bound to its port, so a spec scripts what the grader
 * answers and asserts what the studio asked it. `configureApp` is shared with
 * `main.ts` on purpose, and `listen(0)` plus global `fetch` sends every
 * request through the real HTTP stack — pipes, request-scoped MikroORM
 * context included.
 */
async function createHarness(): Promise<Harness> {
  // The suite's database (the test database by default — vite.config.ts) is
  // created and migrated on first use, and any other is refused here, so
  // `nx test` never needs the dev database and can never truncate it.
  await ensureDatabase();

  const loop = new FakeQualityLoopClient();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(QualityLoopClient)
    .useValue(loop)
    .compile();

  const app = configureApp(moduleRef.createNestApplication());
  await app.listen(0);

  const em = app.get(EntityManager);
  await ensureSeeded(em);

  return {
    app,
    em,
    loop,
    url: `${await app.getUrl()}/api`,
    close: () => app.close(),
  };
}

/**
 * The harness for one spec file's suite: booted before its first test,
 * emptied before each, closed after its last. Call it inside the file's
 * `describe`. What it returns reads through to the booted harness at the
 * moment of use, so helpers and tests written against `h.url` or `h.loop`
 * work as they are; reading it before the suite boots is a mistake, and says so.
 */
export function useHarness(): Harness {
  let booted: Harness | undefined;
  const current = (): Harness => {
    if (booted === undefined) {
      throw new Error('the harness boots in beforeAll: read it from a hook or a test');
    }
    return booted;
  };
  beforeAll(async () => {
    booted = await createHarness();
  });
  afterAll(async () => {
    await booted?.close();
  });
  beforeEach(async () => {
    await resetDesignData(current().em, current().loop);
  });
  return {
    get app() {
      return current().app;
    },
    get em() {
      return current().em;
    },
    get loop() {
      return current().loop;
    },
    get url() {
      return current().url;
    },
    close: () => current().close(),
  };
}

/** Two of the experiences the harness seeds, by the fixture's ids. */
export const TICKETING_ID = 'e1000000-0000-4000-8000-000000000001';
export const MEDIA_ID = 'e1000000-0000-4000-8000-000000000002';

/** An id no row has: what a spec asks for when it expects a 404. */
export const UNKNOWN_UUID = '11111111-1111-4111-8111-111111111111';

/**
 * Self-sufficient: seed the experience fixture if this database never was.
 *
 * The fixture is read with `readFileSync` rather than imported — a relative
 * import across package roots would drag `packages/db` inside this package's
 * `rootDir` and break the tsconfig.
 */
async function ensureSeeded(em: EntityManager): Promise<void> {
  const fork = em.fork();
  if ((await fork.count(ExperienceProfile)) > 0) return;

  const fixture = join(__dirname, '../../../db/src/seed/experiences.fixture.json');
  const rows = JSON.parse(readFileSync(fixture, 'utf8')) as Array<
    Omit<ExperienceProfileDto, 'createdAt'>
  >;
  await fork.upsertMany(
    ExperienceProfile,
    rows.map((row) => ({ ...row, createdAt: new Date() })),
  );
  await fork.flush();
}

/**
 * Wipes everything the tests create — in a test database only, which
 * `truncateTestTables` checks on the connection itself. Truncating `prompt`
 * cascades through design_session, design_revision and prompt_generation (and
 * any story linked to a prompt); an unclaimed generation and an unlinked
 * story are truncated in their own right. The seeded experiences deliberately
 * survive, and the fake grader forgets.
 */
async function resetDesignData(em: EntityManager, loop?: FakeQualityLoopClient): Promise<void> {
  await truncateTestTables(em, [Prompt, PromptGeneration, StarStory]);
  loop?.reset();
}

/** Small fetch wrapper returning both status and parsed body (204-safe). */
export async function call<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T };
}
