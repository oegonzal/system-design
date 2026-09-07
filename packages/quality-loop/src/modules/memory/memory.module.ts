import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { QdrantClient } from '@qdrant/js-client-rest';
import { MemoryEmbedding, MemoryRun } from '@sysdesign/db';
import { createEmbeddingClientFromEnv, type EmbeddingClient } from '@sysdesign/llm';

import { EXPERIENCE_DIGEST_ID } from '../../pipelines/experience-digest/input';
import { MEMORY_RECALL_ID } from '../../pipelines/memory-recall/input';
import { RunsModule } from '../runs/runs.module';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';
import { MikroOrmEmbeddingCache } from './persistence/mikro-orm-embedding-cache';
import { MikroOrmMemoryRunRepository } from './persistence/mikro-orm-memory-run-repository';
import type { MemoryPipelines } from './ports';
import { QdrantMemoryStore } from './qdrant/qdrant-memory-store';
import {
  EMBEDDING_CACHE,
  EMBEDDING_CLIENT,
  MEMORY_PIPELINES,
  MEMORY_RUN_REPOSITORY,
  MEMORY_STORE,
} from './tokens';

export const DEFAULT_QDRANT_URL = 'http://localhost:6333';

/** The two memory roles, by registered pipeline id; a spec may override them. */
const MEMORY_ROLES: MemoryPipelines = { recall: MEMORY_RECALL_ID, digest: EXPERIENCE_DIGEST_ID };

/** The store is bound to the embedding client's model and width at boot. */
const qdrantStore = (client: EmbeddingClient): QdrantMemoryStore =>
  new QdrantMemoryStore(
    new QdrantClient({
      url: process.env['QDRANT_URL'] ?? DEFAULT_QDRANT_URL,
      apiKey: process.env['QDRANT_API_KEY'] || undefined,
      checkCompatibility: false,
    }),
    client.model,
    client.dimensions,
  );

@Module({
  imports: [RunsModule, MikroOrmModule.forFeature([MemoryRun, MemoryEmbedding])],
  controllers: [MemoryController],
  providers: [
    MemoryService,
    // The environment decides once, at boot: OPENAI_API_KEY under the quality
    // loop's own determinism switch, else the no-op that keeps every memory
    // run honest about why it skipped.
    { provide: EMBEDDING_CLIENT, useFactory: createEmbeddingClientFromEnv },
    { provide: EMBEDDING_CACHE, useClass: MikroOrmEmbeddingCache },
    { provide: MEMORY_STORE, useFactory: qdrantStore, inject: [EMBEDDING_CLIENT] },
    { provide: MEMORY_RUN_REPOSITORY, useClass: MikroOrmMemoryRunRepository },
    { provide: MEMORY_PIPELINES, useValue: MEMORY_ROLES },
  ],
})
export class MemoryModule {}
