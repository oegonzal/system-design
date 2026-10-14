'use client';

import type {
  DesignRevisionDto,
  DesignRevisionSummaryDto,
  RevisionEvaluationRef,
  SessionInFlightDto,
} from '@sysdesign/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../api/client';
import type { UngradedReason } from '../evaluation/evaluation-panel';
import { cachedStandingOf, standingOf, type GradeStanding } from '../evaluation/score';
import { useEvaluationPolling } from '../evaluation/use-evaluation-polling';
import {
  byNewest,
  latestUserRevision,
  toSummary,
  toTarget,
  type FeedbackTarget,
} from './feedback-target';

/** The session's slot as the revisions follow it: who holds it, and asking again. */
interface Slot {
  inFlight: SessionInFlightDto | null;
  recheck(): void;
}

/**
 * The revisions the page shows, and which one each place is about: the
 * timeline's list, the revision whose grade the feedback tab follows (and that
 * grade's poll), and the revision loaded read-only onto the canvas. Each
 * change arrives as what happened — opened, submitted, regraded, viewed,
 * restored — and the timeline is read again whenever a run that writes to it
 * ends.
 */
export function useShownRevisions(sessionId: string, slot: Slot) {
  const [revisions, setRevisions] = useState<DesignRevisionSummaryDto[]>([]);
  const [feedback, setFeedback] = useState<FeedbackTarget | null>(null);
  const [viewing, setViewing] = useState<FeedbackTarget | null>(null);
  // A revision that was never graded has nothing to poll: asking would only 404.
  const polling = useEvaluationPolling(
    feedback && feedback.evaluation !== null ? feedback.id : null,
  );
  const { restart: restartGrade } = polling;
  const { inFlight, recheck: recheckSlot } = slot;

  const refresh = useCallback(() => {
    void api
      .listRevisions(sessionId)
      .then((refreshed) => setRevisions([...refreshed.data].sort(byNewest)))
      .catch(() => undefined);
  }, [sessionId]);

  // When the grade for the submitted draft lands — or fails — the timeline
  // needs the fresh status, and the slot it held is asked about at once.
  const completedFor = useRef<string | null>(null);
  useEffect(() => {
    const evaluation = polling.evaluation;
    if (!evaluation || evaluation.status === 'running') return;
    const key = `${evaluation.runId}:${evaluation.iteration}`;
    if (completedFor.current === key) return;
    completedFor.current = key;
    refresh();
    recheckSlot();
  }, [polling.evaluation, refresh, recheckSlot]);

  // The slot frees when its run ends — whichever revision is on screen, the
  // timeline (and the toolbar's grade badge with it) reads the verdict then.
  const heldBefore = useRef<SessionInFlightDto | null>(null);
  useEffect(() => {
    if (heldBefore.current !== null && inFlight === null) refresh();
    heldBefore.current = inFlight;
  }, [inFlight, refresh]);

  /** The session opened on `list`, newest first: the feedback follows the author's latest. */
  const opened = useCallback((list: DesignRevisionSummaryDto[]) => {
    setRevisions(list);
    const latestUser = latestUserRevision(list);
    if (latestUser) setFeedback(toTarget(latestUser));
  }, []);

  /** The draft became `revision`: it heads the timeline, the feedback follows it, and nothing is shown read-only. */
  const submitted = useCallback((revision: DesignRevisionDto) => {
    setFeedback(toTarget(revision));
    setViewing(null);
    setRevisions((current) => [
      toSummary(revision),
      ...current.filter((candidate) => candidate.id !== revision.id),
    ]);
  }, []);

  /** `revision` is graded again from now: the feedback follows the fresh run, wherever it is shown. */
  const regraded = useCallback(
    (revision: DesignRevisionDto) => {
      const target = toTarget(revision, new Date().toISOString());
      setFeedback(target);
      setViewing((current) => (current?.id === revision.id ? target : current));
      setRevisions((current) =>
        current.map((candidate) =>
          candidate.id === revision.id ? toSummary(revision) : candidate,
        ),
      );
      restartGrade();
    },
    [restartGrade],
  );

  /** `revision` is on the canvas, read-only, and the feedback is about it. */
  const viewed = useCallback((revision: DesignRevisionDto) => {
    setViewing(toTarget(revision));
    setFeedback(toTarget(revision));
  }, []);

  /** The revision on screen became the draft: nothing is shown read-only. */
  const restored = useCallback(() => setViewing(null), []);

  // Where a revision's grade stands: the poll's word for the revision the
  // feedback follows — a grade the grader no longer has did not arrive,
  // whatever the record's last word was — and the timeline's for any other.
  const standingOfRevision = (revision: {
    id: string;
    evaluation: RevisionEvaluationRef | null;
  }): GradeStanding | null => {
    const polled = revision.id === feedback?.id;
    if (polled && polling.lost) return 'failed';
    if (polled && polling.evaluation !== null) return standingOf(polling.evaluation);
    return revision.evaluation === null ? null : cachedStandingOf(revision.evaluation);
  };

  // No grade to show for the revision on the feedback tab, and why: no run
  // was ever started for it, or the grader no longer has the one that was.
  const ungraded: UngradedReason | null =
    feedback === null
      ? null
      : feedback.evaluation === null
        ? 'never'
        : polling.lost
          ? 'lost'
          : null;

  return {
    revisions,
    feedback,
    viewing,
    polling,
    ungraded,
    standingOfRevision,
    refresh,
    opened,
    submitted,
    regraded,
    viewed,
    restored,
  };
}
