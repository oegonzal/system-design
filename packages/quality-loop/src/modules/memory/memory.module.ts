import { Logger, Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/postgresql';
import { MemoryEmbedding, MemorySupport, mikroOrmExecutor } from '@sysdesign/db';
import {
  createEmbeddingClientFromEnv,
  embeddingAvailability,
  type EmbeddingClient,
  type LlmClient,
} from '@sysdesign/llm';

import { CachedEmbeddings } from '../../orchestrators/memory/embeddings';
import type { KnowledgePorts, SupportStore } from '../../orchestrators/knowledge/ports';
import type {
  EmbeddingCache,
  MemoryPorts,
  MemoryStore,
  QueryProbes,
} from '../../orchestrators/memory/ports';
import { OrchestrationRecordModule } from '../orchestration/orchestration-record.module';
import { RunsModule } from '../runs/runs.module';
import { QUALITY_LOOP_LLM } from '../runs/tokens';
import { MemoryController } from './memory.controller';
import { MemoryRunRecall } from './memory-run-recall';
import { MemoryService } from './memory.service';
import { MikroOrmEmbeddingCache } from './persistence/mikro-orm-embedding-cache';
import { MikroOrmMemorySupport } from './persistence/mikro-orm-memory-support';
import { LlmQueryProbes } from './query-probes/llm-query-probes';
import { PgvectorMemoryStore } from './pgvector/pgvector-memory-store';
import {
  EMBEDDING_CACHE,
  EMBEDDING_CLIENT,
  KNOWLEDGE_PORTS,
  MEMORY_PORTS,
  MEMORY_STORE,
  MEMORY_SUPPORT,
  QUERY_PROBES,
} from './tokens';

const logger = new Logger('Memory');

/**
 * The store is bound to the embedding client's model and width at boot, over
 * the same database connection the run tables use: the collection is a
 * table beside them, so there is no second server to name or reach.
 */
const pgvectorStore = (em: EntityManager, client: EmbeddingClient): PgvectorMemoryStore =>
  new PgvectorMemoryStore(mikroOrmExecutor(em), client.model, client.dimensions);

/** The memory orchestrator's ports, bound once from the adapters this module built. */
const memoryPorts = (
  client: EmbeddingClient,
  cache: EmbeddingCache,
  store: MemoryStore,
  probes: QueryProbes,
): MemoryPorts => {
  const embeddings = new CachedEmbeddings(client, cache, (message) => logger.warn(message));
  return {
    // From the client that was built, never re-read from the environment.
    embedding: embeddingAvailability(client),
    embeddings,
    store,
    probes,
  };
};

/**
 * The memory orchestrator's adapters — embeddings, the vector store, the
 * query probes — the `/memory` routes, tools that run no pipeline (the
 * re-index, the two retractions, the two retrieval reports and the two
 * reports on what recalls did), and the recall a run asks for its own
 * producer, which binds itself into the runs module's slot. The memory run
 * itself is an orchestration.
 */
@Module({
  imports: [
    RunsModule,
    OrchestrationRecordModule,
    MikroOrmModule.forFeature([MemoryEmbedding, MemorySupport]),
  ],
  controllers: [MemoryController],
  providers: [
    MemoryService,
    MemoryRunRecall,
    // The environment decides once, at boot: OPENAI_API_KEY, else a disabled
    // client that carries its reason — the memory tier is optional.
    { provide: EMBEDDING_CLIENT, useFactory: createEmbeddingClientFromEnv },
    { provide: EMBEDDING_CACHE, useClass: MikroOrmEmbeddingCache },
    { provide: MEMORY_SUPPORT, useClass: MikroOrmMemorySupport },
    { provide: MEMORY_STORE, useFactory: pgvectorStore, inject: [EntityManager, EMBEDDING_CLIENT] },
    // The same client the runs module uses.
    {
      provide: QUERY_PROBES,
      useFactory: (client: LlmClient): QueryProbes =>
        new LlmQueryProbes(client, (message) => logger.warn(message)),
      inject: [QUALITY_LOOP_LLM],
    },
    {
      provide: MEMORY_PORTS,
      useFactory: memoryPorts,
      inject: [EMBEDDING_CLIENT, EMBEDDING_CACHE, MEMORY_STORE, QUERY_PROBES],
    },
    // The same objects the memory ports hold, plus the support store: one
    // adapter set, two port shapes, so nothing is built twice.
    {
      provide: KNOWLEDGE_PORTS,
      useFactory: (memory: MemoryPorts, support: SupportStore): KnowledgePorts => ({
        embedding: memory.embedding,
        embeddings: memory.embeddings,
        store: memory.store,
        support,
      }),
      inject: [MEMORY_PORTS, MEMORY_SUPPORT],
    },
  ],
  exports: [MEMORY_PORTS, KNOWLEDGE_PORTS, MEMORY_STORE, EMBEDDING_CLIENT],
})
export class MemoryModule {}
