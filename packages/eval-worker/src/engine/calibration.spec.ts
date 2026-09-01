import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { CanvasGraph, DesignBrief, DimensionScores, Grade } from '@sysdesign/contracts';

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
 * Every row here is a diagram submitted WITHOUT a brief. Since profile
 * 2.3.0 that is itself a graded answer — `exp.brf.present` applies whether or
 * not a brief was written — so each score is the old diagram-only number minus
 * the explanation tenth. The excellent design is a B until its author
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
      explanation: 0,
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
      explanation: 0,
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
      explanation: 0,
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
      explanation: 0,
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
      explanation: 0,
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
 * The brief half of the anchor: the excellent diagram is held fixed and only
 * the author's claims about it vary, so these rows pin exactly what the
 * explanation dimension is worth — and what each way of dodging it costs.
 *
 * The ordering is the property, not the numbers: an honest account earns the
 * tenth; naming more components than hold a claim scores BELOW naming fewer
 * honestly; a claim the canvas cannot back costs more than making no claim;
 * and silence earns nothing at all.
 */
describe('brief calibration', () => {
  const excellent = () => loadFixture('excellent-flash-sale.graph.json');

  /** Binds every requirement kind to components the canvas actually backs. */
  const fullBrief: DesignBrief = {
    version: 1,
    nfrBindings: [
      {
        nfrId: 'fst-avail-sale-window',
        nodeIds: ['database-1', 'replica-1'],
        mechanism: 'failover',
      },
      { nfrId: 'fst-lat-read-spike', nodeIds: ['cache-1'], mechanism: 'read-cache' },
      { nfrId: 'fst-thr-stampede', nodeIds: ['queue-1'], mechanism: 'queue-buffer' },
    ],
    flows: [
      {
        id: 'f-0',
        requirementIndex: 0,
        path: ['edge-1', 'edge-2', 'edge-10', 'edge-3', 'edge-4', 'edge-5'],
      },
      { id: 'f-1', requirementIndex: 1, path: ['edge-7', 'edge-8'] },
      { id: 'f-2', requirementIndex: 2, path: ['edge-9'] },
      { id: 'f-3', requirementIndex: 3, path: ['edge-6'] },
    ],
  };

  it('[EVAL-10] the excellent design with a complete brief keeps its 100/A', () => {
    const result = runEngine(excellent(), flashSaleFacts(), null, fullBrief);
    expect(result.dimensionScores.explanation).toBe(100);
    expect(result.overallScore).toBe(100);
    expect(result.grade).toBe('A');
  });

  it('[EVAL-11] the same diagram submitted in silence scores 90/B — the absence is graded', () => {
    const result = runEngine(excellent(), flashSaleFacts());
    // Not null: renormalising the dimension away would make explaining nothing
    // strictly better than explaining badly, which is what this pins against.
    expect(result.dimensionScores.explanation).toBe(0);
    expect(result.overallScore).toBe(90);
    expect(result.grade).toBe('B');
    expect(result.findings.map((finding) => finding.expectationId)).toContain('exp.brf.present');
  });

  it('[EVAL-11] one honest binding beats silence, and still cannot reach an A', () => {
    const minimal: DesignBrief = { version: 1, nfrBindings: [fullBrief.nfrBindings[0]], flows: [] };
    const result = runEngine(excellent(), flashSaleFacts(), null, minimal);
    expect(result.dimensionScores.explanation).toBe(16.7);
    expect(result.overallScore).toBe(91.7);
    expect(result.grade).toBe('B');
  });

  /**
   * The attack a claim-based rubric invites: bind every component to every
   * requirement and hope something sticks. Corroboration is an intersection,
   * so the extra names can only land in `uncorroborated`.
   */
  it('[EVAL-11] a shotgun brief scores BELOW the honest one-binding brief', () => {
    const graph = excellent();
    const shotgun: DesignBrief = {
      version: 1,
      nfrBindings: [
        {
          nfrId: 'fst-avail-sale-window',
          nodeIds: graph.nodes.map((node) => node.id),
          mechanism: 'failover',
        },
      ],
      flows: [],
    };
    const result = runEngine(graph, flashSaleFacts(), null, shotgun);
    expect(result.overallScore).toBeLessThan(91.7);
    expect(result.findings.map((finding) => finding.ruleId)).toContain(
      'explanation.shotgun-binding',
    );
  });

  it('[EVAL-12] a claim the canvas cannot back costs more than making no claim', () => {
    const unbacked: DesignBrief = {
      version: 1,
      // The Orders DB declares no backups, so nothing corroborates this.
      nfrBindings: [
        { nfrId: 'fst-avail-sale-window', nodeIds: ['database-1'], mechanism: 'backups' },
      ],
      flows: [],
    };
    const result = runEngine(excellent(), flashSaleFacts(), null, unbacked);
    expect(result.findings.map((finding) => finding.ruleId)).toContain(
      'explanation.unbacked-binding',
    );
    // Below the one honest binding, and below a brief that claimed nothing new.
    expect(result.overallScore).toBeLessThan(91.7);
  });
});
