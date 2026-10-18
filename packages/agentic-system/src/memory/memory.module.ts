import { randomUUID } from 'node:crypto';

import {
  Logger,
  Module,
  type DynamicModule,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/postgresql';
import { QdrantClient } from '@qdrant/js-client-rest';
import {
  MemoryService,
  MikroOrmRecordStore,
  MikroOrmSpaceStore,
  QdrantVectorIndex,
  type Embedder,
  type VectorIndex,
} from '@sysdesign/agentic-memory';
import { startPeriodic, type Periodic } from '@sysdesign/contracts';
import { MemoryRecord, MemorySpace, MemorySpaceDigest } from '@sysdesign/db';
import { HttpLoopClient, LoopClient } from '@sysdesign/loop-client';

import { CLOCK, type Clock } from '../common/clock';
import { DigestsController } from './digests/digests.controller';
import { DigestsService } from './digests/digests.service';
import { DIGEST_LEDGER, type DigestLedger } from './digests/ledger';
import { MikroOrmDigestLedger } from './digests/persistence/mikro-orm-digest-ledger';
import { MemoryController } from './memory.controller';
import { policyOf, type MemorySettings } from './settings';
import { SpacesService } from './spaces.service';

/** What the memory spaces are wired from: the two service URLs, the host's embedder, and the declared settings. */
interface MemoryModuleOptions {
  loopUrl: string;
  qdrantUrl: string;
  /** Built where the environment is read and handed in; this layer constructs no model client. */
  embedder: Embedder;
  memory: MemorySettings;
  /** The settings the policy was chosen from, recorded on every space it snapshots. */
  policySource: string;
}

/** Where a space's records are projected for recall by meaning: Qdrant, in production. */
export const VECTOR_INDEX = Symbol('VECTOR_INDEX');

/** A stalled vector store must not hold a request; a refused one is reported at once. */
const QDRANT_TIMEOUT_MS = 5_000;

const logger = new Logger('Memory');
const warn = (message: string): void => logger.warn(message);

/** The runtime's sweep on its declared schedule, the run in flight let finish before the store closes. */
class MemorySweep implements OnModuleInit, OnModuleDestroy {
  private periodic: Periodic | null = null;

  constructor(
    private readonly memory: MemoryService,
    private readonly everyMs: number | null,
  ) {}

  onModuleInit(): void {
    this.periodic = startPeriodic(
      { everyMs: this.everyMs, atStart: true },
      async () => {
        const swept = await this.memory.sweep();
        if (swept.expired + swept.unprojected + swept.projected > 0) {
          logger.log(
            `swept: ${swept.expired} expired, ${swept.unprojected} unprojected, ${swept.projected} projected`,
          );
        }
      },
      (error) => warn(`sweep failed: ${String(error)}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.periodic?.stop();
  }
}

/**
 * Memory spaces wired to their ports: records and spaces in Postgres through
 * the runtime's MikroORM stores (the `memory_record` and `memory_space`
 * tables), their projection in Qdrant bound to the embedder's model and width,
 * the loop client a space's run is read and its digests are run through, the
 * ledger each digest's apply is recorded in once (the `memory_space_digest`
 * table), and the sweep on its schedule. A recovered fault the runtime
 * reports goes to the log.
 */
@Module({})
export class MemoryModule {
  static register(options: MemoryModuleOptions): DynamicModule {
    return {
      module: MemoryModule,
      imports: [MikroOrmModule.forFeature([MemorySpace, MemoryRecord, MemorySpaceDigest])],
      providers: [
        { provide: LoopClient, useFactory: () => new HttpLoopClient(options.loopUrl) },
        {
          provide: VECTOR_INDEX,
          useFactory: (): VectorIndex =>
            new QdrantVectorIndex(
              new QdrantClient({
                url: options.qdrantUrl,
                timeout: QDRANT_TIMEOUT_MS,
                checkCompatibility: false,
              }),
              options.embedder,
              options.memory.scopeKeys,
              warn,
            ),
        },
        {
          provide: MemoryService,
          useFactory: (em: EntityManager, index: VectorIndex, clock: Clock) =>
            new MemoryService({
              records: new MikroOrmRecordStore(em),
              spaces: new MikroOrmSpaceStore(em),
              index,
              embedder: options.embedder,
              clock,
              ids: randomUUID,
              warn,
            }),
          inject: [EntityManager, VECTOR_INDEX, CLOCK],
        },
        {
          provide: SpacesService,
          useFactory: (loop: LoopClient, memory: MemoryService) =>
            new SpacesService(loop, memory, policyOf(options.memory), options.policySource),
          inject: [LoopClient, MemoryService],
        },
        {
          provide: DIGEST_LEDGER,
          useFactory: (em: EntityManager): DigestLedger => new MikroOrmDigestLedger(em),
          inject: [EntityManager],
        },
        {
          provide: DigestsService,
          useFactory: (
            loop: LoopClient,
            memory: MemoryService,
            ledger: DigestLedger,
            clock: Clock,
          ) => new DigestsService(loop, memory, ledger, clock),
          inject: [LoopClient, MemoryService, DIGEST_LEDGER, CLOCK],
        },
        {
          provide: MemorySweep,
          useFactory: (memory: MemoryService) =>
            new MemorySweep(memory, options.memory.sweep.everyMs),
          inject: [MemoryService],
        },
      ],
      controllers: [MemoryController, DigestsController],
    };
  }
}
