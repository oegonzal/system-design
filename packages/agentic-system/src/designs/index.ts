/**
 * The design cycle's door: the module the composition root mounts, the service
 * it exports, the ports and types a spec binds, and the settings schema the
 * service's own settings are read against. No other layer reaches into the
 * cycle's files except here.
 */
export { DesignsModule, type DesignsModuleOptions } from './designs.module';
export { DesignsService } from './designs.service';
export {
  DesignsController,
  startDesignSchema,
  type StartDesignRequest,
} from './designs.controller';
export { MemoryDesignDriver, type Coached } from './driver';
export { CYCLE_STORE, EVENT_SINK, type CycleStore, type DesignEventSink } from './ports';
export {
  cycleDto,
  type CyclePatch,
  type MemoryDesignCycle,
  type MemoryDesignCycleDto,
  type MemoryDesignCycleStatus,
} from './cycle';
export { InMemoryCycleStore } from './persistence/in-memory-cycle-store';
export { designSettingsSchema, type DesignSettings } from './settings';
