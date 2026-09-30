/**
 * The registry: one entry per declared pipeline. Adding a pipeline is a folder
 * beside `system-design` and one line here; the core never changes.
 */
import type { PipelineDefinition } from '../core/pipeline';
import { AGENTIC_DESIGN } from './agentic-design/definition';
import { DESIGN_PROMPT } from './design-prompt/definition';
import { EXPERIENCE_DIGEST } from './experience-digest/definition';
import { MEMORY_RECALL } from './memory-recall/definition';
import { SYSTEM_DESIGN } from './system-design/definition';
import { SYSTEM_DESIGN_CANVAS } from './system-design-canvas/definition';

const declared: PipelineDefinition<unknown>[] = [
  SYSTEM_DESIGN as PipelineDefinition<unknown>,
  AGENTIC_DESIGN as PipelineDefinition<unknown>,
  MEMORY_RECALL as PipelineDefinition<unknown>,
  EXPERIENCE_DIGEST as PipelineDefinition<unknown>,
  SYSTEM_DESIGN_CANVAS as PipelineDefinition<unknown>,
  DESIGN_PROMPT as PipelineDefinition<unknown>,
];

export const PIPELINES: ReadonlyMap<string, PipelineDefinition<unknown>> = new Map(
  declared.map((definition) => [definition.id, definition]),
);
