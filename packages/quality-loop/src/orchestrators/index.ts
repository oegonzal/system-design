/**
 * The registry: one entry per declared orchestrator. Adding one is a folder
 * beside `memory` and one line here — plus the module that owns its ports
 * binding them, since ports are adapters and a definition is data.
 */
import type { OrchestratorDefinition } from './definition';
import { MEMORY } from './memory/definition';

type Erased = OrchestratorDefinition<Record<string, unknown>, unknown>;

const declared: Erased[] = [MEMORY as unknown as Erased];

export const ORCHESTRATORS: ReadonlyMap<string, Erased> = new Map(
  declared.map((definition) => [definition.id, definition]),
);
