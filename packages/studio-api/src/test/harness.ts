import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { ExperienceProfileDto } from '@sysdesign/contracts';
import { ensureDatabase, ExperienceProfile } from '@sysdesign/db';

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
export async function createHarness(): Promise<Harness> {
  // The suite's database (sysdesign_test by default — vite.config.ts) is
  // created and migrated on first use, so `nx test` never needs the dev
  // database and never truncates it.
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
 * Wipes everything the tests create. Truncating `prompt` cascades through
 * design_session, design_revision and prompt_generation (and any story
 * linked to a prompt); `star_story` is truncated for the unlinked rest. The
 * seeded experiences deliberately survive, and the fake grader forgets.
 */
export async function resetDesignData(
  em: EntityManager,
  loop?: FakeQualityLoopClient,
): Promise<void> {
  const connection = em.fork().getConnection();
  await connection.execute('truncate table "prompt" cascade');
  await connection.execute('truncate table "prompt_generation" cascade');
  await connection.execute('truncate table "star_story" cascade');
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
