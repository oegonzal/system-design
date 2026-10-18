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
      'A cycle coaches a memory strategy on the loop from its brief and hands the finished run to the memory-design orchestrator to learn from; it is coached only once the coach run completed and stored only once the orchestration has stored its lessons, and a run or orchestration that ends any other way fails the cycle with how it ended, recorded on the row, ending nothing else.',
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
  {
    id: 'AGS-9',
    statement:
      'A digest is refused before any model call wherever its writes would be refused — an unknown space, one that no longer compiles, a scope the space does not declare — and when no register is left for it to write or its goal is past the engine’s budget; otherwise it starts one register-memory orchestration on a goal composed from the space’s write brief alone, under the declared iteration budget, and answers 202 with its id.',
  },
  {
    id: 'AGS-10',
    statement:
      'A digest is read and remembered from the loop’s own record, never recomputed: its report is read with the contract the step wrote it by and answered as read; only the memories it endorsed are written, in report order, through the runtime’s write path under the scope and provenance its goal’s index carries, each answered with its outcome or its refusal, and a withheld memory never; a running digest answers 409, one without a readable report 422, another space’s or another orchestrator’s 404, and a refusal of the whole apply aborts it with nothing recorded.',
  },
  {
    id: 'AGS-11',
    statement:
      'A digest is applied once: each apply is recorded with every item’s outcome, identically in Postgres and in memory, and a second apply — or one that loses the race to record — answers 409.',
  },
];
