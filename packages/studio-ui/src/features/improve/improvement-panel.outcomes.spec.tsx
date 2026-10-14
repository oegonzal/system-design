import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  makeCriteria,
  makeFinding,
  makeImproveIteration,
  makeImproveRun,
  makeRevisionSummary,
} from '../../testing/fixtures';
import { humanizeReason } from '../evaluation/decision-reason';
import { renderPanel } from './testing';

describe('ImprovementPanel', () => {
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
});
