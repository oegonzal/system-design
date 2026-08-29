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
    },
    overallScore: 20,
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
    },
    overallScore: 25.6,
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
    },
    overallScore: 86.5,
    grade: 'B',
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
    },
    overallScore: 100,
    grade: 'A',
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
