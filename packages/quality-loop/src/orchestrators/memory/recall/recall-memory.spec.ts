import type { MemoryLineageDto, QualityRunDto } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { toRunDto } from '../../../core/contracts';
import { confirmed, evidence, ledger, traceOf } from '../../../core/testing';
import {
  KNOWN_HEADING,
  MAX_CANDIDATES,
  NOVELTY_RULE,
  readIndex,
  renderGoal as renderQuery,
} from '../../../pipelines/memory-recall/input';
import { InMemoryMemoryStore, vectorOf } from '../../../modules/memory/testing';
import {
  contentHash,
  type EvidenceRef,
  type MemoryPorts,
  type MemoryProbe,
  type QueryProbes,
  type StoredChunk,
} from '../ports';
import { childRun, memoryContext, memoryPorts } from '../steps.testing';
import { ACCEPT_AT, acceptedRecall, builtQuery, GOAL } from '../testing';
import { focusLines, focusOf } from './focus';
import { fuse } from './fusion';
import type { RecallKnown } from './known';
import { probeSet, probesOf, queryText } from './query';
import { recallMemory } from './recall-memory';

/** The adopted iteration's defect the recall should find a lesson for. */
const DEFECT = confirmed({
  key: 'unhandled_failure|node.3',
  type: 'unhandled_failure',
  severity: 'high',
  rationale: 'No fallback is described for a cache outage on the redirect path.',
});

const focus = () => {
  const [iteration] = traceOf({
    ledger: ledger({
      findings: [DEFECT],
      criteria: [evidence({ criterionId: 'c1', result: 'fail' })],
    }),
  }).iterations;
  return focusOf({
    runId: 'run-adopted',
    pipeline: 'system-design-canvas',
    adoptedFrom: null,
    iteration,
    criteria: [{ id: 'c1', kind: 'functional', statement: 'Redirect within 50 ms at p99.' }],
  });
};

/** A stored lesson, indexed under the texts given — the fake embeds equal texts equally. */
const lesson = (
  text: string,
  condition: string,
  lessonKey: string,
  runId: string,
): StoredChunk => ({
  text,
  keys: { condition, lesson: lessonKey },
  contentHash: contentHash(text),
  source: {
    runId,
    pipeline: 'system-design-canvas',
    kind: 'lesson',
    ref: 'memory.1',
    decision: 'revise',
    iteration: 2,
    when: '2026-10-02',
  },
  evidence: [],
  digestRunId: null,
  lineage: null,
  model: 'fake-embedding',
  vectors: { condition: vectorOf(condition), lesson: vectorOf(lessonKey) },
});

/**
 * A store where the goal alone fills every candidate slot: more lessons than
 * a recall takes, each indexed under the goal itself, and one lesson indexed
 * under the adopted iteration's defect — which a search for the goal ranks
 * below all of them.
 */
async function crowdedStore(defectLine: string): Promise<InMemoryMemoryStore> {
  const store = new InMemoryMemoryStore();
  const crowd = Array.from({ length: MAX_CANDIDATES + 4 }, (_, index) =>
    lesson(`An unrelated lesson about the prompt, number ${index}.`, GOAL, GOAL, `run-${index}`),
  );
  for (const chunk of crowd) await store.replaceRunChunks(chunk.source.runId, [chunk]);
  const fix = lesson(
    'Serve redirects from the database when the cache is down — applies when a cache fronts a hot read.',
    defectLine,
    defectLine,
    'run-lesson',
  );
  await store.replaceRunChunks('run-lesson', [fix]);
  return store;
}

const recallWith = async (ports: MemoryPorts, withFocus: boolean) => {
  const goals: string[] = [];
  const recalled = await recallMemory(ports, {
    goal: GOAL,
    store: memoryContext().store,
    acceptAt: ACCEPT_AT,
    execute: (input) => {
      goals.push(input.goal);
      return Promise.resolve(
        toRunDto(childRun('memory-recall', acceptedRecall())) as QualityRunDto,
      );
    },
    focus: withFocus ? focus() : null,
  });
  return { recalled, query: goals[0] ?? '' };
};

