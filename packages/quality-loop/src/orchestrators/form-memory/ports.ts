/**
 * The ports the form-memory orchestrator runs over: the memory orchestrator's
 * embeddings and store, bound to the same adapters by the orchestration
 * module. No probe deriver — a form's own field labels are the probes, so a
 * recall here costs no model call — and no model of its own: the answerer is
 * a registered pipeline.
 */
import type { MemoryPorts } from '../memory/ports';

export type FormMemoryPorts = Pick<MemoryPorts, 'embedding' | 'embeddings' | 'store'>;
