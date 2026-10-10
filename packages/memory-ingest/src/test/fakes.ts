import { basename } from 'node:path';

import type { OrchestrationRunDto, OrchestrationStepDto } from '@sysdesign/contracts';

import type {
  Clock,
  DocumentReader,
  IngestLedger,
  IngestSink,
  ManifestEntry,
  PlannedChunk,
} from '../core/ports';

/**
 * The ports as fakes, for the specs: a ledger in memory, a reader that
 * answers from a script, a clock that does not move, and a sink that answers
 * each post from a queue. Test code only — this folder is outside the app
 * build (`tsconfig.app.json`) and nothing reachable from `main.ts` imports it.
 * The shared fake loop behind the shipping sink is `fake-ingest-loop.ts`.
 */
export class InMemoryLedger implements IngestLedger {
  entries: ManifestEntry[] = [];
  saves = 0;

  constructor(entries: readonly ManifestEntry[] = []) {
    this.entries = [...entries];
  }

  async load(): Promise<readonly ManifestEntry[]> {
    return [...this.entries];
  }

  async save(entries: readonly ManifestEntry[]): Promise<void> {
    this.saves += 1;
    this.entries = [...entries];
  }
}

/** Documents by basename (or by the exact path); a path the script lacks reads as the filesystem would say. */
export const scriptedReader = (documents: Readonly<Record<string, string>>): DocumentReader => ({
  async read(path: string): Promise<string> {
    const text = documents[path] ?? documents[basename(path)];
    if (text === undefined) {
      throw Object.assign(new Error(`ENOENT: no such file, open '${path}'`), { code: 'ENOENT' });
    }
    return text;
  },
});

export const FIXED_NOW = '2026-10-02T12:00:00.000Z';
export const fixedClock = (at: string = FIXED_NOW): Clock => ({ now: () => at });

/** A step as the loop records one, complete unless the overrides say otherwise. */
export const stepOf = (overrides: Partial<OrchestrationStepDto> = {}): OrchestrationStepDto => ({
  status: 'complete',
  reason: null,
  runIds: [],
  note: null,
  counts: {},
  report: null,
  startedAt: FIXED_NOW,
  finishedAt: FIXED_NOW,
  ...overrides,
});

/** Both steps complete — the digest kept three facts and the store took them. */
export const STORED_STEPS: Record<string, OrchestrationStepDto> = {
  digest: stepOf({ runIds: ['digest-run-1'], counts: { memories: 3, kept: 3 } }),
  store: stepOf({ counts: { chunks: 3, embedded: 3 } }),
};

/** A settled orchestration as the loop would record one: complete with its facts stored, unless overridden. */
export const settledOrchestration = (
  overrides: Partial<OrchestrationRunDto> = {},
): OrchestrationRunDto => ({
  orchestrationRunId: 'orch-1',
  orchestrator: 'document-memory',
  pipeline: null,
  status: 'complete',
  startedAt: FIXED_NOW,
  finishedAt: FIXED_NOW,
  request: {
    goal: '',
    outputProvided: false,
    criteriaProvided: false,
    adoptedFrom: null,
    maxIterations: 2,
    samples: null,
  },
  openedBy: null,
  context: {},
  steps: STORED_STEPS,
  error: null,
  ...overrides,
});

/** A sink that answers each post from a queue — a settled record, or an error to throw. */
export class ScriptedSink implements IngestSink {
  readonly posted: PlannedChunk[] = [];
  readonly records = new Map<string, OrchestrationRunDto>();

  constructor(private readonly outcomes: (OrchestrationRunDto | Error)[] = []) {}

  async post(planned: PlannedChunk): Promise<OrchestrationRunDto> {
    this.posted.push(planned);
    const next = this.outcomes.shift() ?? settledOrchestration();
    if (next instanceof Error) throw next;
    this.records.set(next.orchestrationRunId, next);
    return next;
  }

  async status(orchestrationRunId: string): Promise<OrchestrationRunDto | null> {
    return this.records.get(orchestrationRunId) ?? null;
  }
}