describe('a recall focused on the iteration a coach starts from', () => {
  it('[QL-34] searches the adopted iteration’s defects and hands them to the curator in their own section', async () => {
    const { recalled, query } = await recallWith(memoryPorts(), true);
    expect(recalled.status).toBe('complete');
    if (recalled.status === 'complete') {
      // The goal, then one probe per defect and criterion short of a pass.
      expect(recalled.counts.probes).toBe(1 + focusLines(focus()).length);
    }
    expect(query).toContain('## What is wrong now');
    for (const [position, line] of focusLines(focus()).entries()) {
      expect(query).toContain(`- [d${position + 1}] ${line}`);
    }
    expect(query).toContain(
      'unhandled failure (high): No fallback is described for a cache outage',
    );
    expect(query).toContain('c1 fail: Redirect within 50 ms at p99.');
  });

  it('[QL-34] a lesson matching an adopted defect is retrieved over an unrelated one the goal alone would rank first', async () => {
    const [defectLine] = focusLines(focus());
    const candidatesOf = async (withFocus: boolean) => {
      const store = await crowdedStore(defectLine ?? '');
      const { query } = await recallWith(memoryPorts({ store }), withFocus);
      return readIndex(query)?.candidates.map((candidate) => candidate.source.runId) ?? [];
    };

    const bare = await candidatesOf(false);
    expect(bare).toHaveLength(MAX_CANDIDATES);
    expect(bare).not.toContain('run-lesson');

    const focused = await candidatesOf(true);
    expect(focused).toHaveLength(MAX_CANDIDATES);
    expect(focused).toContain('run-lesson');
    // It took a slot one of the unrelated lessons held.
    expect(bare.filter((runId) => !focused.includes(runId))).toHaveLength(1);
  });

  it('[QL-34] with no focus it is the memory orchestrator’s recall over the goal alone', async () => {
    const { recalled, query } = await recallWith(memoryPorts(), false);
    expect(query).not.toContain('## What is wrong now');
    if (recalled.status === 'complete') expect(recalled.counts.probes).toBe(1);
  });

  it('[QL-34] hands the probe deriver the same defects, so its conditions reach for what is wrong now', async () => {
    const asked: (readonly string[] | undefined)[] = [];
    const probes: QueryProbes = {
      derive: (_goal, focus) => {
        asked.push(focus);
        return Promise.resolve([]);
      },
    };
    await recallWith(memoryPorts({ probes }), true);
    await recallWith(memoryPorts({ probes }), false);
    expect(asked).toEqual([focusLines(focus()), []]);
  });
});

/** The coach adopted `coach@2`, whose own run had adopted the grade's iteration 1. */
const KNOWN: RecallKnown = {
  pipeline: 'system-design-canvas',
  goalHash: contentHash(GOAL),
  chain: [
    { runId: 'coach', iteration: 2 },
    { runId: 'grade', iteration: 1 },
  ],
  findings: new Set([DEFECT.key]),
  criteria: new Map([['c1', 'fail']]),
  remediations: [
    {
      subject: 'unhandled failure',
      severity: 'high',
      note: 'Say what serves redirects while the cache is down.',
    },
  ],
};

/** A lesson stored under the goal itself, so every one of them comes back on probe zero. */
const stored = (
  text: string,
  runId: string,
  of: {
    pipeline?: string;
    iteration?: number;
    evidence?: EvidenceRef[];
    lineage?: MemoryLineageDto | null;
  } = {},
): StoredChunk => ({
  ...lesson(text, GOAL, GOAL, runId),
  source: {
    runId,
    pipeline: of.pipeline ?? 'system-design-canvas',
    kind: 'lesson',
    ref: 'memory.1',
    decision: 'revise',
    iteration: of.iteration ?? 1,
    when: '2026-10-02',
  },
  evidence: of.evidence ?? [],
  lineage: of.lineage ?? null,
});

/** What a coach adopting `coach@2` should not be handed again, beside one lesson it should. */
const COPIES = [
  stored('The grade said to name a cache fallback.', 'grade', { iteration: 1 }),
  stored('A sibling restated the adopted ledger.', 'sibling', {
    lineage: {
      judged: { runId: 'coach', iteration: 2 },
      adoptedFrom: { runId: 'coach', iteration: 2 },
      goalHash: contentHash(GOAL),
    },
  }),
  stored('A point stored before lineage restates the held defect.', 'old', {
    evidence: [{ kind: 'finding', ref: DEFECT.key }],
  }),
];
const NEWS = stored('Serve redirects from the database when the cache is down.', 'elsewhere', {
  pipeline: 'system-design',
  evidence: [{ kind: 'finding', ref: DEFECT.key }],
});

/** A store of these chunks, and every probe it was searched with. */
async function storeOf(chunks: readonly StoredChunk[]) {
  const store = new InMemoryMemoryStore();
  for (const chunk of chunks) await store.replaceRunChunks(chunk.source.runId, [chunk]);
  const probes: MemoryProbe[] = [];
  const searchMany = store.searchMany.bind(store);
  store.searchMany = (asked) => {
    probes.push(...asked);
    return searchMany(asked);
  };
  return { store, probes };
}

