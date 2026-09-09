import { Module } from '@nestjs/common';

import { MEMORY } from '../../orchestrators/memory/definition';
import type { MemoryPorts } from '../../orchestrators/memory/steps';
import { MemoryModule } from '../memory/memory.module';
import { MEMORY_PORTS } from '../memory/tokens';
import { RunsModule } from '../runs/runs.module';
import { OrchestrationController } from './orchestration.controller';
import { OrchestrationRecordModule } from './orchestration-record.module';
import { OrchestrationService } from './orchestration.service';
import type { OrchestratorHost } from './ports';
import { ORCHESTRATOR_HOSTS } from './tokens';

/**
 * The runner, the record and every orchestrator bound to its ports. A
 * definition is data in `orchestrators/`; the ports are adapters owned by the
 * module that built them, so the binding — and only the binding — lives here.
 * Adding an orchestrator is one entry in this map and its module's ports.
 */
@Module({
  imports: [RunsModule, OrchestrationRecordModule, MemoryModule],
  controllers: [OrchestrationController],
  providers: [
    OrchestrationService,
    {
      provide: ORCHESTRATOR_HOSTS,
      useFactory: (memory: MemoryPorts): ReadonlyMap<string, OrchestratorHost> =>
        new Map<string, OrchestratorHost>([
          [MEMORY.id, { definition: MEMORY, ports: memory } as unknown as OrchestratorHost],
        ]),
      inject: [MEMORY_PORTS],
    },
  ],
})
export class OrchestrationModule {}
