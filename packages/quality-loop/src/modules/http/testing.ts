/**
 * The harness the HTTP suites share: a dump directory of the suite's own, the
 * real application over a real port with the providers a suite fakes, and the
 * two ways it talks to the app. `bootApp` guards the database itself, before
 * anything connects: `ensureDatabase` refuses any database but a test one, so
 * no suite can boot the app against someone's data, whatever it remembers to
 * call first. Tables are emptied through `@sysdesign/db`'s
 * `truncateTestTables`, which asks the connection the same question. The dump
 * directory is read when the application boots, so a suite claims its own
 * before calling `bootApp`.
 */
import type { INestApplication, Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ensureDatabase } from '@sysdesign/db';
import { DisabledEmbeddingClient } from '@sysdesign/llm';

import { fakeLlm } from '../../core/testing';
import { DEFAULT_RUN_STALE_AFTER_MS } from '../janitor/stale-after';
import { RUN_JANITOR_OPTIONS } from '../janitor/tokens';
import { InMemoryMemoryStore } from '../memory/testing';
import { EMBEDDING_CLIENT, MEMORY_STORE } from '../memory/tokens';
import { QUALITY_LOOP_LLM } from '../runs/tokens';

export type Envelope<T> = { data: T };
export type Page<T> = { data: T[]; meta: { total: number; limit: number; offset: number } };

/** A dump directory of this suite's own, so its assertions never see another suite's dump. */
export function claimDumpDir(label: string): string {
  const dir = join(tmpdir(), `sysdesign-${label}-dumps-${crypto.randomUUID()}`);
  process.env['QUALITY_LOOP_DUMP_DIR'] = dir;
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
  [RUN_JANITOR_OPTIONS, { staleAfterMs: DEFAULT_RUN_STALE_AFTER_MS, intervalMs: null }],
];

export interface BootOptions {
  /** What `configureApp` reads instead of `process.env` (the CORS origin). */
  env?: NodeJS.ProcessEnv;
  /**
   * The module to boot, when a suite means a composition other than the
   * served application's — one without the memory module, say. The served
   * `AppModule` otherwise.
   */
  root?: Type<unknown>;
}

/**
 * The real modules over real HTTP; a fresh instance shares nothing but the
 * database — a test one, created and migrated on first use, and refused
 * otherwise before the application module is even loaded.
 */
export async function bootApp(
  overrides: readonly ProviderOverride[],
  { env, root }: BootOptions = {},
): Promise<{ app: INestApplication; url: string }> {
  await ensureDatabase();
  const imported = root ?? (await import('../app/app.module')).AppModule;
  const { configureApp } = await import('../app/configure-app');
  let builder = Test.createTestingModule({ imports: [imported] });
  // A suite's override wins over the default for the same token.
  const merged = new Map<unknown, unknown>([...DEFAULT_OVERRIDES(), ...overrides]);
  for (const [token, value] of merged) builder = builder.overrideProvider(token).useValue(value);
  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>(), env);
  await app.listen(0);
  return { app, url: await app.getUrl() };
}

export const postJson = (url: string, path: string, body: unknown): Promise<Response> =>
  fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

export const getJson = async <T>(url: string, path: string): Promise<T> =>
  (await (await fetch(`${url}${path}`)).json()) as T;