const screened = async (chunks: readonly StoredChunk[], known: RecallKnown | null) => {
  const { store, probes } = await storeOf(chunks);
  const goals: string[] = [];
  const recalled = await recallMemory(memoryPorts({ store }), {
    goal: GOAL,
    store: memoryContext().store,
    acceptAt: ACCEPT_AT,
    execute: (input) => {
      goals.push(input.goal);
      return Promise.resolve(
        toRunDto(childRun('memory-recall', acceptedRecall())) as QualityRunDto,
      );
    },
    known,
  });
  return { recalled, query: goals[0] ?? null, probes, store };
};

describe('a recall for a producer that revises a judged answer', () => {
  it('[QL-51] sets aside the chain’s lesson, a sibling’s copy and a legacy restatement, and offers another pipeline’s lesson with its origin', async () => {
    const { recalled, query } = await screened([...COPIES, NEWS], KNOWN);
    const candidates = readIndex(query ?? '')?.candidates ?? [];
    expect(candidates.map((candidate) => candidate.source.runId)).toEqual(['elsewhere']);
    expect(query).toContain('· origin other-pipeline');
    // The curator is told what the producer holds, and the rule that goes with it.
    expect(query).toContain(KNOWN_HEADING);
    expect(query).toContain(
      '- [k1] high · unhandled failure: Say what serves redirects while the cache is down.',
    );
    expect(query).toContain(`- ${NOVELTY_RULE}`);
    expect(recalled.novelty).toMatchObject({
      chain: KNOWN.chain,
      known: { findings: 1, criteria: 1, remediations: 1 },
      pool: 4,
      collapsed: 0,
      offered: 1,
      origins: [{ ref: 'm1', sourceRunId: 'elsewhere', origin: 'other-pipeline' }],
    });
    expect(recalled.novelty?.excluded.map((item) => [item.sourceRunId, item.reason])).toEqual([
      ['grade', 'chain-iteration'],
      ['sibling', 'sibling-copy'],
      ['old', 'known-evidence'],
    ]);
  });

  it('[QL-51] reaches three times wider than it offers, so what it sets aside leaves room for what it does not', async () => {
    const crowd = Array.from({ length: MAX_CANDIDATES }, (_, index) =>
      stored(`The grade’s lesson number ${index}.`, `grade-${index}`, {
        lineage: {
          judged: { runId: 'grade', iteration: 1 },
          adoptedFrom: null,
          goalHash: contentHash(GOAL),
        },
      }),
    );
    const { recalled, query, probes } = await screened([...crowd, NEWS], KNOWN);
    expect(probes.map((probe) => probe.limit)).toEqual([48, 48]);
    expect(recalled.novelty).toMatchObject({ pool: MAX_CANDIDATES + 1, offered: 1 });
    expect(readIndex(query ?? '')?.candidates.map((candidate) => candidate.source.runId)).toEqual([
      'elsewhere',
    ]);
  });

  it('[QL-51] a search whose every lesson the producer already holds opens no recall run: nothing new', async () => {
    const { recalled, query } = await screened(COPIES, KNOWN);
    expect(query).toBeNull();
    expect(recalled).toMatchObject({ status: 'skipped', reason: 'nothing-new', note: null });
    expect(recalled.novelty).toMatchObject({ pool: 3, offered: 0, origins: [] });
    expect(recalled.novelty?.excluded).toHaveLength(3);
  });

  it('[QL-51] with nothing known it is the recall it always was: the same probes, candidates and query, and no screen', async () => {
    const chunks = [...COPIES, NEWS];
    const { recalled, query, probes, store } = await screened(chunks, null);
    expect(probes.map((probe) => probe.limit)).toEqual([MAX_CANDIDATES, MAX_CANDIDATES]);
    expect(recalled.novelty).toBeUndefined();
    // What a recall composed before there was a screen, step by step from the same store.
    const vectors = [vectorOf(queryText(GOAL))];
    const hits = fuse(await store.searchMany(probesOf(vectors, MAX_CANDIDATES)), MAX_CANDIDATES);
    expect(query).toBe(renderQuery(builtQuery(queryText(GOAL), probeSet(GOAL, []), hits)));
    expect(query).not.toContain(KNOWN_HEADING);
    expect(query).not.toContain(NOVELTY_RULE);
    expect(query).not.toContain('· origin');
    expect(readIndex(query ?? '')?.candidates).toHaveLength(chunks.length);
  });
});
