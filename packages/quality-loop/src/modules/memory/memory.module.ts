import { Logger, Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { QdrantClient } from '@qdrant/js-client-rest';
import { MemoryEmbedding } from '@sysdesign/db';
import {
  createEmbeddingClientFromEnv,
  embeddingAvailabilityFromEnv,
  type EmbeddingClient,
  type LlmClient,
} from '@sysdesign/llm';

import { CachedEmbeddings } from '../../orchestrators/memory/embeddings';
import {
  noQueryProbes,
  type EmbeddingCache,
  type MemoryPorts,
  type MemoryStore,
  type QueryProbes,
} from '../../orchestrators/memory/ports';
import { OrchestrationRecordModule } from '../orchestration/orchestration-record.module';
import { availabilityOf, llmBacked } from '../runs/llm-backed';
import { RunsModule } from '../runs/runs.module';
import { QUALITY_LOOP_LLM } from '../runs/tokens';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';
import { MikroOrmEmbeddingCache } from './persistence/mikro-orm-embedding-cache';
import { LlmQueryProbes } from './query-probes/llm-query-probes';
import { DEFAULT_QDRANT_URL, QdrantMemoryStore } from './qdrant/qdrant-memory-store';
import {
  EMBEDDING_CACHE,
  EMBEDDING_CLIENT,
  MEMORY_PORTS,
  MEMORY_STORE,
  QUERY_PROBES,
} from './tokens';

const logger = new Logger('Memory');

/** A stalled store must not hold a request or boot; a refused one is reported at once. */
const QDRANT_TIMEOUT_MS = 5_000;

/** The store is bound to the embedding client's model and width at boot. */
const qdrantStore = (client: EmbeddingClient): QdrantMemoryStore =>
  new QdrantMemoryStore(
    new QdrantClient({
      url: process.env['QDRANT_URL'] || DEFAULT_QDRANT_URL,
      apiKey: process.env['QDRANT_API_KEY'] || undefined,
      timeout: QDRANT_TIMEOUT_MS,
      checkCompatibility: false,
    }),
    client.model,
    client.dimensions,
  );

/** The memory orchestrator's ports, bound once from the adapters this module built. */
const memoryPorts = (
  client: EmbeddingClient,
  cache: EmbeddingCache,
  store: MemoryStore,
  probes: QueryProbes,
): MemoryPorts => {
  const embeddings = new CachedEmbeddings(client, cache, (message) => logger.warn(message));
  return {
    embedding: availabilityOf(embeddings, () => embeddingAvailabilityFromEnv().reason),
    embeddings,
    store,
    probes,
  };
};

/**
 * The memory orchestrator's adapters — embeddings, the vector store, the
 * query probes — and the two tools that need them without a run: the
 * re-index and the retrieval report. The run itself is an orchestration.
 */
@Module({
  imports: [RunsModule, OrchestrationRecordModule, MikroOrmModule.forFeature([MemoryEmbedding])],
  controllers: [MemoryController],
  providers: [
    MemoryService,
    // The environment decides once, at boot: OPENAI_API_KEY under the quality
    // loop's own determinism switch, else the no-op that keeps every run honest
    // about why it skipped.
    { provide: EMBEDDING_CLIENT, useFactory: createEmbeddingClientFromEnv },
    { provide: EMBEDDING_CACHE, useClass: MikroOrmEmbeddingCache },
    { provide: MEMORY_STORE, useFactory: qdrantStore, inject: [EMBEDDING_CLIENT] },
    // The same client the runs module uses; no model means no probes, and a
    // recall over the goal alone — exactly what it did before probes existed.
    {
      provide: QUERY_PROBES,
      useFactory: (client: LlmClient): QueryProbes =>
        llmBacked(client, (llm, warn) => new LlmQueryProbes(llm, warn), noQueryProbes, logger),
      inject: [QUALITY_LOOP_LLM],
    },
    {
      provide: MEMORY_PORTS,
      useFactory: memoryPorts,
      inject: [EMBEDDING_CLIENT, EMBEDDING_CACHE, MEMORY_STORE, QUERY_PROBES],
    },
  ],
  exports: [MEMORY_PORTS, MEMORY_STORE, EMBEDDING_CLIENT],
})
export class MemoryModule {}
