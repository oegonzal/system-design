'use client';

import styled from '@emotion/styled';
import {
  describeInFlight,
  PROMPT_COPY,
  type DesignRevisionDto,
  type EvaluationFindingDto,
  type PromptDto,
} from '@sysdesign/contracts';
import { Alert, Button, Heading, Skeleton, Stack } from '@sysdesign/design-system';
import { toErrorMessage, useDocumentTitle, useLeaveGuard } from '@sysdesign/web-kit';
import { ReactFlowProvider } from '@xyflow/react';
import { useCallback, useEffect, useState } from 'react';

import { api } from '../../api/client';
import { pageTitle } from '../../app/nav';
import { LoadFailureNotice } from '../../components/load-failure-notice';
import {
  CanvasStoreProvider,
  useCanvasStore,
  useCanvasStoreApi,
} from '../canvas/canvas-store-context';
import { CanvasToolbar } from '../canvas/toolbar/canvas-toolbar';
import type { FeedbackSubject } from '../evaluation/feedback-subject';
import { subjectGone } from '../evaluation/missing-read';
import { useRunExport } from '../export/use-run-export';
import { earlierRunBest } from '../improve/coach-history';
import { coachStart, type CoachStart } from '../improve/coach-start';
import { heartbeatOf } from '../improve/grader-availability';
import { useGraderAvailability } from '../improve/use-grader-availability';
import { usePromptCriteria } from '../prompts/use-prompt-criteria';
import { gradeSlot, latestUserRevision } from './feedback-target';
import { SessionDock } from './session-dock';
import { SubmissionStatus } from './submission-status';
import { useCoachRun } from './use-coach-run';
import { useDraftAutosave } from './use-draft-autosave';
import { slotHolder, useSessionInFlight } from './use-session-in-flight';
import { useSessionLoad } from './use-session-load';
import { useShownRevisions } from './use-shown-revisions';
import { LEAVE_WHILE_SAVING, LOAD_REVISION_CONFIRM } from './workspace-copy';
import { WorkspaceLayout } from './workspace-layout';

/** An action that did not happen: what, and why in the server's words or ours. */
interface ActionError {
  title: string;
  message: string;
}

const actionError = (title: string, error: unknown, fallback: string): ActionError => ({
  title,
  message: toErrorMessage(error, fallback),
});

const ReadOnlyBanner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[4]}px;
  padding: ${({ theme }) => `${theme.space[3]}px ${theme.space[4]}px`};
  border: 1px solid ${({ theme }) => theme.color.warn.fg};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.warn.bg};
  color: ${({ theme }) => theme.color.warn.fg};
  font-size: ${({ theme }) => theme.font.size.sm};
  font-family: ${({ theme }) => theme.font.family.base};
