import { basename } from 'node:path';

import type {
  ExperienceProfileDto,
  OrchestrationRunDto,
  OrchestrationStepDto,
  RecordScope,
  StarStoryDto,
} from '@sysdesign/contracts';

import type {
  Clock,
  DocumentReader,
  DocumentWriter,
  IngestLedger,
  IngestSink,
  IngestSinkKind,
  ManifestEntry,
  PlannedChunk,
  PostingOutcome,
  StudioSource,
} from '../core/ports';

/**
 * The ports as fakes, for the specs: a ledger in memory, a reader that
 * answers from a script, a clock that does not move, and a sink that answers
 * each post from a queue. Test code only — this folder is outside the app
 * build (`tsconfig.app.json`) and nothing reachable from `main.ts` imports it.
 * The shared fake loop behind the shipping loop sink is `fake-ingest-loop.ts`;
 * the scripted memory host behind the shipping space sink is
 * `fake-memory-client.ts`.
 */

/** The loop every fake posting is recorded under — the one the fakes and the harnesses are configured for. */
export const LOOP_URL = 'http://loop.test';
/** The memory host a space posting is recorded under. */
export const MEMORY_URL = 'http://memory.test';
export const SPACE_ID = '0f2a1c4e-6b7d-4e8f-9a0b-1c2d3e4f5a6b';
/** The scope the space postings of these specs write under: the north tenant's partition. */
export const NORTH: RecordScope = { tenant: 'north' };
/** The loop's store, as a command configured for it identifies postings. */
export const LOOP_STORE = { kind: 'loop', spaceId: null, scope: null } as const;
/** The space under the north tenant, as a command configured for it identifies postings. */
export const SPACE_STORE = { kind: 'space', spaceId: SPACE_ID, scope: NORTH } as const;

/**
 * The ledger in memory. Loading and saving copy, as a file does, so `entries`
 * is only ever what was saved: a mark the code made and never saved is not
 * there for a spec to find.
 */
export class InMemoryLedger implements IngestLedger {
  readonly path = 'memory/manifest.json';
  entries: ManifestEntry[];
  saves = 0;
  /** Whether a command holds the ledger now; a spec sets it to stand for another command. */
  held = false;

  constructor(entries: readonly ManifestEntry[] = []) {
    this.entries = structuredClone([...entries]);
  }

  async load(): Promise<readonly ManifestEntry[]> {
    return structuredClone(this.entries);
  }

  async save(entries: readonly ManifestEntry[]): Promise<void> {
    this.saves += 1;
    this.entries = structuredClone([...entries]);
  }

  async lock(): Promise<() => Promise<void>> {
    if (this.held) throw new Error(`${this.path} is held by another command`);
    this.held = true;
    return async () => {
      this.held = false;
    };
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

/** A step complete with nothing to say but its counts. */
const completeStep = (counts: Record<string, number>) => ({
  status: 'complete' as const,
  reason: null,
  note: null,
  counts,
});

/** A posting as the manifest records one: through the loop, its facts stored and standing, unless the overrides say otherwise. */
export const manifestEntry = (overrides: Partial<ManifestEntry> = {}): ManifestEntry => ({
  chunkHash: 'a'.repeat(64),
  document: 'notes.md',
  chunk: { index: 1, of: 1 },
  kind: 'notes',
  sink: 'loop',
  host: LOOP_URL,
  spaceId: null,
  scope: null,
  orchestrationRunId: 'orch-1',
  digestRunId: 'digest-run-1',
  recordIds: [],
  status: 'complete',
  steps: {
    digest: completeStep({ memories: 3, kept: 3 }),
    store: completeStep({ chunks: 3, embedded: 3 }),
  },
  error: null,
  ingestedAt: FIXED_NOW,
  retractedAt: null,
  retractedPoints: null,
  ...overrides,
});

/** A posting's outcome as the loop reports a settled, stored chunk: both steps complete under digest run `digest-run-1`. */
export const settledOutcome = (overrides: Partial<PostingOutcome> = {}): PostingOutcome => ({
  orchestrationRunId: 'orch-1',
  status: 'complete',
  digestRunId: 'digest-run-1',
  steps: {
    digest: completeStep({ memories: 3, kept: 3 }),
    store: completeStep({ chunks: 3, embedded: 3 }),
  },
  error: null,
  recordIds: [],
  ...overrides,
});

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

/** Both loop steps complete — the digest run kept three facts and the store took them. */
export const storedSteps = (
  digestRunId = 'digest-run-1',
): Record<string, OrchestrationStepDto> => ({
  digest: stepOf({ runIds: [digestRunId], counts: { memories: 3, kept: 3 } }),
  store: stepOf({ counts: { chunks: 3, embedded: 3 } }),
});

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
    acceptAt: null,
    adoptedFrom: null,
    maxIterations: 2,
    samples: null,
  },
  openedBy: null,
  context: {},
  steps: storedSteps(),
  error: null,
  ...overrides,
});

