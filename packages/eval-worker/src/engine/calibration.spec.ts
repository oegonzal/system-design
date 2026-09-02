import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { CanvasGraph, DesignBrief, DimensionScores, Grade } from '@sysdesign/contracts';

import { runEngine } from './engine';
import { flashSaleFacts, fullNarration, orderHistoryFacts } from './testing';

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
 * Every row here is a diagram submitted WITHOUT a brief AND without a
 * narrative. Both absences are graded — `exp.brf.present` and `exp.nar.present`
 * apply whether or not either was written — so each score is the old
 * diagram-only number minus the explanation tenth, and the missing walkthrough
 * caps the letter at C. The excellent design is a capped C until its author
 * both explains it in words and accounts for it in a brief: a diagram nobody
 * can follow is not a finished answer, however clean the boxes.
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
      product: null,
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
      product: null,
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
      product: null,
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
      product: null,
    },
    overallScore: 77.9,
    grade: 'C',
  },
  {
    design: 'excellent design (waiting room, CDN, monitoring)',
    graph: loadFixture('excellent-flash-sale.graph.json'),
    dimensionScores: {
      // 96, not 100: the monitoring block collects metrics and alerts on
      // nothing, which the rubric now says out loud.
      reliability: 96,
      scalability: 100,
      performance: 100,
      data: 100,
      messaging: 100,
      security: 100,
      hygiene: 100,
      explanation: 0,
      product: null,
    },
    overallScore: 89.3,
    // Capped from B: the walkthrough is missing (exp.nar.present unmet), and no
    // top grade is handed to a design its author never explained.
    grade: 'C',
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

  /**
   * Unjustified machinery used to be free. Every rule that named it —
   * disconnected nodes, a mesh with nothing to mesh, more layers than the scale
   * asks for — was `info`, which the profile prices at zero, so a canvas with
   * twenty spare boxes scored exactly what the clean one did. It no longer does,
   * and magnitude registers: a habit costs more than an oversight.
   */
  it('unjustified machinery costs something, and more of it costs more', () => {
    const excellent = loadFixture('excellent-flash-sale.graph.json');
    const spare = (count: number) => ({
      ...excellent,
      nodes: [
        ...excellent.nodes,
        ...Array.from({ length: count }, (_, i) => ({
          id: `spare-${i}`,
          kind: 'vector-db' as const,
          label: `Spare ${i}`,
        })),
      ],
    });

    const clean = runEngine(excellent, flashSaleFacts()).overallScore;
    const oneStray = runEngine(spare(1), flashSaleFacts()).overallScore;
    const aHabit = runEngine(spare(5), flashSaleFacts()).overallScore;

    expect(oneStray).toBeLessThan(clean);
    expect(aHabit).toBeLessThan(oneStray);
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
 * The explanation half of the anchor: the excellent diagram is held fixed and
 * only the author's account of it varies — the brief's claims and the
 * narrative's prose — so these rows pin exactly what the explanation dimension
 * is worth, and what each way of dodging it costs.
 *
 * The ordering is the property, not the numbers: a complete brief AND a
 * complete walkthrough earn the tenth and the A; a complete brief with no
 * walkthrough loses points AND is capped below a top grade; naming more
 * components than hold a claim scores BELOW naming fewer honestly; a claim the
 * canvas cannot back costs more than making no claim; and silence earns nothing.
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

  it('[EVAL-10] the excellent design with a complete brief AND walkthrough earns 100/A', () => {
    const result = runEngine(
      excellent(),
      flashSaleFacts(),
      null,
      fullBrief,
      fullNarration(excellent(), flashSaleFacts()),
    );
    expect(result.dimensionScores.explanation).toBe(100);
    expect(result.overallScore).toBe(99.3);
    expect(result.grade).toBe('A');
  });

  it('[EVAL-15] a complete brief with no walkthrough loses the tenth AND is capped below an A', () => {
    // brief 12/12 met, but exp.nar.present unmet adds weight to the denominator
    // (12/13 = 92.3) and its cap forbids a top grade — a design you drew and
    // accounted for but never explained in words is not a finished answer.
    const result = runEngine(excellent(), flashSaleFacts(), null, fullBrief);
    expect(result.dimensionScores.explanation).toBe(92.3);
    expect(result.overallScore).toBe(98.5);
    expect(result.grade).toBe('C');
  });

  it('[EVAL-11] the same diagram submitted in silence is capped at C — the absence is graded', () => {
    const result = runEngine(excellent(), flashSaleFacts());
    // Not null: renormalising the dimension away would make explaining nothing
    // strictly better than explaining badly, which is what this pins against.
    expect(result.dimensionScores.explanation).toBe(0);
    expect(result.overallScore).toBe(89.3);
    expect(result.grade).toBe('C');
    expect(result.findings.map((finding) => finding.expectationId)).toContain('exp.brf.present');
    expect(result.findings.map((finding) => finding.expectationId)).toContain('exp.nar.present');
  });

  it('[EVAL-11] one honest binding beats silence, and still cannot reach an A', () => {
    const minimal: DesignBrief = { version: 1, nfrBindings: [fullBrief.nfrBindings[0]], flows: [] };
    const result = runEngine(excellent(), flashSaleFacts(), null, minimal);
    expect(result.dimensionScores.explanation).toBe(15.4);
    expect(result.overallScore).toBe(90.8);
    expect(result.grade).toBe('C');
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
    expect(result.overallScore).toBeLessThan(91);
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
    expect(result.overallScore).toBeLessThan(91);
  });
});

/**
 * The product dimension's own anchor, on the archetype that carries the
 * first workflow spec. Held apart from the flash-sale table because these
 * rows pin one dimension's meaning, not the whole rubric: what business-
 * workflow silence, partial coverage and full coverage are worth.
 */
describe('order-history calibration', () => {
  const naive = () => loadFixture('naive-order-history.graph.json');
  const excellent = () => loadFixture('excellent-order-history.graph.json');

  /**
   * Excellent minus two deliberate gaps: the POS poller loses its declared
   * cadence (freshness unprovable) and the failure event loses its consumer
   * (evt-ingest-failed stops at the stream). The delta IS the lesson list.
   */
  const solid = (): CanvasGraph => {
    const graph = excellent();
    return {
      nodes: graph.nodes.map((node) =>
        node.kind === 'batch-job'
          ? { ...node, config: { ...node.config, pollIntervalSeconds: undefined } as never }
          : node,
      ),
      edges: graph.edges.filter((edge) => edge.id !== 'edge-12'),
    };
  };

  it('[PRD-3] silence on a workflow prompt scores product 0 — never "not assessed"', () => {
    const result = runEngine(naive(), orderHistoryFacts());
    expect(result.dimensionScores.product).toBe(0);
    // The unmet coverage names what the business layer is missing.
    const expectationIds = result.findings
      .map((finding) => finding.expectationId)
      .filter((id): id is string => id !== null);
    expect(expectationIds).toContain('exp.prd.queries-served');
    expect(expectationIds).toContain('exp.prd.events-flowing');
    // And the archetype's own bullets grade beside it: the naive design
    // proxies the sources and scopes nothing — both conscious pins.
    expect(expectationIds).toContain('exp.ohi.own-orders-scoped');
    expect(expectationIds).toContain('exp.ohi.read-through-outage');
  });

  it('[PRD-3] a prompt without a workflow spec never assesses the dimension', () => {
    const result = runEngine(naive(), flashSaleFacts());
    expect(result.dimensionScores.product).toBeNull();
  });

  it('[PRD-5] the solid design pays for its two gaps: unstated cadence, unconsumed failure event', () => {
    const result = runEngine(solid(), orderHistoryFacts());
    expect(result.dimensionScores.product).toBe(65.7);
    const expectationIds = result.findings
      .map((finding) => finding.expectationId)
      .filter((id): id is string => id !== null);
    expect(expectationIds).toContain('exp.prd.freshness-within-budget');
    expect(expectationIds).toContain('exp.prd.events-flowing');
  });

  it('full coverage pins product at 100 — contracts, events, ingests, budgets, lifecycle, aggregate', () => {
    const result = runEngine(excellent(), orderHistoryFacts());
    expect(result.dimensionScores.product).toBe(100);
    expect(
      result.findings.filter(
        (finding) => finding.dimension === 'product' && finding.countsAsViolation,
      ),
    ).toEqual([]);
  });

  it('[PRD-5] a declared cadence over the stated budget is contradicted at high severity', () => {
    const graph = excellent();
    const slowPoll: CanvasGraph = {
      nodes: graph.nodes.map((node) =>
        node.kind === 'batch-job'
          ? { ...node, config: { ...node.config, pollIntervalSeconds: 900 } }
          : node,
      ),
      edges: graph.edges,
    };
    const result = runEngine(slowPoll, orderHistoryFacts());
    const finding = result.findings.find(
      (candidate) => candidate.ruleId === 'product.freshness-unachievable',
    );
    // The suppression yields the rule to the unmet expectation — one lesson,
    // one finding — so assert the pair: the expectation is unmet, and the
    // score fell.
    const expectationIds = result.findings
      .map((candidate) => candidate.expectationId)
      .filter((id): id is string => id !== null);
    expect(expectationIds).toContain('exp.prd.freshness-within-budget');
    expect(finding ?? null).toBeNull();
    expect(result.dimensionScores.product).toBeLessThan(100);
  });

  it('the ordering is the property: naive < solid < excellent on product and overall', () => {
    const scores = [naive(), solid(), excellent()].map((graph) =>
      runEngine(graph, orderHistoryFacts()),
    );
    expect(scores[0].dimensionScores.product ?? -1).toBeLessThan(
      scores[1].dimensionScores.product ?? -1,
    );
    expect(scores[1].dimensionScores.product ?? -1).toBeLessThan(
      scores[2].dimensionScores.product ?? -1,
    );
    expect(scores[0].overallScore).toBeLessThan(scores[1].overallScore);
    expect(scores[1].overallScore).toBeLessThan(scores[2].overallScore);
  });
});
