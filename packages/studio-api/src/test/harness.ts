import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { ExperienceProfileDto } from '@sysdesign/contracts';
import { ExperienceProfile } from '@sysdesign/db';

import { configureApp } from '../common/configure-app';
import { AppModule } from '../modules/app/app.module';

export interface Harness {
  app: INestApplication;
  em: EntityManager;
  /** Absolute base URL including the /api prefix. */
  url: string;
  close: () => Promise<void>;
}

/**
 * Boots the real application on an ephemeral port.
 *
 * `configureApp` is shared with `main.ts` on purpose — a harness that built
 * its own ValidationPipe could pass against rules production never applies.
 *
 * `listen(0)` plus global `fetch` rather than supertest keeps the dependency
 * list unchanged, and requests go through the real HTTP stack — middleware,
 * request-scoped MikroORM context included.
 */
export async function createHarness(): Promise<Harness> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = configureApp(moduleRef.createNestApplication());
  await app.listen(0);

  const em = app.get(EntityManager);
  await ensureSeeded(em);

  return {
    app,
    em,
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
 * design_session, design_revision, evaluation, finding and eval_job (and any
 * story linked to a prompt); `star_story` is truncated for the unlinked rest.
 * The seeded experiences deliberately survive.
 */
export async function resetDesignData(em: EntityManager): Promise<void> {
  const connection = em.fork().getConnection();
  await connection.execute('truncate table "prompt" cascade');
  await connection.execute('truncate table "star_story" cascade');
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
