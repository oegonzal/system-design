import type { Criterion } from './criterion';

/** The agentic-memory runtime (packages/agentic-memory): a memory strategy executed over Postgres and a vector projection. */
export const AGENTIC_MEMORY_CRITERIA: readonly Criterion[] = [
  {
    id: 'AGM-1',
    statement:
      'A space compiles from a strategy’s typed declarations and a policy alone: the same declarations compile to the same space whatever the prose says and in any order; a broken reference, a kind with no behavior, or a strategy that does not read creates no space; and metadata that is not a field, a register nothing can write, read or forget, an operation with no effect, and a consolidation route that is missing or ambiguous are warnings naming the register, from the one analysis the design pipeline also runs.',
  },
  {
    id: 'AGM-2',
    statement:
      'Each memory kind is declared data — its candidate, identity, exact keys, valid-time field, text, projection and consolidation role — and a behavior added or replaced changes the runtime without an engine edit.',
  },
  {
    id: 'AGM-3',
    statement:
      'A write is refused unless its register declares the verb, its scope names the partition with declared keys only, its candidate parses and its metadata is declared; an accepted remember inserts, leaves a record that says the same unchanged, or supersedes the current one in one transaction, its history kept; an episode appends, the same one from another run being more evidence; at most one current record stands per identity and exact scope, even under concurrent writes; and a short-term record expires after its term’s time to live.',
  },
  {
    id: 'AGM-4',
    statement:
      'An update supersedes only an addressed, current, visible record with the same identity, and an invalidation closes one with its reason and removes its point; neither reaches a record outside the caller’s scope, which answers as not found.',
  },
  {
    id: 'AGM-5',
    statement:
      'Postgres is the truth: a record whose projection failed is still found by exact and temporal recall and is projected by the next sweep, and an index hit is returned only while Postgres holds its record current, unexpired and visible — a stale one is dropped and counted.',
  },
  {
    id: 'AGM-6',
    statement:
      'A recall routes by what it declares — a key exactly, a text by meaning, a time range alone temporally — with scope, time and metadata filtering every route; results merge by record, rank by the declared weights with a deterministic tie-break, fill the declared budget in rank order, and come back cited with their factors; a route that cannot run says why.',
  },
  {
    id: 'AGM-7',
    statement:
      'A memory is visible only to a request whose scope contains its own — a tenant’s to its users, a user’s to that user alone — identically in the record store and in the vector filter.',
  },
  {
    id: 'AGM-8',
    statement:
      'Consolidation is a deterministic function of the verified episodes in scope: groups by exact scope and declared lesson key, support counted in distinct source runs, lessons citing their episodes and reinforced or withdrawn as the evidence moves, playbooks holding every qualifying lesson and versioned only when those rules change; a repeat pass changes nothing, and scopes never merge.',
  },
  {
    id: 'AGM-9',
    statement:
      'The sweep expires short-term records by the clock it is handed, removes the points of records that closed, and projects every current record not in the current collection, so a failed write is projected later and a new embedding model fills a new collection.',
  },
  {
    id: 'AGM-10',
    statement:
      'The Postgres record and space stores and the Qdrant index honour the same contract as the in-memory fakes the runtime’s specs run on.',
  },
];
