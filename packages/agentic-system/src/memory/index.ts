/**
 * The memory spaces' door: the module the composition root mounts, the token a
 * spec binds its own vector index to, and the settings schema the service's
 * own settings are read against. No other layer reaches into the memory
 * layer's files except here.
 */
export { MemoryModule, VECTOR_INDEX } from './memory.module';
export { memorySettingsSchema, type MemorySettings } from './settings';
