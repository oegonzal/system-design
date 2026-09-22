import { Module } from '@nestjs/common';

import { CALIBRATION } from '../../orchestrators/calibration/definition';
import { MEMORY } from '../../orchestrators/memory/definition';
import type { MemoryPorts } from '../../orchestrators/memory/steps';
import { ROUTER } from '../../orchestrators/router/definition';
import type { RouterPorts } from '../../orchestrators/router/steps';
import { SECOND_OPINION } from '../../orchestrators/second-opinion/definition';
import { MemoryModule } from '../memory/memory.module';
import { MEMORY_PORTS } from '../memory/tokens';
import { RouterModule } from '../router/router.module';
import { ROUTER_PORTS } from '../router/tokens';
import { RunsModule } from '../runs/runs.module';
import { OrchestrationController } from './orchestration.controller';
import { OrchestrationRecordModule } from './orchestration-record.module';
import { OrchestrationService } from './orchestration.service';
import type { OrchestratorHost } from './ports';
import { ORCHESTRATOR_HOSTS } from './tokens';

const host = (definition: unknown, ports: unknown): OrchestratorHost =>
  ({ definition, ports }) as OrchestratorHost;

/**
 * The runner, the record and every orchestrator bound to its ports. A
 * definition is data in `orchestrators/`; the ports are adapters owned by the
 * module that built them, so the binding — and only the binding — lives here.
 * Adding an orchestrator is one entry in this map and its module's ports; the
 * two panel orchestrators need none, since every step of theirs runs a
 * registered pipeline or reads what one produced.
 */
@Module({
  imports: [RunsModule, OrchestrationRecordModule, MemoryModule, RouterModule],
  controllers: [OrchestrationController],
  providers: [
    OrchestrationService,
    {
      provide: ORCHESTRATOR_HOSTS,
      useFactory: (
        memory: MemoryPorts,
        router: RouterPorts,
      ): ReadonlyMap<string, OrchestratorHost> =>
        new Map<string, OrchestratorHost>([
          [MEMORY.id, host(MEMORY, memory)],
          [CALIBRATION.id, host(CALIBRATION, undefined)],
          [SECOND_OPINION.id, host(SECOND_OPINION, undefined)],
          [ROUTER.id, host(ROUTER, router)],
        ]),
      inject: [MEMORY_PORTS, ROUTER_PORTS],
    },
  ],
})
export class OrchestrationModule {}
