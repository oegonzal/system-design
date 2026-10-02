import { describe, expect, it } from 'vitest';

import { humanizeReason } from '../evaluation/decision-reason';
import { degradedNote } from '../evaluation/degraded';
import { formatScore } from '../evaluation/score';
import { STOPPED_COPY } from '../evaluation/stop-reason';
import { humanizeKind } from '../prompts/criteria';

import {
  makeBrief,
  makeCriteria,
  makeCriterionResult,
  makeEvaluation,
  makeFinding,
  makeGraph,
  makeNarrative,
  makePrompt,
  makeRevisionSummary,
  PROMPT_MARKDOWN,
} from '../../testing/fixtures';
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
    expect(md).toContain('| Criterion | Claim | Components | Path |');
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
          lenses: ['critic.architecture'],
          rationale: 'node.3 is both the read bottleneck and the single point of failure.',
        }),
      ],
    });
    const md = feedbackMarkdown(evaluation, criteria, 2);
    expect(md).toContain('# Feedback — revision #2');
    expect(md).toContain('**72/100 · revise**');
    expect(md).toContain('## Dimensions');
    expect(md).toContain('| Quality attributes | 60 |');
    expect(md).toContain('## Criteria');
    expect(md).toContain('| c3 — p99 read latency stays under 200 ms | Fail | high |');
    expect(md).toContain('## Findings');
    expect(md).toContain(
      '- **[high · critic architecture · Unhandled failure]** (n-3 · database · Orders DB) — c3',
    );
    expect(md).toContain(
      '  n-3 · database · Orders DB is both the read bottleneck and the single point of failure.',
    );
    expect(md).toContain('_run run-1 · iteration 1 · model test-model_');
  });

  it('[UX-10] prints what the panel prints: whole-point scores, the decision reason and every rationale in labels, never a key or a position', () => {
    const finding = makeFinding({ lenses: ['critic.architecture', 'evaluator.coverage'] });
    const evaluation = makeEvaluation({
      overall: 72.6,
      dimensions: { coverage: 79.5, compliance: null },
      decisionReason: `blockers to fix: ${finding.id}, c3`,
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

    const md = feedbackMarkdown(evaluation, criteria, 2);

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
    expect(md).toContain('critic architecture, evaluator coverage');
    expect(md).not.toContain(finding.id);
    expect(md).not.toContain('node.3');
    expect(md).not.toContain('critic.architecture');
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
      1,
    );

    expect(md).toContain(
      '  n-3 · database · Orders DB is the one primary; the data integrity defect follows from it.',
    );
    expect(md).toContain('| Orders DB (n-3) has no replica, per the unhandled failure finding. |');
    expect(md).not.toMatch(/node\.3/i);
    expect(md).not.toContain('data_integrity');
  });

  it('[DEL-4] says the caveats the panel says: the lens samples a grade was computed without, and a coach’s stop in its own sentence — nothing for a plain grade', () => {
    const plain = feedbackMarkdown(makeEvaluation(), criteria, 1);
    expect(plain).not.toMatch(/stopped|iteration budget|lens sample/i);

    const degraded = [{ stage: 'critic.explanation', sample: 2, reason: 'llm-failed' }] as const;
    const md = feedbackMarkdown(
      makeEvaluation({ iteration: 3, stopReason: 'max-iterations', degraded: [...degraded] }),
      criteria,
      3,
    );
    expect(md).toContain(STOPPED_COPY['max-iterations']);
    expect(md).not.toMatch(/max.iterations/i);
    expect(md).toContain(`_${degradedNote(degraded)}_`);
    expect(md).toContain(
      'Graded with 1 lens sample missing — critic explanation #2 (the model did not answer)',
    );
  });

  it('says not-graded in words when the evaluation is absent, running or failed — never a status token', () => {
    expect(feedbackMarkdown(null, criteria, 1)).toContain('_Not graded yet._');
    const running = feedbackMarkdown(makeEvaluation({ status: 'running' }), criteria, 1);
    expect(running).toContain('Not graded yet — grading is still running.');
    expect(running).not.toContain('status:');
    expect(feedbackMarkdown(makeEvaluation({ status: 'failed' }), criteria, 1)).toContain(
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

  it('says None with no revisions', () => {
    expect(revisionsMarkdown([])).toContain('_None._');
  });
});
