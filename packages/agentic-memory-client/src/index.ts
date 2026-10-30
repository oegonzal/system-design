/**
 * @sysdesign/agentic-memory-client — the memory host as one port for every
 * agent that keeps memories in a space, its HTTP adapter, the errors both
 * raise, and what an agent declares it needs of a space, checked once before
 * it starts. The in-process adapter a consumer's specs run on is the
 * `/testing` entry; this barrel reaches contracts alone.
 */
export {
  MemoryClient,
  type ConsolidateRequest,
  type DigestRequest,
  type HistoryRequest,
  type InvalidateRequest,
  type RecallRequest,
  type RememberRequest,
  type UpdateRequest,
} from './memory-client';
export {
  MemoryHostRefused,
  MemoryHostTimeout,
  MemoryHostUnreachable,
  SpaceNotCompiled,
} from './memory-errors';
export { HttpMemoryClient, type HttpMemoryOptions } from './http-memory-client';
export {
  bindMemorySpace,
  bindSpace,
  MemoryBindingRefused,
  memoryBindingSchema,
  type BoundSpace,
  type MemoryBinding,
  type SpaceNeeds,
} from './binding';
