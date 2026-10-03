import {
  DEFAULT_IMPROVE_ITERATIONS,
  describeInFlight,
  describeUnassessedBase,
  MAX_IMPROVE_ITERATIONS,
  PROMPT_COPY,
} from '@sysdesign/contracts';
import { renderWithTheme } from '@sysdesign/web-testing';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  makeCriteria,
  makeFinding,
  makeHeartbeat,
  makeImproveIteration,
  makeImproveRun,
  makeRecall,
  makeRevisionSummary,
} from '../../testing/fixtures';
import { humanizeReason } from '../evaluation/decision-reason';
import { ImprovementPanel, type ImprovementPanelProps } from './improvement-panel';

const noop = () => undefined;
const LIVE = { status: 'reachable', model: 'claude', heartbeat: makeHeartbeat() } as const;

function renderPanel(overrides: Partial<ImprovementPanelProps> = {}) {
  return renderWithTheme(
    <ImprovementPanel
      run={null}
      error={null}
      isPolling={false}
      message=""
      availability={LIVE}
      onStart={noop}
      onLoadRevision={noop}
      {...overrides}
    />,
  );
}

describe('ImprovementPanel', () => {
  it('[UX-11] offers 1..MAX iterations, defaulting to the contract default, and starts with the chosen count', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderPanel({ onStart });

    const select = screen.getByTestId('improve-iterations') as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual(
      Array.from({ length: MAX_IMPROVE_ITERATIONS }, (_, index) => String(index + 1)),
    );
    expect(select.value).toBe(String(DEFAULT_IMPROVE_ITERATIONS));

    await user.selectOptions(select, '2');
    await user.click(screen.getByTestId('improve-run'));
    expect(onStart).toHaveBeenCalledWith(2);
  });

  it('[UX-11] says so when the quality loop cannot be reached, and waits silently while availability is checked', () => {
    const { unmount } = renderPanel({ availability: { status: 'unreachable' } });
    expect((screen.getByTestId('improve-run') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('improver-unavailable').textContent).toContain('cannot reach');
    unmount();

    renderPanel({ availability: { status: 'checking' } });
    expect((screen.getByTestId('improve-run') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('improver-unavailable')).toBeNull();
  });

  it('[UX-14] is off with the reason while the session’s prompt is archived, whatever the grader says', () => {
    renderPanel({ promptArchived: true });
    expect((screen.getByTestId('improve-run') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('improver-unavailable').textContent).toBe(PROMPT_COPY.archived);
  });

  it('[DEL-3] is off with the session’s own reason while another run holds its grading slot', () => {
    const reason = describeInFlight({
      kind: 'grade',
      runId: 'run-7',
      revisionNumber: 2,
      state: 'running',
    });
    renderPanel({ blockedReason: reason });

    const start = screen.getByTestId('improve-run') as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(start.title).toBe(reason);
    expect(screen.getByTestId('improver-unavailable').textContent).toBe(reason);
  });

  it('[UX-11] the iteration count reads the run’s own budget while there is a run, and the author’s choice for the next', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const { rerender } = renderPanel({
      run: makeImproveRun({ maxIterations: 2 }),
      isPolling: true,
      onStart,
    });
    const select = () => screen.getByTestId('improve-iterations') as HTMLSelectElement;
    expect(select().value).toBe('2');
    expect(select().disabled).toBe(true);

    rerender(
      <ImprovementPanel
        run={makeImproveRun({ maxIterations: 2, status: 'complete', stopReason: 'plateau' })}
        error={null}
        isPolling={false}
        message=""
        availability={LIVE}
        onStart={onStart}
        onLoadRevision={noop}
      />,
    );
    expect(select().value).toBe('2');
    await user.selectOptions(select(), '4');
    await user.click(screen.getByTestId('improve-run'));
    expect(onStart).toHaveBeenCalledWith(4);
  });

  it('[UX-11] renders the live run: model calls so far and one badge per outcome — starting point, imported, not better, refused with its problems', () => {
    renderPanel({
      run: makeImproveRun({
        exchangeCount: 7,
        iterations: [
          makeImproveIteration({
            iteration: 1,
            mode: 'provided',
            overall: 64,
            decision: 'revise',
            revisionId: 'rev-1',
          }),
          makeImproveIteration({
            iteration: 2,
            mode: 'revise',
            overall: 72,
            decision: 'revise',
            revisionId: 'rev-2',
          }),
          makeImproveIteration({
            iteration: 3,
            mode: 'revise',
            overall: 70,
            decision: 'revise',
            revisionId: null,
          }),
          makeImproveIteration({
            iteration: 4,
            mode: 'revise',
            overall: 81,
            decision: 'accept',
            outcome: 'refused',
            problems: ['binding c1 names a component the canvas does not draw'],
            revisionId: null,
          }),
        ],
      }),
      isPolling: true,
      message: 'Coaching — 7 model calls so far.',
    });

    expect(screen.getByTestId('improve-progress').textContent).toBe(
      'Coaching — iteration 3 of 3, 7 model calls so far…',
    );
    expect(screen.getByTestId('improve-iteration-1').textContent).toContain('starting point');
    expect(screen.getByTestId('improve-iteration-2').textContent).toContain('imported');
    const lower = screen.getByTestId('improve-iteration-3');
    expect(lower.textContent).toContain('not better');
    expect(within(lower).getByTestId('improve-iteration-reason').textContent).toBe(
      'Below the accept threshold — 1 fix to make.',
    );
    const refused = screen.getByTestId('improve-iteration-4');
    expect(refused.textContent).toContain('refused');
    expect(within(refused).getByTestId('improve-iteration-problems').textContent).toContain(
      'binding c1 names a component the canvas does not draw',
    );
    expect(screen.queryByTestId('improve-iteration-adopted')).toBeNull();
    expect((screen.getByTestId('improve-run') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('load-best-revision')).toBeNull();
  });

  it('[EVAL-1] a live run says how long it has been going from its own start, and says when the grader has gone quiet', () => {
    const fresh = renderPanel({
      run: makeImproveRun({
        startedAt: new Date(Date.now() - 95_000).toISOString(),
        heartbeatAt: new Date(Date.now() - 20_000).toISOString(),
        readAt: new Date().toISOString(),
      }),
      isPolling: true,
    });
    expect(screen.getByTestId('coach-duration').textContent).toMatch(
      /^1:3\d since the coach started\.$/,
    );
    expect(screen.queryByTestId('coach-silence')).toBeNull();
    fresh.unmount();

    // On the server's clock, an hour ahead of the page's: the page would
    // have read this beat as in its future, and the silence as none.
    const server = Date.now() + 3_600_000;
    const quiet = renderPanel({
      run: makeImproveRun({
        startedAt: new Date(server - 500_000).toISOString(),
        heartbeatAt: new Date(server - 250_000).toISOString(),
        readAt: new Date(server).toISOString(),
      }),
      isPolling: true,
    });
    const silence = screen.getByTestId('coach-silence');
    expect(silence.textContent).toContain('The grader has not reported for 4 minutes.');
    expect(silence.getAttribute('data-minutes')).toBe('4');
    expect(screen.getByTestId('improve-progress').textContent).toContain('Coaching');
    expect(screen.queryByTestId('improvement-error')).toBeNull();
    quiet.unmount();

    // A run that has ended keeps no clock and raises no alarm, however old its last beat.
    renderPanel({
      run: makeImproveRun({ status: 'complete', stopReason: 'max-iterations' }),
    });
    expect(screen.queryByTestId('coach-duration')).toBeNull();
    expect(screen.queryByTestId('coach-silence')).toBeNull();
  });

  it('[UX-11] a run started from a graded revision shows its starting point as a reused grade', () => {
    renderPanel({
      run: makeImproveRun({
        iterations: [
          makeImproveIteration({ iteration: 1, mode: 'adopted', overall: 72, decision: 'revise' }),
        ],
      }),
      isPolling: true,
    });

    const base = screen.getByTestId('improve-iteration-1');
    expect(base.textContent).toContain('starting point');
    expect(within(base).getByTestId('improve-iteration-adopted').textContent).toBe('grade reused');
  });

  it('[UX-11] once stopped, explains why and offers the best imported revision', async () => {
    const onLoadRevision = vi.fn();
    renderPanel({
      run: makeImproveRun({
        status: 'complete',
        stopReason: 'plateau',
        iterations: [
          makeImproveIteration({
            iteration: 1,
            mode: 'provided',
            overall: 64,
            decision: 'revise',
            revisionId: 'rev-1',
          }),
          makeImproveIteration({
            iteration: 2,
            mode: 'revise',
            overall: 72,
            decision: 'revise',
            revisionId: 'rev-2',
          }),
          makeImproveIteration({
            iteration: 3,
            mode: 'revise',
            overall: 80,
            decision: 'accept',
            revisionId: 'rev-3',
          }),
        ],
      }),
      onLoadRevision,
    });

    expect(screen.getByTestId('improvement-stopped').textContent).toContain('plateaued');
    await userEvent.click(screen.getByTestId('load-best-revision'));
    expect(onLoadRevision).toHaveBeenCalledWith('rev-3');
  });

  it('[UX-11] names the findings and criteria a reason cites as the feedback summary does, and wraps what it cannot name inside the dock', () => {
    const contradiction = makeFinding({
      id: 'contradiction|binding.2,edge.5',
      type: 'contradiction',
      locations: [
        { ref: 'binding.2', label: 'Brief: c2', part: 'binding', key: 'c2' },
        { ref: 'edge.5', label: 'Order Service → Orders DB', part: 'edge', key: 'e-5' },
      ],
      locationRefs: ['binding.2', 'edge.5'],
    });
    const reasonText =
      'blockers to fix: contradiction|binding.2,edge.5, unbacked_claim|binding.9,narration.2, c3';
    const iteration = makeImproveIteration({
      reason: reasonText,
      // A gate that names its blockers keeps its sentence, with each one named.
      decisionBasis: {
        factor: 'policy-allowed',
        facts: {},
        remediations: 3,
        criteria: { assessed: 5, total: 5 },
      },
      findings: [contradiction],
    });
    const run = makeImproveRun({ iterations: [iteration] });
    const criteria = makeCriteria();
    renderPanel({ criteria, run, isPolling: true });

    const reason = screen.getByTestId('improve-iteration-reason');
    // One humanizer: the coach row reads exactly as the feedback summary would.
    expect(reason.textContent).toBe(
      humanizeReason(reasonText, { findings: iteration.findings, criteria }),
    );
    expect(reason.textContent).toBe(
      'blockers to fix: Contradiction (Brief: c2; Order Service → Orders DB), unbacked_claim|binding.9,narration.2, “p99 read latency stays under 200 ms”',
    );
    expect(getComputedStyle(reason).overflowWrap).toBe('anywhere');
  });

  it('[DEL-8] words a row’s decision from what settled it — never the controller’s "N remediation(s) to apply"', () => {
    renderPanel({
      isPolling: true,
      run: makeImproveRun({
        iterations: [
          makeImproveIteration({
            reason: '10 remediation(s) to apply',
            decisionBasis: {
              factor: 'route',
              facts: {},
              remediations: 10,
              criteria: { assessed: 5, total: 5 },
            },
          }),
        ],
      }),
    });
    expect(screen.getByTestId('improve-iteration-reason').textContent).toBe(
      'Below the accept threshold — 10 fixes to make.',
    );
  });

  it('[UX-18] a judged row the lenses could not settle reads "not assessed" — no score, no verdict — and says why', () => {
    renderPanel({
      run: makeImproveRun({
        status: 'complete',
        stopReason: 'escalated',
        iterations: [
          makeImproveIteration({
            iteration: 1,
            overall: null,
            unscored: 'unassessed',
            decision: 'escalate',
            reason: 'only 0% of criteria assessed; unassessed: c1, c2, c3, c4, c5',
            decisionBasis: {
              factor: 'evidence',
              facts: {},
              remediations: 0,
              criteria: { assessed: 0, total: 5 },
            },
          }),
        ],
      }),
    });

    const row = screen.getByTestId('improve-iteration-1');
    expect(within(row).getByTestId('improve-iteration-unscored').textContent).toBe('not assessed');
    expect(within(row).queryByTestId('improve-iteration-decision')).toBeNull();
    expect(row.textContent).toContain('—');
    expect(within(row).getByTestId('improve-iteration-reason').textContent).toBe(
      'Not scored — the lenses assessed 0 of 5 criteria, too few for a verdict.',
    );
  });

  it('[UX-18] a coach revision the lenses could not assess is not compared — never "not better" — and its stop is a miss, not a person’s call', () => {
    renderPanel({
      run: makeImproveRun({
        status: 'complete',
        stopReason: 'escalated',
        iterations: [
          makeImproveIteration({ iteration: 1, overall: 58 }),
          makeImproveIteration({
            iteration: 2,
            mode: 'revise',
            overall: null,
            unscored: 'unassessed',
            decision: 'escalate',
            reason: 'only 20% of criteria assessed; unassessed: c2, c3, c4, c5',
            decisionBasis: {
              factor: 'evidence',
              facts: {},
              remediations: 0,
              criteria: { assessed: 1, total: 5 },
            },
            outcome: 'unassessed',
            revisionId: null,
          }),
        ],
      }),
    });

    const row = screen.getByTestId('improve-iteration-2');
    expect(row.getAttribute('data-outcome')).toBe('unassessed');
    expect(within(row).getByTestId('improve-iteration-unscored').textContent).toBe('not assessed');
    expect(row.textContent).toContain('not compared');
    expect(row.textContent).not.toContain('not better');
    expect(within(row).queryByTestId('improve-iteration-decision')).toBeNull();
    expect(within(row).getByTestId('improve-iteration-reason').textContent).toBe(
      'Not scored — the lenses assessed 1 of 5 criteria, too few for a verdict.',
    );
    const stopped = screen.getByTestId('improvement-stopped').textContent ?? '';
    expect(stopped).toBe(
      'The lenses could not assess the coach’s last revision, so the coach stopped there — try again.',
    );
    expect(stopped).not.toContain('needs a person');
    expect(screen.queryByTestId('load-best-revision')).toBeNull();
  });

  it('[UX-18] is off with why when the revision it would start from has a grade that is no verdict', () => {
    const reason = describeUnassessedBase(1);
    renderPanel({ blockedReason: reason });
    const start = screen.getByTestId('improve-run') as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(start.title).toBe(reason);
    expect(screen.getByTestId('improver-unavailable').textContent).toBe(reason);
  });

  it('[DEL-3] a coach that produced nothing to judge says so — the stop is its miss, never a verdict on the design', () => {
    renderPanel({
      run: makeImproveRun({
        status: 'complete',
        stopReason: 'escalated',
        iterations: [
          makeImproveIteration({ iteration: 1, overall: 12.1 }),
          makeImproveIteration({
            iteration: 2,
            mode: 'revise',
            overall: null,
            decision: 'escalate',
            reason: 'no artifact to judge',
            outcome: 'no-artifact',
            revisionId: null,
          }),
        ],
      }),
    });

    const missing = screen.getByTestId('improve-iteration-2');
    expect(missing.getAttribute('data-outcome')).toBe('no-artifact');
    expect(missing.textContent).toContain('no revision produced');
    expect(missing.textContent).toContain('—');
    // Nothing was judged: the loop's own decision and reason for the empty
    // iteration are its bookkeeping, and the chip has already said it.
    expect(missing.textContent).not.toContain('no artifact');
    expect(within(missing).queryByTestId('improve-iteration-decision')).toBeNull();
    expect(within(missing).queryByTestId('improve-iteration-reason')).toBeNull();
    expect(
      within(screen.getByTestId('improve-iteration-1')).getByTestId('improve-iteration-decision')
        .textContent,
    ).toBe('revise');
    expect(screen.getByTestId('improve-iteration-1').textContent).toContain('12');
    expect(screen.getByTestId('improve-iteration-1').textContent).not.toContain('12.1');
    expect(screen.getByTestId('improvement-stopped').textContent).toBe(
      'The coach could not produce a revision this time — try again.',
    );
  });

  it('[UX-11] an escalation with a revision to judge says the loop needs a person, not that the design could not be scored', () => {
    renderPanel({
      run: makeImproveRun({
        status: 'complete',
        stopReason: 'escalated',
        iterations: [makeImproveIteration({ iteration: 1, decision: 'escalate' })],
      }),
    });
    const stopped = screen.getByTestId('improvement-stopped').textContent ?? '';
    expect(stopped).toContain('needs a person');
    expect(stopped).not.toContain('could not score');
  });

  it('[UX-11] a failed run is reported in the author’s terms with the run’s own error folded under it, and the previous run’s best stays one click away', async () => {
    const onLoadRevision = vi.fn();
    const operatorLine =
      "the run's heartbeat went stale — the process that owned it died or stalled";
    renderPanel({
      run: makeImproveRun({ status: 'failed', iterations: [], error: operatorLine }),
      error: operatorLine,
      earlierBest: makeRevisionSummary({
        id: 'rev-4',
        revisionNumber: 4,
        origin: 'assistant',
        evaluation: {
          runId: 'run-1',
          iteration: 2,
          status: 'complete',
          overall: 80.4,
          decision: 'accept',
        },
      }),
      onLoadRevision,
    });

    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('data-testid')).toBe('improvement-error');
    expect(alert.textContent).toContain('The coach stopped unexpectedly');
    expect(alert.textContent).toContain('try again');
    const detail = within(alert).getByTestId('failure-detail');
    expect(within(detail).getByRole('button').getAttribute('aria-expanded')).toBe('false');
    expect(detail.textContent).toContain(operatorLine);
    expect(screen.getByTestId('earlier-best').textContent).toContain('revision #4, scored 80');
    await userEvent.click(screen.getByTestId('load-earlier-best'));
    expect(onLoadRevision).toHaveBeenCalledWith('rev-4');
  });

  it('offers nothing to load when no iteration beat the draft', () => {
    renderPanel({
      run: makeImproveRun({
        status: 'complete',
        stopReason: 'max-iterations',
        iterations: [
          makeImproveIteration({
            iteration: 1,
            mode: 'provided',
            overall: 64,
            decision: 'revise',
            revisionId: 'rev-1',
          }),
          makeImproveIteration({
            iteration: 2,
            mode: 'revise',
            overall: 60,
            decision: 'revise',
            revisionId: null,
          }),
        ],
      }),
    });
    expect(screen.getByTestId('improvement-stopped').textContent).toContain('iteration budget');
    expect(screen.queryByTestId('load-best-revision')).toBeNull();
  });

  it('[QL-32] says the coach is recalling lessons before anything else moves, then how many it was handed, listed on request', async () => {
    const user = userEvent.setup();
    const recalling = makeImproveRun({
      iterations: [],
      recall: makeRecall({ status: 'recalling', count: 0, lessons: [], recallRunId: null }),
    });
    const { rerender } = renderPanel({ run: recalling, isPolling: true });
    expect(screen.getByTestId('improve-progress').textContent).toContain(
      'recalling lessons from earlier runs',
    );
    expect(screen.queryByTestId('coach-recall')).toBeNull();

    const recalled = makeImproveRun({ recall: makeRecall() });
    rerender(
      <ImprovementPanel
        run={recalled}
        error={null}
        isPolling
        message=""
        availability={LIVE}
        onStart={noop}
        onLoadRevision={noop}
      />,
    );
    expect(screen.getByTestId('improve-progress').textContent).not.toContain('recalling');
    expect(screen.getByTestId('coach-recall-summary').textContent).toBe(
      'Recalled 2 lessons from earlier runs for the coach',
    );
    const list = screen.getByTestId('coach-recall-lessons');
    expect(list.hidden).toBe(true);

    const toggle = screen.getByTestId('coach-recall-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(list.hidden).toBe(false);
    const lessons = within(list).getAllByTestId('coach-recall-lesson');
    expect(lessons.map((lesson) => lesson.textContent)).toEqual([
      'Put a cache in front of the primary database before adding read replicas.Where it helps: the read pathLearned from: iteration 2 of an earlier system design canvas run, decided revise, 2026-10-01',
      'Say what the queue absorbs when the downstream service slows down.Where it helps: failure handlingKeep in mind: learned on a different promptLearned from: iteration 1 of an earlier system design run, decided accept, 2026-09-28',
    ]);
    // A lesson with nothing to keep in mind says nothing about it.
    expect(within(lessons[0]).queryByTestId('coach-recall-caveat')).toBeNull();
    expect(within(lessons[1]).getByTestId('coach-recall-caveat').textContent).toBe(
      'Keep in mind: learned on a different prompt',
    );
  });

  it('[UX-21] says where each lesson was learned, and only what the curator said in the prompt’s own terms', async () => {
    const user = userEvent.setup();
    const [learned] = makeRecall().lessons;
    renderPanel({
      run: makeImproveRun({
        status: 'complete',
        recall: makeRecall({
          count: 2,
          lessons: [
            learned,
            // Recorded before lessons carried where they were learned, and
            // whose curator named only labels that stand for nothing here.
            {
              ref: 'm4',
              serves: '',
              insight: 'Count every serial hop in the availability product.',
              caveat: null,
              text: 'Recompute availability over every serial dependency.',
              sourceRunId: 'run-older',
            },
          ],
        }),
      }),
    });
    await user.click(screen.getByTestId('coach-recall-toggle'));
    const [first, older] = within(screen.getByTestId('coach-recall-lessons')).getAllByTestId(
      'coach-recall-lesson',
    );
    expect(within(first).getByTestId('coach-recall-learned').textContent).toBe(
      'Learned from: iteration 2 of an earlier system design canvas run, decided revise, 2026-10-01',
    );
    expect(older.textContent).toBe('Count every serial hop in the availability product.');
    expect(within(older).queryByTestId('coach-recall-serves')).toBeNull();
    expect(within(older).queryByTestId('coach-recall-learned')).toBeNull();
  });

  it('[QL-32] [QL-34] says what the recall searched for beside the prompt — the starting grade’s defects — next to the lessons', () => {
    const { unmount } = renderPanel({
      run: makeImproveRun({
        status: 'complete',
        recall: makeRecall({
          focus: {
            runId: 'run-1',
            iteration: 1,
            findings: [
              { type: 'unhandled_failure', severity: 'high', rationale: 'one replica' },
              { type: 'unhandled_failure', severity: 'high', rationale: 'one cache' },
              { type: 'data_integrity', severity: 'medium', rationale: null },
            ],
            criteria: [
              { criterionId: 'c1', statement: 'Reads stay fast', result: 'fail' },
              { criterionId: 'c4', statement: 'Counts lag by minutes', result: 'partial' },
            ],
          },
        }),
      }),
    });
    expect(screen.getByTestId('coach-recall-summary').textContent).toBe(
      'Recalled 2 lessons from earlier runs for the coach',
    );
    // Beside the list, not behind its toggle: each kind of defect once, then each shortfall.
    expect(screen.getByTestId('coach-recall-focus').textContent).toBe(
      'Searched for what the starting grade found wrong: unhandled failure, data integrity, c1 not met, and c4 met in part.',
    );
    unmount();

    // A recall over the prompt alone names no focus.
    renderPanel({ run: makeImproveRun({ status: 'complete', recall: makeRecall() }) });
    expect(screen.queryByTestId('coach-recall-focus')).toBeNull();
  });

  it('[QL-32] says plainly when the coach ran without lessons, and nothing when the run never recalled', () => {
    const { unmount } = renderPanel({
      run: makeImproveRun({
        status: 'complete',
        recall: makeRecall({
          status: 'skipped',
          reason: 'store-unavailable',
          count: 0,
          lessons: [],
        }),
      }),
    });
    const skipped = screen.getByTestId('coach-recall');
    expect(skipped.dataset['status']).toBe('skipped');
    expect(skipped.textContent).toBe(
      'The coach ran without lessons from earlier runs: the lesson store could not be reached.',
    );
    unmount();

    const empty = renderPanel({
      run: makeImproveRun({
        status: 'complete',
        recall: makeRecall({ status: 'empty', reason: 'store-empty', count: 0, lessons: [] }),
      }),
    });
    expect(screen.getByTestId('coach-recall').textContent).toContain(
      'No lessons from earlier runs',
    );
    empty.unmount();

    renderPanel({ run: makeImproveRun({ status: 'complete', recall: null }) });
    expect(screen.queryByTestId('coach-recall')).toBeNull();
  });
});
