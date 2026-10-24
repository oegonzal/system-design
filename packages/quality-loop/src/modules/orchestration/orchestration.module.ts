import { Module } from '@nestjs/common';

import { ORCHESTRATORS } from '../../orchestrators';
import { KNOWLEDGE_PORT_BUNDLE, type KnowledgePorts } from '../../orchestrators/knowledge/ports';
import { MEMORY_PORT_BUNDLE, type MemoryPorts } from '../../orchestrators/memory/ports';
import { ROUTER_PORT_BUNDLE, type RouterPorts } from '../../orchestrators/router/ports';
import { JanitorModule } from '../janitor/janitor.module';
import { MemoryModule } from '../memory/memory.module';
import { KNOWLEDGE_PORTS, MEMORY_PORTS } from '../memory/tokens';
import { RouterModule } from '../router/router.module';
import { ROUTER_PORTS } from '../router/tokens';
import { RunsModule } from '../runs/runs.module';
import { OrchestrationController } from './orchestration.controller';
import { OrchestrationRecordModule } from './orchestration-record.module';
import { OrchestrationService } from './orchestration.service';
import type { OrchestratorBinding } from './ports';
import { ORCHESTRATOR_BINDINGS } from './tokens';

/**
 * A definition bound to the bundle it declared, or a boot failure naming the
 * bundle nobody binds — an orchestrator must never start with its ports absent.
 */
const bind = (
  definition: OrchestratorBinding['definition'],
  bundles: Readonly<Record<string, unknown>>,
): OrchestratorBinding => {
  if (definition.ports === undefined) return { definition, ports: undefined };
  if (!(definition.ports in bundles)) {
    throw new Error(
      `orchestrator ${definition.id} runs over the "${definition.ports}" ports, which no module binds`,
    );
  }
  return { definition, ports: bundles[definition.ports] };
};

/**
 * The runner, the record and every registered orchestrator bound to its
 * ports. A definition is data in `orchestrators/`; the ports are adapters
 * owned by the module that built them, so the binding — and only the binding
 * — lives here. An orchestrator gets the bundle it declares by name; one that
 * declares none, like the two panels, is bound to nothing. The form and
 * document memory orchestrators declare a subset of the memory ports and are
 * bound to the same object, so one store and one embedding client serve all
 * three; the knowledge orchestrator adds the support store to that same set, and the
 * memory-design orchestrator (the memory-architecture learning cycle) shares
 * the knowledge ports.
 */
@Module({
  imports: [RunsModule, OrchestrationRecordModule, MemoryModule, RouterModule, JanitorModule],
  controllers: [OrchestrationController],
  providers: [
    OrchestrationService,
    {
      provide: ORCHESTRATOR_BINDINGS,
      useFactory: (
        memory: MemoryPorts,
        router: RouterPorts,
        knowledge: KnowledgePorts,
      ): ReadonlyMap<string, OrchestratorBinding> => {
        const bundles = {
          [MEMORY_PORT_BUNDLE]: memory,
          [ROUTER_PORT_BUNDLE]: router,
          [KNOWLEDGE_PORT_BUNDLE]: knowledge,
        };
        return new Map(
          [...ORCHESTRATORS.values()].map((definition) => [
            definition.id,
            bind(definition, bundles),
          ]),
        );
      },
      inject: [MEMORY_PORTS, ROUTER_PORTS, KNOWLEDGE_PORTS],
    },
  ],
})
export class OrchestrationModule {}
