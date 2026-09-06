/**
 * The registry: one entry per declared pipeline. Adding a pipeline is a folder
 * beside `system-design` and one line here; the core never changes.
 */
import type { PipelineDefinition } from '../core/pipeline';
import { SYSTEM_DESIGN } from './system-design/definition';

const declared: PipelineDefinition<unknown>[] = [SYSTEM_DESIGN as PipelineDefinition<unknown>];

export const PIPELINES: ReadonlyMap<string, PipelineDefinition<unknown>> = new Map(
  declared.map((definition) => [definition.id, definition]),
);
