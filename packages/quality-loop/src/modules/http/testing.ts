/**
 * The harness the HTTP suites share: a dump directory of the suite's own, the
 * real application over a real port with the providers a suite fakes, the
 * tables it truncates, and the two ways it talks to the app. The application
 * module is imported inside `bootApp`, after the environment is set, because
 * the dump directory is read at import.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { EntityManager } from '@mikro-orm/postgresql';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DisabledEmbeddingClient } from '@sysdesign/llm';

import { fakeLlm } from '../../core/testing';
import { RUN_JANITOR_OPTIONS } from '../janitor/tokens';
import { InMemoryMemoryStore } from '../memory/testing';
import { EMBEDDING_CLIENT, MEMORY_STORE } from '../memory/tokens';
import { QUALITY_LOOP_LLM } from '../runs/tokens';

export type Envelope<T> = { data: T };
export type Page<T> = { data: T[]; meta: { total: number; limit: number; offset: number } };

/** A dump directory of this suite's own, so its assertions never see another suite's dump. */
export function claimDumpDir(label: string): string {
  const dir = join(tmpdir(), `sysdesign-${label}-dumps-${crypto.randomUUID()}`);
  process.env['EVAL_DUMP_DIR'] = dir;
  return dir;
}

export type ProviderOverride = readonly [token: unknown, value: unknown];

/**
 * What every suite gets unless it says otherwise. A developer's `.env`
 * (OPENAI_API_KEY, CLAUDE_CODE_OAUTH_TOKEN — Nx loads it) must never make a
 * suite reach OpenAI, bind Qdrant or call the model, so the real factories
 * are never invoked under test: a fake model with no answers, disabled
 * embeddings, an in-memory store, and a janitor that sweeps at boot with the
 * production threshold and never on a timer.
 */
const DEFAULT_OVERRIDES = (): ProviderOverride[] => [
  [QUALITY_LOOP_LLM, fakeLlm()],
  [EMBEDDING_CLIENT, new DisabledEmbeddingClient('no-key')],
  [MEMORY_STORE, new InMemoryMemoryStore(null)],
  [RUN_JANITOR_OPTIONS, { staleAfterMs: 600_000, intervalMs: null }],
];

/** The real modules over real HTTP; a fresh instance shares nothing but the database. */
export async function bootApp(
  overrides: readonly ProviderOverride[],
  env?: NodeJS.ProcessEnv,
): Promise<{ app: INestApplication; url: string }> {
  const { AppModule } = await import('../app/app.module');
  const { configureApp } = await import('../app/configure-app');
  let builder = Test.createTestingModule({ imports: [AppModule] });
  // A suite's override wins over the default for the same token.
  const merged = new Map<unknown, unknown>([...DEFAULT_OVERRIDES(), ...overrides]);
  for (const [token, value] of merged) builder = builder.overrideProvider(token).useValue(value);
  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication(), env);
  await app.listen(0);
  return { app, url: await app.getUrl() };
}

/** Empty the tables a suite writes, cascading to what references them. */
export const truncate = (em: EntityManager, tables: readonly string[]): Promise<unknown> =>
  em
    .fork()
    .getConnection()
    .execute(`truncate table ${tables.map((table) => `"${table}"`).join(', ')} cascade`);

export const postJson = (url: string, path: string, body: unknown): Promise<Response> =>
  fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

export const getJson = async <T>(url: string, path: string): Promise<T> =>
  (await (await fetch(`${url}${path}`)).json()) as T;
