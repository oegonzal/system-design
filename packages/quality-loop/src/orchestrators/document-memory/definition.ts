/**
 * The document-memory orchestrator: digest one chunk of a document about a
 * person into facts about them, store what the digest endorsed. Two steps
 * over one registered pipeline, declared here as data; the adapters beside
 * it are the only code. It chooses its own pipeline, so a request naming one
 * is refused by the service; a goal that is not a rendered document chunk, or
 * one declaring every memory bound to a unit of work while naming no unit, is
 * refused here, before a row exists. A provided artifact is not refused: a
 * digest handed in is a cheaper way to teach the store, and the digest step
 * judges it as it would its own.
 */
import {
  DOCUMENT_MEMORY_ORCHESTRATOR_ID,
  DOCUMENT_MEMORY_STEP_REASONS,
  documentDigestReportSchema,
  isUnitBound,
  memoryContextSchema,
  type MemoryContextDto,
  type StartOrchestrationRequest,
} from '@sysdesign/contracts';

import { DOCUMENT_DIGEST_ID, readIndex } from '../../pipelines/document-digest/input';
import type { OrchestratorDefinition } from '../runner/definition';
import type { DocumentMemoryPorts } from './ports';
import { digest, store, type DocumentMemoryOutputs } from './steps';

/**
 * A goal this orchestrator will not digest: one no document composer
 * rendered, and one whose document declares every memory bound to a unit of
 * work yet names no unit — no search would ever read one of its memories.
 */
export const refuseNonDocument = (request: StartOrchestrationRequest): string | null => {
  const index = readIndex(request.goal);
  if (index === null) {
    return `${DOCUMENT_MEMORY_ORCHESTRATOR_ID} digests a rendered document chunk: the goal carries no ${DOCUMENT_DIGEST_ID} index`;
  }
  return isUnitBound(index.document.scope) && index.document.unitKey === undefined
    ? `${DOCUMENT_MEMORY_ORCHESTRATOR_ID} stores a memory bound to a unit of work for the unit its document names: the document declares every memory bound to one and names none`
    : null;
};

export const DOCUMENT_MEMORY: OrchestratorDefinition<DocumentMemoryOutputs, DocumentMemoryPorts> = {
  id: DOCUMENT_MEMORY_ORCHESTRATOR_ID,
  version: '1.0.0',
  description:
    'Digest one chunk of a document about a person into facts about them, and store what the digest endorsed.',
  takesTarget: false,
  reasons: DOCUMENT_MEMORY_STEP_REASONS,
  refuse: refuseNonDocument,
  context: async (ports) =>
    ({ embedding: ports.embedding, store: await ports.store.verify() }) satisfies MemoryContextDto,
  contextSchema: memoryContextSchema,
  reports: { digest: documentDigestReportSchema },

  steps: [
    { id: 'digest', pipeline: DOCUMENT_DIGEST_ID, run: digest },
    { id: 'store', needs: ['digest'], run: store },
  ],
};