`;

export interface PracticeWorkspaceProps {
  sessionId: string;
}

/** Providers live one level up so every child hook finds its store. */
export function PracticeWorkspace({ sessionId }: PracticeWorkspaceProps) {
  return (
    <CanvasStoreProvider>
      <ReactFlowProvider>
        <WorkspaceInner sessionId={sessionId} />
      </ReactFlowProvider>
    </CanvasStoreProvider>
  );
}

function WorkspaceInner({ sessionId }: PracticeWorkspaceProps) {
  const storeApi = useCanvasStoreApi();

  const [prompt, setPrompt] = useState<PromptDto | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ActionError | null>(null);
  const [tab, setTab] = useState('prompt');
  const [exporting, setExporting] = useState(false);
  const [startingImprove, setStartingImprove] = useState(false);
  const [regrading, setRegrading] = useState(false);
  const availability = useGraderAvailability();

  const promptCriteria = usePromptCriteria(prompt);
  const { criteria } = promptCriteria;
  const slot = useSessionInFlight(sessionId);
  const { inFlight, hold: holdSlot, recheck: recheckSlot } = slot;
  const shown = useShownRevisions(sessionId, slot);
  const { revisions, feedback, viewing, polling, standingOfRevision } = shown;
  const { opened, submitted, regraded, viewed, restored } = shown;
  const { improve, follow: followCoach } = useCoachRun(sessionId, shown.refresh, recheckSlot);
  // The session, or the revision being graded, went away under the page —
  // whichever poll was the first to be told. One fact, one state: the page
  // is its not-found, not a grade still "running" beside a failure.
  const polledAway = polling.gone ?? slot.gone ?? improve.gone;
  const exportRun = useRunExport();
  const canvasEmpty = useCanvasStore((state) => state.nodes.length === 0);
  const readOnly = viewing !== null;
  const promptArchived = prompt?.status === 'archived';

  const load = useSessionLoad(sessionId, storeApi, (session) => {
    holdSlot(session.inFlight);
    setPrompt(session.prompt);
    opened(session.revisions);
    followCoach(session.coachingRunId);
  });
  const { fail } = load;
  // The draft is the author's only while it is on screen and the page is up
  // — and there is nowhere to save it once the session is gone, which a save
  // may be the first to find out: the hook sends no more after that.
  const autosave = useDraftAutosave(
    sessionId,
    storeApi,
    !readOnly && !load.loading && load.failure === null && polledAway === null,
  );
  const pageFailure = load.failure ?? polledAway ?? autosave.gone;
  const pageUp = !load.loading && pageFailure === null;
  useLeaveGuard(autosave.pending && pageUp, LEAVE_WHILE_SAVING);
  // Named after the prompt only while the page shows it: a dead end names itself.
  useDocumentTitle(prompt && pageFailure === null ? pageTitle(prompt.title) : null);

  // The store is the one read-only switch: every control that edits the
  // canvas, the palette, the properties, the brief and the narrative reads it,
  // and every edit action refuses while it is set.
  useEffect(() => {
    storeApi.getState().setReadOnly(readOnly);
  }, [readOnly, storeApi]);

  // An action the server refused. One that found the session itself gone is
  // not a refusal to report beside the canvas: the page has no subject left.
  const reportFailure = useCallback(
    (title: string, error: unknown, fallback: string) => {
      if (subjectGone(error) !== null) fail(error);
      else setFailure(actionError(title, error, fallback));
    },
    [fail],
  );

  /** The draft as the API takes it: graph plus brief and narrative, null when nothing is claimed. */
  const readDraft = useCallback(() => {
    const state = storeApi.getState();
    return {
      graph: state.serialize(),
      brief: state.serializeBrief(criteria),
      narrative: state.serializeNarrative(criteria),
    };
  }, [storeApi, criteria]);

  // The draft became `revision`: the canvas is no longer unsubmitted work.
  const draftSubmitted = useCallback(
    (revision: DesignRevisionDto) => {
      storeApi.getState().markClean();
      submitted(revision);
    },
    [storeApi, submitted],
  );

  // The submit clears the server's draft, so the server must hold the latest
  // one first — a save still in flight would otherwise land after the clear.
  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setFailure(null);
    try {
      await autosave.settle();
      const revision = await api.submitRevision(sessionId, readDraft());
      draftSubmitted(revision);
      holdSlot(gradeSlot(revision));
      setTab('feedback');
    } catch (error) {
      reportFailure("Couldn't submit for grading", error, 'The revision was not submitted.');
    } finally {
      setSubmitting(false);
    }
  }, [sessionId, readDraft, autosave, draftSubmitted, holdSlot, reportFailure]);

  // The way back from a grade that failed, was lost or never ran: the same
  // revision, graded again where it stands. The server starts a fresh run of
  // the stored design and repoints the revision at it — no second revision,
  // and the draft is not touched — so what changes here is only whose run the
  // feedback polls and when it started.
  const handleRegrade = useCallback(async () => {
    if (feedback === null) return;
    setRegrading(true);
    setFailure(null);
    try {
      const revision = await api.regradeRevision(feedback.id);
      holdSlot(gradeSlot(revision));
      regraded(revision);
    } catch (error) {
      reportFailure("Couldn't grade this revision again", error, 'The revision was not graded.');
    } finally {
      setRegrading(false);
    }
  }, [feedback, holdSlot, regraded, reportFailure]);

  // What the canvas shows, as a revision: the one loaded read-only, or the
  // one the feedback is about while the canvas has not been edited since it
  // was opened on it or submitted as it. Once there is a draft — restored
  // from the server, restored from a revision, or one edit old — the canvas
  // shows no revision, whichever one the feedback tab still reads.
  const canvasRevision = viewing ?? (autosave.status === 'clean' ? feedback : null);
  const canvasRevisionId = canvasRevision?.id ?? null;
  const feedbackSubject: FeedbackSubject | null =
    feedback === null
      ? null
      : {
          revisionNumber: feedback.revisionNumber,
          origin: feedback.origin,
          onCanvas: feedback.id === canvasRevisionId,
        };
  // What a coach start would hand over: the revision on the canvas, adopted,
  // when its grade is a verdict; the draft, submitted first, otherwise — or
  // nothing, when the revision's grade earned no score.
  const start: CoachStart = coachStart(
    canvasRevision === null
      ? null
      : {
          id: canvasRevision.id,
          revisionNumber: canvasRevision.revisionNumber,
          standing: standingOfRevision(canvasRevision),
        },
  );

  // Export the run as one zip: the diagram as a PDF plus prompt/narrative/brief/
  // feedback/revisions each as a separate .md. The diagram is the canvas — the
  // live draft, or a revision being viewed — and the feedback the revision the
  // tab follows; the export says which, as the tab does.
  const handleExport = useCallback(async () => {
    if (!prompt) return;
    setExporting(true);
    setFailure(null);
    try {
      await exportRun({
        prompt,
        criteria,
        ...readDraft(),
        evaluation: polling.evaluation,
        revisions,
        subject: feedbackSubject,
      });
    } catch (error) {
      setFailure(actionError("Couldn't export the run", error, 'Nothing was downloaded.'));
    } finally {
      setExporting(false);
    }
  }, [prompt, criteria, readDraft, revisions, polling.evaluation, feedbackSubject, exportRun]);

  // Hand the canvas to the coach. An unedited revision whose grade is a
  // verdict is handed over as it is — the loop adopts its grade as the
  // starting point and no revision is duplicated. An edited draft is
  // persisted as the base revision first (so what the coach improved is on
  // the record). Either way the loop then revises in the background — the
  // coach tab follows the iterations. A revision whose grade earned no score
  // is no starting point: the coach control is off and says so.
  const handleStartImprove = useCallback(
    async (maxIterations: number) => {
      if (start.from === 'refused') return;
      const question =
        start.from === 'revision'
          ? `Hand revision #${start.revisionNumber} to the coach? Its grade is reused as the starting point.`
          : 'Hand this design to the coach? Your current draft is submitted as a revision first.';
      if (!window.confirm(question)) return;
      setStartingImprove(true);
      setFailure(null);
      try {
        let started;
        if (start.from === 'revision') {
          started = await api.startImprove(sessionId, {
            baseRevisionId: start.revisionId,
            maxIterations,
          });
        } else {
          await autosave.settle();
          started = await api.startImprove(sessionId, { ...readDraft(), maxIterations });
        }
        followCoach(started.runId);
        holdSlot({
          kind: 'coach',
          runId: started.runId,
          revisionNumber:
            start.from === 'revision' ? start.revisionNumber : started.revision.revisionNumber,
          state: 'running',
        });
        if (start.from !== 'revision') draftSubmitted(started.revision);
      } catch (error) {
        reportFailure("Couldn't start the coach", error, 'The coach did not start.');
      } finally {
        setStartingImprove(false);
      }
    },
    [sessionId, readDraft, start, autosave, followCoach, holdSlot, draftSubmitted, reportFailure],
  );

  const handleSelectFinding = useCallback(
    (finding: EvaluationFindingDto) => {
      storeApi.getState().setHighlight({
        nodeIds: finding.nodeIds,
        edgeIds: finding.edgeIds,
        severity: finding.severity,
      });
    },
    [storeApi],
  );
  // Accepts anything carrying a revision id — a timeline summary, or the
  // coach panel's bare best-revision reference. What it asks first depends
  // on what the draft would lose: nothing once the server holds it.
  const handleSelectRevision = useCallback(
    async (summary: { id: string }) => {
      const question = LOAD_REVISION_CONFIRM[autosave.status];
      if (question !== null && !window.confirm(question)) return;
      setFailure(null);
      try {
        const revision = await api.getRevision(summary.id);
        storeApi.getState().setGraph(revision.graph);
        storeApi.getState().loadNarrative(revision.narrative);
        storeApi.getState().loadBrief(revision.brief);
        viewed(revision);
        setTab('feedback');
      } catch (error) {
        reportFailure("Couldn't load that revision", error, 'The canvas was left as it was.');
      }
    },
    [storeApi, autosave.status, viewed, reportFailure],
  );

  const handleRestoreAsDraft = useCallback(() => {
    restored();
    storeApi.getState().markDirty();
  }, [storeApi, restored]);

  if (load.loading) {
    return (
      <Stack gap={4} aria-busy="true">
        <Skeleton variant="text" width="40%" />
        <Skeleton variant="block" height="520px" />
      </Stack>
    );
  }

  // What the open could not read, or what went missing afterwards: the same
  // notice either way, and nothing of the workspace beside it.
  if (pageFailure !== null) {
    return (
      <LoadFailureNotice
        noun="practice session"
        error={pageFailure}
        onRetry={load.retry}
        exit={{ href: '/', label: 'Back to the dashboard' }}
      />
    );
  }

  // Submit and the submission badge are about the session, not the revision
  // on screen: its newest submission — the badge names it as that — live
  // while it is the one being polled, and whatever run holds its grading slot
  // — the server's word, or the coach this tab is watching revise.
  const latest = latestUserRevision(revisions);
  const latestStanding = latest === null ? null : standingOfRevision(latest);
  const holder = slotHolder(inFlight, improve.run, revisions);
  const blockedReason = holder !== null ? describeInFlight(holder) : null;
  const earlierBest = improve.run !== null ? earlierRunBest(revisions, improve.run.runId) : null;
  // A grade starts under the rules a submit obeys: one run per session, and none on an archived prompt.
  const gradeBlockedReason = blockedReason ?? (promptArchived ? PROMPT_COPY.archived : null);
  // The coach starts under the same slot, and never from a grade that is no verdict.
  const coachBlockedReason = blockedReason ?? (start.from === 'refused' ? start.reason : null);
  return (
    <WorkspaceLayout
      title={<Heading level={1}>{prompt?.title ?? 'Practice session'}</Heading>}
      status={
        <SubmissionStatus
          revisionNumber={latest?.revisionNumber ?? null}
          standing={latestStanding}
        />
      }
      aboveCanvas={
        <>
          <CanvasToolbar
            onSubmit={() => void handleSubmit()}
            submitting={submitting}
            grading={latestStanding === 'running'}
            promptArchived={promptArchived}
            submitBlockedReason={blockedReason}
            draftStatus={autosave.status}
            onExport={() => void handleExport()}
            exporting={exporting}
          />
          {failure !== null ? (
            <Alert tone="danger" title={failure.title} data-testid="submit-error">
              {failure.message}
            </Alert>
          ) : null}
          {viewing !== null ? (
            <ReadOnlyBanner data-testid="readonly-banner">
              <span>Viewing revision #{viewing.revisionNumber} — read-only.</span>
              <Button variant="subtle" size="sm" onClick={handleRestoreAsDraft}>
                Restore as draft
              </Button>
            </ReadOnlyBanner>
          ) : null}
        </>
      }
      dock={
        <SessionDock
          tab={tab}
          onTabChange={setTab}
          prompt={
            prompt
              ? {
                  prompt,
                  criteria,
                  deriving: promptCriteria.deriving,
                  deriveError: promptCriteria.error,
                  onDerive: promptCriteria.derive,
                }
              : null
          }
          brief={{ criteria, deriving: promptCriteria.deriving }}
          narrative={{ criteria }}
          feedback={{
            subject: feedbackSubject,
            evaluation: polling.evaluation,
            error: polling.error,
            isPolling: polling.isPolling,
            message: polling.message,
            criteria,
            ungraded: shown.ungraded,
            startedAt: feedback?.gradingSince ?? null,
            heartbeat: heartbeatOf(availability),
            onRegrade: () => void handleRegrade(),
            regrading,
            regradeBlockedReason: gradeBlockedReason,
            onSelectFinding: handleSelectFinding,
          }}
          coach={{
            run: improve.run,
            error: improve.error,
            isPolling: improve.isPolling,
            message: improve.message,
            availability,
            starting: startingImprove,
            canvasEmpty,
            promptArchived,
            blockedReason: coachBlockedReason,
            criteria,
            earlierBest,
            onStart: (maxIterations) => void handleStartImprove(maxIterations),
            onLoadRevision: (revisionId) => void handleSelectRevision({ id: revisionId }),
          }}
          timeline={{
            revisions,
            activeRevisionId: canvasRevisionId,
            feedbackRevisionId: feedback?.id ?? null,
            onSelect: (summary) => void handleSelectRevision(summary),
          }}
        />
      }
    />
  );
}
