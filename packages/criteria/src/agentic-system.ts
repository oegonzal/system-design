import type { Criterion } from './criterion';

/** The agentic-system service (packages/agentic-system): the memory-design cycle, its catalog and its bus, and the memory spaces it serves. */
export const AGENTIC_SYSTEM_CRITERIA: readonly Criterion[] = [
  {
    id: 'AGS-1',
    statement:
      'The memory-stack catalog is declared data: every component has a unique id, a declared layer and well-formed operations, and every memory type a strategy can keep has at least one store that serves it.',
  },
  {
    id: 'AGS-2',
    statement:
      'A cycle store inserts, finds and merges a patch into a standing cycle, in memory and against the real table, and a caller that mutates what it read never changes the stored row.',
  },
  {
    id: 'AGS-3',
    statement:
      'A cycle coaches a memory strategy on the loop from its brief, hands the finished run to the memory-design orchestrator to learn from, and ends stored; any failure is recorded on the row and ends nothing else.',
  },
  {
    id: 'AGS-4',
    statement:
      'POST /designs starts a cycle from a brief and answers at once with the running row, the work continuing off the request path; GET /designs/:id reads it back; an unknown cycle is a 404 and a request with no goal a 400.',
  },
  {
    id: 'AGS-5',
    statement:
      'Every variable the service reads is declared once with its default and read nowhere else — QDRANT_URL among them, and the embedding client built in that same read by the llm package’s own factory, disabled without a key — and the design and memory settings come from the package config, the memory policy beside its sweep schedule and named by the choice it was read under, a root whose engine.json leaves either kind unchosen refused at boot by name.',
  },
  {
    id: 'AGS-6',
    statement:
      'Every file is held to its folder’s declared import doors, and each door refuses an import past it.',
  },
  {
    id: 'AGS-7',
    statement:
      'Each cycle transition is recorded on its design topic and pushed as a matching person-facing prompt about that cycle; a failed cycle carries neither.',
  },
  {
    id: 'AGS-8',
    statement:
      'POST /spaces compiles a space from a settled run’s best strategy and answers its report — an unknown run 404, a running one 409, one with no strategy or one that does not compile 422 naming why — and every memory verb is served with one declared status per refusal.',
  },
];
