/**
 * The registry: one entry per declared pipeline. Adding a pipeline is a folder
 * beside `system-design` and one line here; the core never changes.
 */
import type { PipelineDefinition } from '../core/pipeline';
import { AGENTIC_DESIGN } from './agentic-design/definition';
import { ANSWER_SUGGESTIONS } from './answer-suggestions/definition';
import { BROWSER_STEP } from './browser-step/definition';
import { DESIGN_PROMPT } from './design-prompt/definition';
import { DOCUMENT_DIGEST } from './document-digest/definition';
import { EXPERIENCE_DIGEST } from './experience-digest/definition';
import { FIELD_ANSWER } from './field-answer/definition';
import { KNOWLEDGE_DIGEST } from './knowledge-digest/definition';
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
  BROWSER_STEP as PipelineDefinition<unknown>,
  FIELD_ANSWER as PipelineDefinition<unknown>,
  ANSWER_SUGGESTIONS as PipelineDefinition<unknown>,
  DOCUMENT_DIGEST as PipelineDefinition<unknown>,
  KNOWLEDGE_DIGEST as PipelineDefinition<unknown>,
];

export const PIPELINES: ReadonlyMap<string, PipelineDefinition<unknown>> = new Map(
  declared.map((definition) => [definition.id, definition]),
);
