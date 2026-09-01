import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { CanvasGraph, DimensionScores, Grade } from '@sysdesign/contracts';

import { runEngine } from './engine';
import { flashSaleFacts } from './testing';

function loadFixture(name: string): CanvasGraph {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf-8'),
  ) as CanvasGraph;
}

interface CalibrationRow {
  design: string;
  graph: CanvasGraph;
  dimensionScores: DimensionScores;
  overallScore: number;
  grade: Grade;
}

/**
 * The regression anchor for every future rubric change: what each reference
 * design is worth, to the decimal. If a new rule or expectation moves these
 * numbers, that movement must be deliberate and re-pinned here.
 *
 * Every row here is a diagram submitted WITHOUT a narrative. Since profile
 * 2.3.0 that is itself a graded answer — `exp.nar.present` applies whether or
 * not prose was written — so each score is the old diagram-only number minus
 * the communication tenth. The excellent design is a B until its author
 * explains it, which is the point: a diagram nobody can follow is not a
 * finished answer.
 */
const TABLE: CalibrationRow[] = [
  {
    design: 'empty canvas',
    graph: { nodes: [], edges: [] },
    dimensionScores: {
      reliability: 0,
      scalability: 0,
      performance: 0,
      data: 0,
      messaging: 0,
      security: 0,
      hygiene: 0,
      communication: 0,
    },
    overallScore: 0,
    grade: 'F',
  },
  {
    design: 'naive three-box',
    graph: loadFixture('naive-flash-sale.graph.json'),
    dimensionScores: {
      reliability: 0,
      scalability: 0,
      performance: 0,
      data: 100,
      messaging: 0,
      security: 0,
      hygiene: 100,
      communication: 0,
    },
    overallScore: 18,
    grade: 'F',
  },
  {
    design: 'naive plus accepted replica',
    graph: loadFixture('naive-flash-sale-plus-replica.graph.json'),
    dimensionScores: {
      reliability: 28,
      scalability: 0,
      performance: 0,
      data: 100,
      messaging: 0,
      security: 0,
      hygiene: 100,
      communication: 0,
    },
    overallScore: 23,
    grade: 'F',
  },
  {
    design: 'solid reference design',
    graph: loadFixture('solid-flash-sale.graph.json'),
    dimensionScores: {
      reliability: 100,
      scalability: 70,
      performance: 60,
      data: 100,
      messaging: 100,
      security: 100,
      hygiene: 100,
      communication: 0,
    },
    overallScore: 77.9,
    grade: 'C',
  },
  {
    design: 'excellent design (waiting room, CDN, monitoring)',
    graph: loadFixture('excellent-flash-sale.graph.json'),
    dimensionScores: {
      reliability: 100,
      scalability: 100,
      performance: 100,
      data: 100,
      messaging: 100,
      security: 100,
      hygiene: 100,
      communication: 0,
    },
    overallScore: 90,
    grade: 'B',
  },
];

describe('calibration', () => {
  it.each(TABLE)('[EVAL-5] $design grades $grade at $overallScore', (row) => {
    const result = runEngine(row.graph, flashSaleFacts());
    expect(result.dimensionScores).toEqual(row.dimensionScores);
    expect(result.overallScore).toBe(row.overallScore);
    expect(result.grade).toBe(row.grade);
  });

  it('[EVAL-3] the accepted replica strictly improves the naive score', () => {
    const before = runEngine(loadFixture('naive-flash-sale.graph.json'), flashSaleFacts());
    const after = runEngine(
      loadFixture('naive-flash-sale-plus-replica.graph.json'),
      flashSaleFacts(),
    );
    expect(after.overallScore).toBeGreaterThan(before.overallScore);
  });

  it('[EVAL-4] unmet expectations surface as teaching findings with ghost fixes', () => {
    const result = runEngine(loadFixture('naive-flash-sale.graph.json'), flashSaleFacts());
    const coverageFindings = result.findings.filter((f) => f.expectationId !== null);
    expect(coverageFindings.length).toBeGreaterThan(5);
    for (const finding of coverageFindings) {
      expect(finding.ruleId).toBeNull();
      expect(finding.message.length).toBeGreaterThan(20);
    }
    expect(coverageFindings.some((f) => f.suggestion !== null)).toBe(true);
  });
});

/**
 * The narrative half of the anchor: the excellent diagram is held fixed and
 * only the prose varies, so these rows pin exactly what the communication
 * dimension is worth — and, since 2.3.0, what each way of dodging it costs.
 * The ordering is the point: an explanation earns the tenth, a bad attempt
 * earns almost none of it, and silence earns none at all.
 */
describe('narrative calibration', () => {
  const excellent = () => loadFixture('excellent-flash-sale.graph.json');

  /** Mentions all 12 labels, narrates the flows, and engages every NFR kind. */
  const coveringStory =
    'The Fan browser hits the CDN for static assets while the API gateway authenticates and ' +
    'rate limits calls, then routes them through the Load balancer to the Ticket service. ' +
    'The Waiting room absorbs the opening burst and admits fans fairly. Hot reads come from ' +
    'the Read cache and the Read replica, keeping p99 latency inside budget; the Orders DB ' +
    'stays the system of record with failover so availability holds. Checkout writes drain ' +
    'through the Order queue into the Order worker, and Pipeline monitoring alerts on-call ' +
    'before fans notice anything.';

  it('[EVAL-10] the excellent design with a covering story keeps its 100/A — communication earned in full', () => {
    const result = runEngine(excellent(), flashSaleFacts(), coveringStory);
    expect(result.dimensionScores.communication).toBe(100);
    expect(result.overallScore).toBe(100);
    expect(result.grade).toBe('A');
  });

  it('[EVAL-11] the same diagram submitted in silence scores 90/B — the absence is graded, not excused', () => {
    const result = runEngine(excellent(), flashSaleFacts());
    // Not null: renormalizing the dimension away would make writing nothing
    // strictly better than writing badly, which is what this pins against.
    expect(result.dimensionScores.communication).toBe(0);
    expect(result.overallScore).toBe(90);
    expect(result.grade).toBe('B');
    expect(result.findings.map((finding) => finding.expectationId)).toContain('exp.nar.present');
  });

  it('[EVAL-11] a throwaway story beats silence, but only just', () => {
    const result = runEngine(excellent(), flashSaleFacts(), 'It just works.');
    expect(result.dimensionScores.communication).toBe(11.1);
    expect(result.overallScore).toBe(91.1);
    expect(result.grade).toBe('B');
  });

  /**
   * The attack every substring check invites: paste the labels the checker
   * looks for and add the requirement vocabulary. Built from the graph itself,
   * so it is the best possible keyword list for this exact diagram.
   */
  it('[EVAL-11] a list of the right words scores like silence — substring coverage is not an explanation', () => {
    const graph = excellent();
    const salad = [
      ...new Set(graph.nodes.map((node) => node.label)),
      'calls',
      'latency',
      'availability',
      'throughput',
      'failover',
      'idempotent',
      'persist',
      'burst',
      'monitor',
      'alert',
    ].join(' ');

    const result = runEngine(graph, flashSaleFacts(), salad);
    expect(result.grade).toBe('B');
    expect(result.overallScore).toBeLessThan(92);
    // Only "you wrote something" is earned; every content check is voided.
    expect(result.dimensionScores.communication).toBeLessThan(20);
  });
});
