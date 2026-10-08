import {
  type RecallNoveltyDto,
  recallOf,
  recallWithout,
  withRecallDeferred,
  withRecallNovelty,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';
import { buildRunDump } from './build-run-dump';
import { content, record } from './build-run-dump.testing';

describe('buildRunDump, for a run that recalled', () => {
  it('[QL-32] a run that recalled records the lessons its producer saw, where they came from, and why there were none', () => {
    const lesson = {
      ref: 'm2',
      serves: 'the read path',
      insight: 'Cache the read path before sharding it.',
      caveat: 'the earlier run had no POS feed',
      text: 'When reads dominate, cache before you shard.',
      sourceRunId: 'earlier-quality',
    };
    const recall = recallOf([lesson], 'recall-quality');
    const dump = buildRunDump(record({ recall }), null);
    expect(dump.files.map((file) => file.path)).toContain('recall.json');
    expect(JSON.parse(content(dump, 'recall.json'))).toEqual(recall);
    expect(JSON.parse(content(dump, 'manifest.json'))).toMatchObject({
      recall: { status: 'recalled', count: 1, recallRunId: 'recall-quality', reason: null },
    });
    const page = content(dump, 'run.md');
    expect(page).toContain('## Recall');
    expect(page).toContain(
      'recalled · 1 lesson(s) handed to the producer · recall run recall-quality',
    );
    expect(page).toContain(
      '- [m2] Cache the read path before sharding it. — serves: the read path; caveat: the earlier run had no POS feed (from run earlier-quality)',
    );

    const skipped = buildRunDump(
      record({ recall: recallWithout('embeddings-disabled', 'no-key') }),
      null,
    );
    expect(content(skipped, 'run.md')).toContain(
      'skipped (embeddings-disabled: no-key) · 0 lesson(s) handed to the producer',
    );
    // A run that never asked to recall says nothing about it.
    const plain = buildRunDump(record({}), null);
    expect(plain.files.map((file) => file.path)).not.toContain('recall.json');
    expect(content(plain, 'run.md')).not.toContain('## Recall');
    expect(JSON.parse(content(plain, 'manifest.json'))).toMatchObject({ recall: null });
  });

  it('[QL-55] each lesson prints as its producer read it: the iteration and decision it was learned in, and no serves clause where the curator named only labels', () => {
    const lesson = {
      ref: 'm3',
      serves: '',
      insight: 'Make the enqueue async.',
      caveat: null,
      text: 'An async enqueue keeps a redirect off the queue.',
      sourceRunId: 'earlier-quality',
      pipeline: 'system-design',
      iteration: 2,
      decision: 'revise' as const,
      when: '2026-10-01',
    };
    const page = content(buildRunDump(record({ recall: recallOf([lesson], 'r') }), null), 'run.md');
    expect(page).toContain(
      '- [m3] Make the enqueue async. (from run earlier-quality · iteration 2 · decided revise)\n',
    );
    expect(page).not.toContain('serves:');
  });

  it('[QL-52] a recall that screened what its producer held says what it set aside and why, the chain, and each lesson’s origin', () => {
    const lesson = {
      ref: 'm1',
      serves: 'the cache outage',
      insight: 'Serve redirects from the database while the cache is down.',
      caveat: null,
      text: 'Fall back to the database when the cache is down.',
      sourceRunId: 'elsewhere-quality',
    };
    const novelty: RecallNoveltyDto = {
      chain: [
        { runId: 'coach-quality', iteration: 2 },
        { runId: 'grade-quality', iteration: 1 },
      ],
      known: { findings: 9, criteria: 10, remediations: 17 },
      pool: 48,
      collapsed: 1,
      offered: 16,
      excluded: [
        {
          sourceRunId: 'grade-quality',
          ref: 'memory.3',
          iteration: 1,
          reason: 'chain-iteration',
          matched: ['grade-quality@1'],
        },
        {
          sourceRunId: 'sibling-quality',
          ref: 'memory.1',
          iteration: 1,
          reason: 'sibling-copy',
          matched: ['coach-quality@2'],
        },
        {
          sourceRunId: 'sibling-quality',
          ref: 'memory.2',
          iteration: 1,
          reason: 'sibling-copy',
          matched: ['coach-quality@2'],
        },
      ],
      demoted: [],
      origins: [{ ref: 'm1', sourceRunId: 'elsewhere-quality', origin: 'other-pipeline' }],
    };
    const recall = withRecallNovelty(recallOf([lesson], 'recall-quality'), novelty);
    const dump = buildRunDump(record({ recall }), null);
    expect(JSON.parse(content(dump, 'recall.json'))).toEqual(recall);
    const page = content(dump, 'run.md');
    expect(page).toContain(
      'novelty: pool 48 → excluded 3 as already known (chain-iteration 1 · sibling-copy 2) · collapsed 1 · offered 16 · chain coach-quality@2 → grade-quality@1',
    );
    expect(page).toContain(
      '- excluded `grade-quality` memory.3 (iteration 1) — chain-iteration: grade-quality@1',
    );
    expect(page).toContain(
      '- excluded `sibling-quality` memory.2 (iteration 1) — sibling-copy: coach-quality@2',
    );
    expect(page).toContain(
      '- [m1] Serve redirects from the database while the cache is down. — serves: the cache outage (from run elsewhere-quality · origin other-pipeline)',
    );

    // Everything it found was already held: the line says so, and no lesson follows.
    const nothingNew = withRecallNovelty(recallWithout('nothing-new'), {
      ...novelty,
      collapsed: 0,
      offered: 0,
      origins: [],
    });
    expect(content(buildRunDump(record({ recall: nothingNew }), null), 'run.md')).toContain(
      'empty (nothing-new) · 0 lesson(s) handed to the producer\n\nnovelty: pool 48 → excluded 3 as already known',
    );
    // A recall that screened nothing has no novelty line, and its lessons no origin.
    const unscreened = content(
      buildRunDump(record({ recall: recallOf([lesson], 'r') }), null),
      'run.md',
    );
    expect(unscreened).not.toContain('novelty:');
    expect(unscreened).not.toContain('· origin');
  });

  it("[QL-52] a recall whose goal budget left candidates out of the curator's query says how many on its line, and one that left none out says nothing of it", () => {
    const lesson = {
      ref: 'm1',
      serves: 'the read path',
      insight: 'Cache the read path before sharding it.',
      caveat: null,
      text: 'When reads dominate, cache before you shard.',
      sourceRunId: 'earlier-quality',
    };
    const recall = withRecallDeferred(recallOf([lesson], 'recall-quality'), 3);
    const dump = buildRunDump(record({ recall }), null);
    expect(JSON.parse(content(dump, 'recall.json'))).toMatchObject({ deferred: 3 });
    expect(content(dump, 'run.md')).toContain(
      "recalled · 1 lesson(s) handed to the producer · recall run recall-quality · 3 candidate(s) left out of the curator's query for the goal budget\n",
    );
    const fitted = content(
      buildRunDump(record({ recall: recallOf([lesson], 'recall-quality') }), null),
      'run.md',
    );
    expect(fitted).toContain(
      'recalled · 1 lesson(s) handed to the producer · recall run recall-quality\n',
    );
    expect(fitted).not.toContain('left out');
  });
});