/** Where a scripted sink stands for: the loop unless a spec says a space, under a scope. */
interface ScriptedSinkOrigin {
  kind: IngestSinkKind;
  host: string;
  spaceId: string | null;
  scope: RecordScope | null;
}

/** A sink that answers each post from a queue — a settled outcome, or an error to throw. */
export class ScriptedSink implements IngestSink {
  readonly kind: IngestSinkKind;
  readonly host: string;
  readonly spaceId: string | null;
  readonly scope: RecordScope | null;
  readonly posted: PlannedChunk[] = [];
  /** The records each retraction was told to keep, in order — what another standing posting lists too. */
  readonly kept: string[][] = [];
  /** What `status` answers, by run id: whatever was posted, and whatever a spec sets. */
  readonly records = new Map<string, PostingOutcome>();
  /** Memories the store holds by digest run, as a spec sets them; a retraction removes a run's once. */
  readonly points = new Map<string, number>();
  /** Retractions that fail, by digest run: each throws its error and removes nothing. */
  readonly failingRetractions = new Map<string, Error>();
  /** Digest runs retracted, in order. */
  readonly retracted: string[] = [];

  constructor(
    private readonly outcomes: (PostingOutcome | Error)[] = [],
    origin: ScriptedSinkOrigin = { kind: 'loop', host: LOOP_URL, spaceId: null, scope: null },
  ) {
    this.kind = origin.kind;
    this.host = origin.host;
    this.spaceId = origin.spaceId;
    this.scope = origin.scope;
  }

  async post(planned: PlannedChunk): Promise<PostingOutcome> {
    this.posted.push(planned);
    const next = this.outcomes.shift() ?? settledOutcome();
    if (next instanceof Error) throw next;
    this.records.set(next.orchestrationRunId, next);
    return next;
  }

  async status(entry: ManifestEntry): Promise<PostingOutcome | null> {
    return entry.orchestrationRunId === null
      ? null
      : (this.records.get(entry.orchestrationRunId) ?? null);
  }

  retract(entry: ManifestEntry, keep: ReadonlySet<string>): Promise<number> {
    if (entry.digestRunId === null) return Promise.resolve(0);
    const failure = this.failingRetractions.get(entry.digestRunId);
    if (failure !== undefined) return Promise.reject(failure);
    this.retracted.push(entry.digestRunId);
    this.kept.push([...keep].sort());
    const removed = this.points.get(entry.digestRunId) ?? 0;
    this.points.delete(entry.digestRunId);
    return Promise.resolve(removed);
  }
}

/** The studio's lists as a spec gives them. */
export class ScriptedStudio implements StudioSource {
  constructor(
    private readonly profiles: readonly ExperienceProfileDto[] = [],
    private readonly starStories: readonly StarStoryDto[] = [],
  ) {}

  async experiences(): Promise<readonly ExperienceProfileDto[]> {
    return this.profiles;
  }

  async stories(): Promise<readonly StarStoryDto[]> {
    return this.starStories;
  }
}

/** Documents written, by path, and every path asked to be removed, in order. */
export class InMemoryWriter implements DocumentWriter {
  readonly written = new Map<string, string>();
  readonly removed: string[] = [];

  async write(path: string, text: string): Promise<void> {
    this.written.set(path, text);
  }

  async remove(path: string): Promise<boolean> {
    this.removed.push(path);
    return this.written.delete(path);
  }
}

export const sampleExperience = (
  overrides: Partial<ExperienceProfileDto> = {},
): ExperienceProfileDto => ({
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'ledger-platform',
  origin: 'own',
  companyLabel: 'Acme',
  title: 'Senior Engineer',
  summary: 'Built the ledger platform.',
  techStack: ['TypeScript', 'Postgres'],
  highlights: ['Cut settlement latency by half.', 'Led a team of four.'],
  practiceHighlights: [],
  createdAt: FIXED_NOW,
  ...overrides,
});

export const sampleStory = (overrides: Partial<StarStoryDto> = {}): StarStoryDto => ({
  id: '22222222-2222-4222-8222-222222222222',
  title: 'The settlement backlog',
  situation: 'Settlements queued for hours at month end.',
  task: 'Bring the backlog under an hour without a rewrite.',
  action: 'Partitioned the queue by account and added a drain worker.',
  result: 'Month-end settlement finished in forty minutes.',
  tags: ['queues', 'postgres'],
  promptId: null,
  experienceId: null,
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
  ...overrides,
});
