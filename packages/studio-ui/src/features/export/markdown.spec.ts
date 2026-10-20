import { describe, expect, it } from 'vitest';

import { humanizeReason } from '../evaluation/decision-reason';
import { degradedNote } from '../evaluation/degraded';
import { formatScore } from '../evaluation/score';
import { STOPPED_COPY } from '../evaluation/stop-reason';
import { humanizeKind } from '../prompts/criteria';

import {
  makeCriteria,
  makeCriterionResult,
  makeEvaluation,
  makeFinding,
  makePrompt,
  makeRevisionSummary,
  PROMPT_MARKDOWN,
} from '../../testing/fixtures';
import { makeBrief, makeGraph, makeNarrative } from '../../testing/canvas-fixtures';
import {
  briefMarkdown,
  feedbackMarkdown,
  narrativeMarkdown,
  promptMarkdown,
  revisionsMarkdown,
} from './markdown';

// makeGraph: n-1 Client → n-2 Order Service → n-3 Orders DB (edges e-1, e-2).
const graph = makeGraph();
const prompt = makePrompt();
const criteria = makeCriteria();
/** Feedback about the revision the canvas — so the exported diagram — still shows. */
const onCanvas = (revisionNumber: number) =>
  ({ revisionNumber, origin: 'user', onCanvas: true }) as const;

describe('promptMarkdown', () => {
  it('[UX-10] renders the markdown verbatim followed by the criteria table', () => {
    const md = promptMarkdown(prompt, criteria);
    expect(md.startsWith(PROMPT_MARKDOWN)).toBe(true);
    expect(md).toContain('## Criteria');
    expect(md).toContain('| Id | Kind | Statement |');
    // The kind in the words the studio shows it in, never the wire token.
    expect(md).toContain(
      `| c3 | ${humanizeKind('non_functional')} | p99 read latency stays under 200 ms |`,
    );
    expect(md).not.toContain('non_functional');
  });

  it('escapes a pipe in a statement so the row keeps its columns', () => {
    const md = promptMarkdown(prompt, [
      { id: 'c1', kind: 'functional', statement: 'Reads | writes stay apart' },
    ]);
    expect(md).toContain('| c1 | Functional | Reads \\| writes stay apart |');
  });

  it('says None when no criteria were derived', () => {
    expect(promptMarkdown(prompt, [])).toContain('_None._');
  });
});

describe('narrativeMarkdown', () => {
  it('resolves node ids to labels and criterion ids to statements', () => {
    const md = narrativeMarkdown(makeNarrative(), graph, criteria);
    expect(md).toContain('A read/write split');
    expect(md).toContain('### Orders DB');
    expect(md).not.toContain('n-3');
    expect(md).toContain('### c1 — A shopper reads their merged order history');
    expect(md).toContain('The client asks the service');
  });

  it('says None when there is no narrative', () => {
    expect(narrativeMarkdown(null, graph, criteria)).toContain('_None._');
  });

  it('prints rationales in diagram order and narrations in rubric order, whatever order they were written in', () => {
    const narrative = makeNarrative({
      componentRationales: [
        { nodeId: 'n-3', prose: 'Third.' },
        { nodeId: 'ghost', prose: 'No such block.' },
        { nodeId: 'n-1', prose: 'First.' },
      ],
      criterionNarrations: [
        { criterionId: 'c3', prose: 'Latency.' },
        { criterionId: 'c1', prose: 'History.' },
      ],
    });

    const md = narrativeMarkdown(narrative, graph, criteria);

    expect(md.indexOf('### Client')).toBeGreaterThan(-1);
    expect(md.indexOf('### Client')).toBeLessThan(md.indexOf('### Orders DB'));
    // A rationale for a block no longer drawn keeps its place after the drawn ones.
    expect(md.indexOf('### Orders DB')).toBeLessThan(md.indexOf('### ghost'));
    expect(md.indexOf('### c1 —')).toBeGreaterThan(-1);
    expect(md.indexOf('### c1 —')).toBeLessThan(md.indexOf('### c3 —'));
    // The stored narrative is left as written: its positional refs depend on it.
    expect(narrative.componentRationales.map((rationale) => rationale.nodeId)).toEqual([
      'n-3',
      'ghost',
      'n-1',
    ]);
  });
});

