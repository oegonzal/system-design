import { describe, expect, it } from 'vitest';

import {
  makeBrief,
  makeCriteria,
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
    expect(md).toContain('| c3 | non_functional | p99 read latency stays under 200 ms |');
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
    expect(md).toContain('| quality_attributes | 60 |');
    expect(md).toContain('## Criteria');
    expect(md).toContain('| c3 — p99 read latency stays under 200 ms | fail | high |');
    expect(md).toContain('## Findings');
    expect(md).toContain(
      '- **[high · critic.architecture · Unhandled failure]** (n-3 · database · Orders DB) — c3',
    );
    expect(md).toContain(
      '  n-3 · database · Orders DB is both the read bottleneck and the single point of failure.',
    );
    expect(md).toContain('_run run-1 · iteration 1 · model test-model_');
  });

  it('says not-graded when the evaluation is absent or still running', () => {
    expect(feedbackMarkdown(null, criteria, 1)).toContain('Not graded yet');
    expect(feedbackMarkdown(makeEvaluation({ status: 'running' }), criteria, 1)).toContain(
      'Not graded yet',
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
          overall: 80,
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
    ]);
    expect(md).toContain('| Rev | Score | Decision | Status |');
    const rows = md.split('\n').filter((line) => /^\| \d/.test(line));
    expect(rows[0]).toBe('| 1 | 20 | reject | complete |');
    expect(rows[1]).toBe('| 2 (AI) | 80 | accept | complete |');
  });

  it('says None with no revisions', () => {
    expect(revisionsMarkdown([])).toContain('_None._');
  });
});
