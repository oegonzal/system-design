import { Module } from '@nestjs/common';

import {
  DOCUMENT_MEMORY_ORCHESTRATOR_ID,
  FORM_MEMORY_ORCHESTRATOR_ID,
  KNOWLEDGE_ORCHESTRATOR_ID,
  MEMORY_ORCHESTRATOR_ID,
  ROUTER_ORCHESTRATOR_ID,
} from '@sysdesign/contracts';

import { ORCHESTRATORS } from '../../orchestrators';
import type { KnowledgePorts } from '../../orchestrators/knowledge/ports';
import type { MemoryPorts } from '../../orchestrators/memory/ports';
import type { RouterPorts } from '../../orchestrators/router/ports';
import { JanitorModule } from '../janitor/janitor.module';
import { MemoryModule } from '../memory/memory.module';
import { KNOWLEDGE_PORTS, MEMORY_PORTS } from '../memory/tokens';
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
 * The runner, the record and every registered orchestrator bound to its
 * ports. A definition is data in `orchestrators/`; the ports are adapters
 * owned by the module that built them, so the binding — and only the binding
 * — lives here. An orchestrator that declares ports gets them by id; one that
 * declares none, like the two panels, is bound to nothing. The form and
 * document memory orchestrators declare a subset of the memory ports and are
 * bound to the same object, so one store and one embedding client serve all
 * three; the knowledge orchestrator adds the support store to that same set.
 */
@Module({
  imports: [RunsModule, OrchestrationRecordModule, MemoryModule, RouterModule, JanitorModule],
  controllers: [OrchestrationController],
  providers: [
    OrchestrationService,
    {
      provide: ORCHESTRATOR_HOSTS,
      useFactory: (
        memory: MemoryPorts,
        router: RouterPorts,
        knowledge: KnowledgePorts,
      ): ReadonlyMap<string, OrchestratorHost> => {
        const ports = new Map<string, unknown>([
          [MEMORY_ORCHESTRATOR_ID, memory],
          [FORM_MEMORY_ORCHESTRATOR_ID, memory],
          [DOCUMENT_MEMORY_ORCHESTRATOR_ID, memory],
          [ROUTER_ORCHESTRATOR_ID, router],
          [KNOWLEDGE_ORCHESTRATOR_ID, knowledge],
        ]);
        return new Map(
          [...ORCHESTRATORS.values()].map((definition) => [
            definition.id,
            host(definition, ports.get(definition.id)),
          ]),
        );
      },
      inject: [MEMORY_PORTS, ROUTER_PORTS, KNOWLEDGE_PORTS],
    },
  ],
})
export class OrchestrationModule {}
