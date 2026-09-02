import type { DesignBrief, DesignNarrative } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import {
  makeEvaluation,
  makeFinding,
  makeGraph,
  makePrompt,
  makeRevisionSummary,
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

describe('promptMarkdown', () => {
  it('renders title, scenario, requirements, NFR table and scale targets', () => {
    const md = promptMarkdown(prompt);
    expect(md).toContain(`# Prompt — ${prompt.title}`);
    expect(md).toContain(prompt.scenario);
    expect(md).toContain(prompt.functionalRequirements[0]);
    expect(md).toContain('| Kind | Requirement | Target |');
    expect(md).toContain(prompt.nonFunctionalRequirements[0].statement);
    expect(md).toContain('| Concurrent users |');
  });
});

describe('narrativeMarkdown', () => {
  it('resolves node ids to labels and requirement ordinals to text', () => {
    const narrative: DesignNarrative = {
      version: 1,
      overview: 'Reads and writes are split.',
      componentRationales: [{ nodeId: 'n-3', prose: 'The database is the source of truth.' }],
      flowNarrations: [{ requirementIndex: 0, prose: 'The client reads availability.' }],
    };
    const md = narrativeMarkdown(narrative, graph, prompt);
    expect(md).toContain('Reads and writes are split.');
    expect(md).toContain('### Orders DB'); // n-3 resolved to its label
    expect(md).not.toContain('n-3');
    expect(md).toContain(`### ${prompt.functionalRequirements[0]}`);
    expect(md).toContain('The database is the source of truth.');
  });

  it('says None when there is no narrative', () => {
    expect(narrativeMarkdown(null, graph, prompt)).toContain('_None._');
  });
});

describe('briefMarkdown', () => {
  it('resolves bindings and flow paths to labels', () => {
    const brief: DesignBrief = {
      version: 1,
      nfrBindings: [
        {
          nfrId: prompt.nonFunctionalRequirements[0].id,
          nodeIds: ['n-3'],
          mechanism: 'read-cache',
        },
      ],
      flows: [{ id: 'f-0', requirementIndex: 0, path: ['e-1', 'e-2'] }],
    };
    const md = briefMarkdown(brief, graph, prompt);
    expect(md).toContain(prompt.nonFunctionalRequirements[0].statement); // nfrId → statement
    expect(md).toContain('`read-cache`');
    expect(md).toContain('Orders DB'); // node label
    expect(md).toContain('Client → Order Service'); // e-1 hop resolved
  });

  it('says None when there is no brief', () => {
    expect(briefMarkdown(null, graph, prompt)).toContain('_None._');
  });
});

describe('feedbackMarkdown', () => {
  it('renders grade, dimension table, findings by label', () => {
    const evaluation = makeEvaluation({
      findings: [
        makeFinding({ title: 'Single database with no replica', affectedNodeIds: ['n-3'] }),
      ],
    });
    const md = feedbackMarkdown(evaluation, graph, 2);
    expect(md).toContain('# Feedback — revision #2');
    expect(md).toContain('| Dimension | Score |');
    expect(md).toContain('Single database with no replica');
    expect(md).toContain('Orders DB'); // affected node resolved
  });

  it('says not-evaluated when the evaluation is absent or incomplete', () => {
    expect(feedbackMarkdown(null, graph, 1)).toContain('Not evaluated yet');
    expect(feedbackMarkdown(makeEvaluation({ status: 'queued' }), graph, 1)).toContain(
      'Not evaluated yet',
    );
  });
});

describe('revisionsMarkdown', () => {
  it('renders a sorted timeline table', () => {
    const md = revisionsMarkdown([
      makeRevisionSummary({ revisionNumber: 2, grade: 'B', overallScore: 80 }),
      makeRevisionSummary({ revisionNumber: 1, grade: 'F', overallScore: 20 }),
    ]);
    expect(md).toContain('| Rev | Grade | Score | Status | Submitted |');
    const rows = md
      .split('\n')
      .filter((line) => line.startsWith('| 1 |') || line.startsWith('| 2 |'));
    expect(rows[0]).toContain('| 1 |'); // sorted ascending
    expect(rows[1]).toContain('| 2 |');
  });

  it('says None with no revisions', () => {
    expect(revisionsMarkdown([])).toContain('_None._');
  });
});
