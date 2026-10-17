import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryVectorIndex, tableEmbedder, TEST_POLICY } from '@sysdesign/agentic-memory/testing';
import { ensureDatabase } from '@sysdesign/db';
import { LoopClient } from '@sysdesign/loop-client';

import { CLOCK } from '../common/clock';
import { EVENT_SINK } from '../designs';
import { FakeEventSink, FakeLoopClient } from '../designs/testing';
import { VECTOR_INDEX } from '../memory';
import type { AgenticSystemConfig } from '../config';
import { AppModule } from './app.module';

/** The embedder memory runs on under test: the runtime's table embedder, enabled, as the llm client reports one with a key. */
const EMBEDDER = { model: 'spec-embedder', dimensions: 4 };

const testConfig = (): AgenticSystemConfig => ({
  port: 0,
  loopUrl: 'http://loop.test',
  notificationsUrl: 'http://bus.test',
  qdrantUrl: 'http://vectors.test',
  embedder: { ...tableEmbedder(EMBEDDER), enabled: true, reason: null },
  settings: {
    design: {
      pipeline: 'memory-architecture',
      orchestrator: 'memory-design',
      maxIterations: 3,
      recall: true,
      pollEveryMs: 1,
    },
    memory: { ...TEST_POLICY, sweep: { everyMs: null } },
    policySource: 'memory/spec',
    sources: { design: 'config/design/standard.json', memory: 'config/memory/spec.json' },
  },
});

/**
 * The service as `main` composes it, on a free port over the test database,
 * with the loop faked — `artifacts` names the runs that hold an artifact — and
 * memory projected into an index in memory, so the HTTP surface is specced
 * without reaching the loop, Qdrant or a model. Records and spaces are the
 * runtime's real Postgres stores. A database that is not a test one is refused
 * here first.
 */
export async function bootApp(options: { artifacts?: ReadonlyMap<string, unknown> } = {}): Promise<{
  app: INestApplication;
  url: string;
  loop: FakeLoopClient;
}> {
  await ensureDatabase();
  const loop = new FakeLoopClient(options.artifacts);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(testConfig())] })
    .overrideProvider(LoopClient)
    .useValue(loop)
    .overrideProvider(EVENT_SINK)
    .useValue(new FakeEventSink())
    .overrideProvider(VECTOR_INDEX)
    .useValue(new InMemoryVectorIndex(`spec__${EMBEDDER.model}`))
    .overrideProvider(CLOCK)
    .useValue((): Date => new Date('2026-10-16T00:00:00Z'))
    .compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  return { app, url: await app.getUrl(), loop };
}