describe('briefMarkdown', () => {
  it('renders one table row per binding with its claim, components and resolved path', () => {
    const md = briefMarkdown(makeBrief(), graph, criteria);
    expect(md).toContain('| Criterion | Claim | Components | Path | Why this, not another |');
    expect(md).toContain('c1 — A shopper reads their merged order history');
    expect(md).toContain('The service reads the history from the orders database');
    expect(md).toContain('Order Service, Orders DB');
    expect(md).toContain('Client → Order Service, then Order Service → Orders DB');
    // A binding with no path shows a dash, never an empty cell.
    expect(md).toMatch(/A replica keeps point reads under the budget \| Orders DB \| — \|/);
  });

  it('says None when there is no brief', () => {
    expect(briefMarkdown(null, graph, criteria)).toContain('_None._');
  });
});

describe('feedbackMarkdown', () => {
  it('[UX-10] renders the score line, dimensions, criteria and findings by their location labels, substituting ids in the rationale', () => {
    const evaluation = makeEvaluation({
      findings: [
        makeFinding({
          lenses: ['critic.structure'],
          rationale: 'node.3 is both the read bottleneck and the single point of failure.',
        }),
      ],
    });
    const md = feedbackMarkdown(evaluation, criteria, onCanvas(2));
    expect(md).toContain('# Feedback — revision #2');
    expect(md).toContain('**72/100 · revise**');
    expect(md).toContain('## Dimensions');
    expect(md).toContain('| Qualities | 60 |');
    expect(md).toContain('## Criteria');
    expect(md).toContain('| c3 — p99 read latency stays under 200 ms | Fail | high |');
    expect(md).toContain('## Findings');
    expect(md).toContain(
      '- **[high · critic structure · Unhandled failure]** (n-3 · database · Orders DB) — c3',
    );
    expect(md).toContain(
      '  n-3 · database · Orders DB is both the read bottleneck and the single point of failure.',
    );
    expect(md).toContain('_run run-1 · iteration 1 · model test-model_');
  });

  it('[UX-10] prints what the panel prints: whole-point scores, the decision reason and every rationale in labels, never a key or a position', () => {
    const finding = makeFinding({ lenses: ['critic.structure', 'evaluator.coverage'] });
    const evaluation = makeEvaluation({
      overall: 72.6,
      dimensions: { coverage: 79.5, compliance: null },
      decisionReason: `blockers to fix: ${finding.id}, c3`,
      decisionBasis: {
        factor: 'policy-allowed',
        facts: {},
        remediations: 2,
        criteria: { assessed: 5, total: 5 },
      },
      findings: [finding],
      criterionResults: [
        makeCriterionResult({
          criterionId: 'c3',
          result: 'fail',
          rationale: 'node.3 | the one primary — a read bottleneck.',
          locations: finding.locations,
        }),
      ],
    });

    const md = feedbackMarkdown(evaluation, criteria, onCanvas(2));

    expect(md).toContain(`**${formatScore(72.6)}/100 · revise**`);
    expect(md).toContain('**73/100 · revise**');
    expect(md).toContain('| Coverage | 80 |');
    expect(md).toContain('| Compliance | Not assessed |');
    // The reason through the panel's own humanizer: the finding and the criterion by name.
    expect(md).toContain(
      humanizeReason(evaluation.decisionReason ?? '', { findings: evaluation.findings, criteria }),
    );
    expect(md).toContain(
      'blockers to fix: Unhandled failure (n-3 · database · Orders DB), “p99 read latency stays under 200 ms”',
    );
    // A criterion's rationale reads with its labels, and its pipe never splits the row.
    expect(md).toContain('| n-3 · database · Orders DB \\| the one primary — a read bottleneck. |');
    expect(md).toContain('critic structure, evaluator coverage');
    expect(md).not.toContain(finding.id);
    expect(md).not.toContain('node.3');
    expect(md).not.toContain('critic.structure');
  });

  it('[UX-10] words a rationale as the panel does: a capitalised ref by its label, a place already named by its short one, a finding type in words', () => {
    const finding = makeFinding({
      rationale: 'Node.3 is the one primary; the data_integrity defect follows from it.',
    });
    const md = feedbackMarkdown(
      makeEvaluation({
        findings: [finding],
        criterionResults: [
          makeCriterionResult({
            criterionId: 'c3',
            result: 'fail',
            rationale: 'Orders DB (node.3) has no replica, per the unhandled_failure finding.',
            locations: finding.locations,
          }),
        ],
      }),
      criteria,
      onCanvas(1),
    );

    expect(md).toContain(
      '  n-3 · database · Orders DB is the one primary; the data integrity defect follows from it.',
    );
    expect(md).toContain('| Orders DB (n-3) has no replica, per the unhandled failure finding. |');
    expect(md).not.toMatch(/node\.3/i);
    expect(md).not.toContain('data_integrity');
  });

  it('[UX-10] reads a place a rationale merely mentions by its label, and lists a finding only where its lens cited', () => {
    const mentioned = {
      ref: 'edge.2',
      label: 'e-2 · n-2 → n-3 (sync)',
      part: 'edge',
      key: 'e-2',
    } as const;
    const md = feedbackMarkdown(
      makeEvaluation({
        findings: [
          makeFinding({
            rationale: 'node.3 has no replica, so the read along edge.2 stops at it.',
            mentions: [mentioned],
          }),
        ],
        criterionResults: [
          makeCriterionResult({
            criterionId: 'c3',
            result: 'fail',
            rationale: 'The read along edge.2 ends at one primary.',
            locations: [],
            mentions: [mentioned],
          }),
        ],
      }),
      criteria,
      onCanvas(1),
    );

    expect(md).toContain(
      '- **[high · critic structure · Unhandled failure]** (n-3 · database · Orders DB) — c3',
    );
    expect(md).toContain(
      '  n-3 · database · Orders DB has no replica, so the read along e-2 · n-2 → n-3 (sync) stops at it.',
    );
    expect(md).toContain('| The read along e-2 · n-2 → n-3 (sync) ends at one primary. |');
    expect(md).not.toContain('edge.2');
  });

  it('[DEL-4] says the caveats the panel says: the lens samples a grade was computed without, and a coach’s stop in its own sentence — nothing for a plain grade', () => {
    const plain = feedbackMarkdown(makeEvaluation(), criteria, onCanvas(1));
    expect(plain).not.toMatch(/stopped|iteration budget|lens sample/i);

    const degraded = [{ stage: 'critic.explanation', sample: 2, reason: 'llm-failed' }] as const;
    const md = feedbackMarkdown(
      makeEvaluation({ iteration: 3, stopReason: 'max-iterations', degraded: [...degraded] }),
      criteria,
      onCanvas(3),
    );
    expect(md).toContain(STOPPED_COPY['max-iterations']);
    expect(md).not.toMatch(/max.iterations/i);
    expect(md).toContain(`_${degradedNote(degraded)}_`);
    expect(md).toContain(
      'Graded with 1 lens sample missing — critic explanation #2 (the model did not answer)',
    );
  });

  it('[DEL-8] words the decision as the panel does — never the controller’s "remediation(s)"', () => {
    const md = feedbackMarkdown(
      makeEvaluation({
        decisionReason: '10 remediation(s) to apply',
        decisionBasis: {
          factor: 'route',
          facts: {},
          remediations: 10,
          criteria: { assessed: 5, total: 5 },
        },
      }),
      criteria,
      onCanvas(6),
    );
    expect(md).toContain('Below the accept threshold — 10 fixes to make.');
    expect(md).not.toContain('remediation');
  });

  it('[UX-15] says, as the tab does, when the diagram is the draft rather than the revision the feedback is about', () => {
    const drafted = feedbackMarkdown(makeEvaluation(), criteria, {
      revisionNumber: 10,
      origin: 'user',
      onCanvas: false,
    });
    expect(drafted).toContain('# Feedback — revision #10');
    expect(drafted).toContain(
      '_The canvas shows your draft, not this revision. The diagram in this export is the draft._',
    );
    // Said even when the grade is not there to read: the diagram is still the draft.
    expect(
      feedbackMarkdown(makeEvaluation({ status: 'failed' }), criteria, {
        revisionNumber: 10,
        origin: 'user',
        onCanvas: false,
      }),
    ).toContain('The diagram in this export is the draft.');
    expect(feedbackMarkdown(makeEvaluation(), criteria, onCanvas(10))).not.toContain('draft');
    // Nothing submitted: feedback about no revision.
    const unsubmitted = feedbackMarkdown(null, criteria, null);
    expect(unsubmitted).toContain('# Feedback\n');
    expect(unsubmitted).not.toContain('revision #');
  });

  it('[UX-18] prints a grade that earned no score as the panel says it — no number, decision or dimension, why, and no lens’s words on what nobody settled', () => {
    const md = feedbackMarkdown(
      makeEvaluation({
        overall: null,
        unscored: 'unassessed',
        decision: 'escalate',
        decisionReason: 'only 0% of criteria assessed; unassessed: c1, c3',
        decisionBasis: {
          factor: 'evidence',
          facts: {},
          remediations: 0,
          criteria: { assessed: 0, total: 2 },
        },
        dimensions: { coverage: null, qualities: null },
        degraded: [{ stage: 'evaluator.qualities', sample: 1, reason: 'llm-failed' }],
        criterionResults: [
          makeCriterionResult({ result: 'unassessed', confidence: null, rationale: 'looks fine' }),
        ],
        findings: [],
      }),
      criteria,
      onCanvas(1),
    );
    expect(md).toContain('**This revision couldn’t be graded**');
    expect(md).toContain('The lenses assessed 0 of 2 criteria — too few to score the design.');
    expect(md).toContain(
      '1 lens sample did not answer: evaluator qualities #1 (the model did not answer).',
    );
    expect(md).not.toMatch(/\/100|escalate|## Dimensions|score stands|only 0%/);
    expect(md).toContain('| Unassessed | — | — |');
    expect(md).not.toContain('looks fine');
  });

  it('says not-graded in words when the evaluation is absent, running or failed — never a status token', () => {
    expect(feedbackMarkdown(null, criteria, onCanvas(1))).toContain('_Not graded yet._');
    const running = feedbackMarkdown(makeEvaluation({ status: 'running' }), criteria, onCanvas(1));
    expect(running).toContain('Not graded yet — grading is still running.');
    expect(running).not.toContain('status:');
    expect(feedbackMarkdown(makeEvaluation({ status: 'failed' }), criteria, onCanvas(1))).toContain(
      'grading failed for this revision',
    );
  });
});

describe('revisionsMarkdown', () => {
  it('renders a sorted timeline table', () => {
    const md = revisionsMarkdown([
      makeRevisionSummary({
        revisionNumber: 2,
        origin: 'assistant',
        evaluation: {
          runId: 'r',
          iteration: 2,
          status: 'complete',
          overall: 79.6,
          decision: 'accept',
        },
      }),
      makeRevisionSummary({
        revisionNumber: 1,
        evaluation: {
          runId: 'r',
          iteration: 1,
          status: 'complete',
          overall: 20,
          decision: 'reject',
        },
      }),
      makeRevisionSummary({
        revisionNumber: 3,
        evaluation: { runId: 's', iteration: 1, status: 'running', overall: null, decision: null },
      }),
    ]);
    expect(md).toContain('| Rev | Score | Decision | Status |');
    const rows = md.split('\n').filter((line) => /^\| \d/.test(line));
    // The status in the studio's words, as the toolbar badge prints it — never the wire token.
    expect(rows[0]).toBe('| 1 | 20 | reject | graded |');
    expect(rows[1]).toBe('| 2 (AI) | 80 | accept | graded |');
    expect(rows[2]).toBe('| 3 | — | — | grading… |');
  });

  it('[UX-18] prints a grade that earned no score as not assessed — no score, no decision', () => {
    const md = revisionsMarkdown([
      makeRevisionSummary({
        revisionNumber: 1,
        evaluation: {
          runId: 'r',
          iteration: 1,
          status: 'complete',
          overall: null,
          decision: 'escalate',
        },
      }),
    ]);
    expect(md.split('\n').filter((line) => /^\| \d/.test(line))).toEqual([
      '| 1 | — | — | not assessed |',
    ]);
  });

  it('says None with no revisions', () => {
    expect(revisionsMarkdown([])).toContain('_None._');
  });
});
