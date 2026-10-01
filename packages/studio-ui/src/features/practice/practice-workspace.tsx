'use client';

import styled from '@emotion/styled';
import {
  describeInFlight,
  type DesignRevisionDto,
  type DesignRevisionSummaryDto,
  type EvaluationFindingDto,
  type PromptDto,
  type RevisionEvaluationRef,
  type SessionInFlightDto,
} from '@sysdesign/contracts';
import {
  Alert,
  Button,
  Heading,
  Skeleton,
  Stack,
  Surface,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
} from '@sysdesign/design-system';
import {
  toErrorMessage,
  useDocumentTitle,
  useLatestRequest,
  useLeaveGuard,
} from '@sysdesign/web-kit';
import { ReactFlowProvider } from '@xyflow/react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../api/client';
import { pageTitle } from '../../app/nav';
import { LoadFailureNotice } from '../../components/load-failure-notice';
import {
  CanvasStoreProvider,
  useCanvasStore,
  useCanvasStoreApi,
} from '../canvas/canvas-store-context';
import type { DraftSaveStatus } from '../canvas/draft-status';
import { Palette } from '../canvas/palette/palette';
import { PropertiesPanel } from '../canvas/properties/properties-panel';
import { CanvasToolbar } from '../canvas/toolbar/canvas-toolbar';
import { EvaluationPanel } from '../evaluation/evaluation-panel';
import { RevisionTimeline } from '../evaluation/revision-timeline';
import { useEvaluationPolling } from '../evaluation/use-evaluation-polling';
import { useRunExport } from '../export/use-run-export';
import { earlierRunBest } from '../improve/coach-history';
import { ImprovementPanel } from '../improve/improvement-panel';
import {
  CHECKING,
  reachable,
  UNREACHABLE,
  type GraderAvailability,
} from '../improve/grader-availability';
import { useImproveRunPolling } from '../improve/use-improve-run-polling';
import { PromptPane } from '../prompts/prompt-pane';
import { usePromptCriteria } from '../prompts/use-prompt-criteria';
import { DesignBriefEditor } from './brief/design-brief-editor';
import { NarrativeEditor } from './narrative-editor';
import { useDraftAutosave } from './use-draft-autosave';
import { useSessionInFlight } from './use-session-in-flight';

function CanvasSkeleton() {
  return <Skeleton variant="block" height="480px" />;
}

/**
 * React Flow measures DOM and reads `window` at module scope — client-only by
 * nature, so the canvas loads with `ssr: false` behind a skeleton while the
 * rest of the workspace server-renders.
 */
const SdCanvasLazy = dynamic(
  () => import('../canvas/sd-canvas').then((module) => ({ default: module.SdCanvas })),
  { ssr: false, loading: CanvasSkeleton },
);

const SIDE_COLUMN_WIDTH = { md: '200px', lg: '248px' };
const DOCK_COLUMN_WIDTH = { md: '320px', lg: '380px' };
/** Floor below which the shell's Main scrolls instead of crushing the canvas. */
const WORKSPACE_MIN_HEIGHT = '640px';
/** A tall node editor may not evict the palette from the side column. */
const PROPERTIES_MAX_SHARE = '45%';

/** What the tab says before it lets an in-app navigation leave an unsaved edit behind. */
const LEAVE_WHILE_SAVING = 'Your draft is still being saved. Leave anyway?';

/**
 * What loading a revision onto the canvas costs the draft, by where the
 * autosave stands; null asks nothing. A saved draft stays on the server —
 * the session reopens on it — and only "Restore as draft" replaces it;
 * edits that have not reached the server leave the screen with nothing
 * behind them.
 */
export const LOAD_REVISION_CONFIRM: Record<DraftSaveStatus, string | null> = {
  clean: null,
  saved:
    'Load this revision read-only? Your draft stays saved — the session reopens on it, and only restoring this revision as the draft replaces it.',
  unsaved: 'Load this revision? Your latest edits are not saved yet and will be lost.',
  saving: 'Load this revision? Your latest edits are still being saved and may be lost.',
  failed: 'Load this revision? Your latest edits could not be saved and will be lost.',
};

/** An action that did not happen: what, and why in the server's words or ours. */
interface ActionError {
  title: string;
  message: string;
}

const actionError = (title: string, error: unknown, fallback: string): ActionError => ({
  title,
  message: toErrorMessage(error, fallback),
});

/**
 * Fills the shell's Main (a flex column with a definite height): shrinkable
 * past its content so the columns clamp to the viewport and scroll
 * internally. Below the Layout floor the content overflows this box and Main
 * scrolls instead — the short-window degradation.
 */
const WorkspaceRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]}px;

  ${({ theme }) => theme.media.md} {
    flex: 1 1 auto;
    min-height: 0;
  }
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${({ theme }) => theme.space[5]}px;

  /* minmax(0, 1fr) on the row plus min-height: 0 on all three grid items is
     the load-bearing pair: it lets each column shrink to the row and scroll
     internally instead of content-sizing the whole page. */
  ${({ theme }) => theme.media.md} {
    grid-template-columns: ${SIDE_COLUMN_WIDTH.md} minmax(0, 1fr) ${DOCK_COLUMN_WIDTH.md};
    grid-template-rows: minmax(0, 1fr);
    flex: 1;
    min-height: ${WORKSPACE_MIN_HEIGHT};
  }

  ${({ theme }) => theme.media.lg} {
    grid-template-columns: ${SIDE_COLUMN_WIDTH.lg} minmax(0, 1fr) ${DOCK_COLUMN_WIDTH.lg};
  }
`;

const SideColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[5]}px;
  min-height: 0;
`;

const WorkspacePalette = styled(Palette)`
  max-height: 40vh;
  max-height: 40dvh;

  ${({ theme }) => theme.media.md} {
    flex: 1 1 0;
    min-height: 0;
    max-height: none;
  }
`;

const WorkspaceProperties = styled(PropertiesPanel)`
  overflow-y: auto;

  ${({ theme }) => theme.media.md} {
    flex: 0 1 auto;
    max-height: ${PROPERTIES_MAX_SHARE};
  }
`;

const CanvasColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]}px;
  min-width: 0;
  min-height: 0;
`;

const CanvasArea = styled.div`
  display: flex;
  flex-direction: column;
  height: 60vh; /* definite height so CanvasFrame's 100% binds when stacked */
  height: 60dvh;

  ${({ theme }) => theme.media.md} {
    height: auto;
    flex: 1;
    min-height: 0;
  }
`;

const Dock = styled(Surface)`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
`;

const DockTabs = styled(Tabs)`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

/**
 * Six tabs in a narrow dock: one row that scrolls sideways, never a second
 * row. The strip scrolls; the tablist inside is as wide as its tabs, so its
 * underline runs the whole row.
 */
const DockTabStrip = styled.div`
  position: relative;
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: thin;
`;

const DockTabList = styled(TabList)`
  flex-wrap: nowrap;
  min-width: max-content;

  & > [role='tab'] {
    white-space: nowrap;
  }
`;

const DockPanel = styled(TabPanel)`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-top: ${({ theme }) => theme.space[4]}px;

  /* No authored display above: it would beat the UA [hidden] rule and break
     the state-preserving hide. This guard keeps the attribute honored. */
  &[hidden] {
    display: none;
  }
`;

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

/** The revision whose grade the feedback tab shows; `evaluation` null means it has none to poll. */
interface FeedbackTarget {
  id: string;
  revisionNumber: number;
  evaluation: RevisionEvaluationRef | null;
  /** When it was stored — its grade started then. */
  createdAt: string;
}

const toTarget = (revision: FeedbackTarget): FeedbackTarget => ({
  id: revision.id,
  revisionNumber: revision.revisionNumber,
  evaluation: revision.evaluation,
  createdAt: revision.createdAt,
});

/** The run a fresh submission's grade holds the session's slot with. */
const gradeSlot = (revision: DesignRevisionDto): SessionInFlightDto | null =>
  revision.evaluation === null
    ? null
    : { kind: 'grade', runId: revision.evaluation.runId, revisionNumber: revision.revisionNumber };

function toSummary(revision: DesignRevisionDto): DesignRevisionSummaryDto {
  return {
    id: revision.id,
    revisionNumber: revision.revisionNumber,
    origin: revision.origin,
    evaluation: revision.evaluation,
    createdAt: revision.createdAt,
  };
}

const byNewest = (a: DesignRevisionSummaryDto, b: DesignRevisionSummaryDto) =>
  b.revisionNumber - a.revisionNumber;

/** The newest revision the author submitted — what Submit and the toolbar's grade badge are about. */
const latestUserRevision = (
  revisions: readonly DesignRevisionSummaryDto[],
): DesignRevisionSummaryDto | null =>
  revisions.find((candidate) => candidate.origin === 'user') ?? null;

function WorkspaceInner({ sessionId }: PracticeWorkspaceProps) {
  const storeApi = useCanvasStoreApi();
  const loader = useLatestRequest();

  const [prompt, setPrompt] = useState<PromptDto | null>(null);
  const [revisions, setRevisions] = useState<DesignRevisionSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ActionError | null>(null);
  const [feedback, setFeedback] = useState<FeedbackTarget | null>(null);
  const [viewingRevision, setViewingRevision] = useState<FeedbackTarget | null>(null);
  const [tab, setTab] = useState('prompt');
  const [exporting, setExporting] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [startingImprove, setStartingImprove] = useState(false);
  const [availability, setAvailability] = useState<GraderAvailability>(CHECKING);

  const promptCriteria = usePromptCriteria(prompt);
  const { criteria } = promptCriteria;
  // A legacy revision has nothing to poll: asking would only 404.
  const polling = useEvaluationPolling(
    feedback && feedback.evaluation !== null ? feedback.id : null,
  );
  const improve = useImproveRunPolling(sessionId, activeRunId);
  const { inFlight, hold: holdSlot, recheck: recheckSlot } = useSessionInFlight(sessionId);
  const exportRun = useRunExport();
  const canvasEmpty = useCanvasStore((state) => state.nodes.length === 0);
  const completedFor = useRef<string | null>(null);
  const acceptedSeen = useRef(0);
  const readOnly = viewingRevision !== null;
  const promptArchived = prompt?.status === 'archived';
  // The draft is the author's only while it is on screen and the page is up.
  const autosave = useDraftAutosave(sessionId, storeApi, !readOnly && !loading);
  useLeaveGuard(autosave.pending, LEAVE_WHILE_SAVING);
  useDocumentTitle(prompt ? pageTitle(prompt.title) : null);

  // The store is the one read-only switch: every control that edits the
  // canvas, the palette, the properties, the brief and the narrative reads it,
  // and every edit action refuses while it is set.
  useEffect(() => {
    storeApi.getState().setReadOnly(readOnly);
  }, [readOnly, storeApi]);

  // The selected tab stays in view however it was chosen — a submit opens
  // Feedback from code — by scrolling the strip sideways, never the page.
  const tabStrip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = tabStrip.current;
    const selected = strip?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!strip || !selected) return;
    const start = selected.offsetLeft;
    const end = start + selected.offsetWidth;
    if (start < strip.scrollLeft) strip.scrollLeft = start;
    else if (end > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = end - strip.clientWidth;
  }, [tab]);

  // Initial load: session → prompt + revision summaries + coaching runs → the
  // canvas. A saved draft comes back ahead of any revision — it is the
  // author's latest work; without one the latest revision the author wrote
  // loads (the coach's revisions load only when chosen). The newest coaching
  // run is polled again from here, so a reload mid-coach picks it back up.
  useEffect(() => {
    const { id, signal } = loader.begin();
    void (async () => {
      try {
        const loadedSession = await api.getSession(sessionId, { signal });
        const [loadedPrompt, loadedRevisions, coachingRuns] = await Promise.all([
          api.getPrompt(loadedSession.promptId, { signal }),
          api.listRevisions(sessionId, { signal }),
          api.listImproveRuns(sessionId, { signal }),
        ]);
        const sorted = [...loadedRevisions.data].sort(byNewest);
        const latestUser = sorted.find((candidate) => candidate.origin === 'user') ?? null;
        const draft = loadedSession.draft;
        const restored =
          draft === null && latestUser ? await api.getRevision(latestUser.id, { signal }) : null;
        if (!loader.isCurrent(id)) return;

        holdSlot(loadedSession.inFlight);
        setPrompt(loadedPrompt);
        setRevisions(sorted);
        if (draft !== null) {
          storeApi.getState().loadDraft(draft);
        } else if (restored) {
          storeApi.getState().setGraph(restored.graph);
          storeApi.getState().loadNarrative(restored.narrative);
          storeApi.getState().loadBrief(restored.brief);
        }
        if (latestUser) setFeedback(toTarget(latestUser));
        setActiveRunId(coachingRuns[0]?.runId ?? null);
        setLoading(false);
      } catch (error) {
        if (loader.isStale(id, error)) return;
        // What the read threw, kept whole: the shared notice decides whether
        // nothing lives at this address or another try could succeed.
        setLoadFailure(error);
        setLoading(false);
      }
    })();
  }, [sessionId, reloadKey]);

  const handleRetryLoad = useCallback(() => {
    setLoadFailure(null);
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  // Whether the grader — and so the coach — can run at all. A booted loop
  // always has a model; a 503 (or no answer) is "unreachable".
  useEffect(() => {
    let disposed = false;
    void api
      .gradingAvailability()
      .then((report) => {
        if (!disposed) setAvailability(reachable(report));
      })
      .catch(() => {
        if (!disposed) setAvailability(UNREACHABLE);
      });
    return () => {
      disposed = true;
    };
  }, []);

  const refreshRevisions = useCallback(() => {
    void api
      .listRevisions(sessionId)
      .then((refreshed) => setRevisions([...refreshed.data].sort(byNewest)))
      .catch(() => undefined);
  }, [sessionId]);

  // Every coach iteration imported as a revision should show in the timeline
  // as soon as the poll reports it — not minutes later at run end.
  useEffect(() => {
    if (improve.acceptedCount <= acceptedSeen.current) return;
    acceptedSeen.current = improve.acceptedCount;
    refreshRevisions();
  }, [improve.acceptedCount, refreshRevisions]);

  // When the grade for the submitted draft lands — or fails — the timeline
  // needs the fresh status, and the slot it held is asked about at once.
  useEffect(() => {
    const evaluation = polling.evaluation;
    if (!evaluation || evaluation.status === 'running') return;
    const key = `${evaluation.runId}:${evaluation.iteration}`;
    if (completedFor.current === key) return;
    completedFor.current = key;
    refreshRevisions();
    recheckSlot();
  }, [polling.evaluation, refreshRevisions, recheckSlot]);

  // A coaching run that ends writes what became of its base revision; the
  // timeline reads it back once, when the run reaches its end.
  const coachEndedFor = useRef<string | null>(null);
  useEffect(() => {
    const run = improve.run;
    if (!run || run.status === 'running' || coachEndedFor.current === run.runId) return;
    coachEndedFor.current = run.runId;
    refreshRevisions();
    recheckSlot();
  }, [improve.run, refreshRevisions, recheckSlot]);

  // The slot frees when its run ends — whichever revision is on screen, the
  // timeline (and the toolbar's grade badge with it) reads the verdict then.
  const heldBefore = useRef<SessionInFlightDto | null>(null);
  useEffect(() => {
    if (heldBefore.current !== null && inFlight === null) refreshRevisions();
    heldBefore.current = inFlight;
  }, [inFlight, refreshRevisions]);

  /** The draft as the API takes it: graph plus brief and narrative, null when nothing is claimed. */
  const readDraft = useCallback(() => {
    const state = storeApi.getState();
    return {
      graph: state.serialize(),
      brief: state.serializeBrief(criteria),
      narrative: state.serializeNarrative(criteria),
    };
  }, [storeApi, criteria]);

  // The submit clears the server's draft, so the server must hold the latest
  // one first — a save still in flight would otherwise land after the clear.
  // Once the revision exists the canvas is no longer unsubmitted work.
  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setFailure(null);
    try {
      await autosave.settle();
      const revision = await api.submitRevision(sessionId, readDraft());
      storeApi.getState().markClean();
      holdSlot(gradeSlot(revision));
      setFeedback(toTarget(revision));
      setViewingRevision(null);
      setRevisions((current) => [
        toSummary(revision),
        ...current.filter((candidate) => candidate.id !== revision.id),
      ]);
      setTab('feedback');
    } catch (error) {
      setFailure(
        actionError("Couldn't submit for grading", error, 'The revision was not submitted.'),
      );
    } finally {
      setSubmitting(false);
    }
  }, [sessionId, readDraft, autosave, storeApi, holdSlot]);

  // Export the run as one zip: the diagram as a PDF plus prompt/narrative/brief/
  // feedback/revisions each as a separate .md. Reads whatever revision is on
  // screen — the live draft, or an older revision being viewed.
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
        revisionNumber: (viewingRevision ?? feedback)?.revisionNumber ?? null,
      });
    } catch (error) {
      setFailure(actionError("Couldn't export the run", error, 'Nothing was downloaded.'));
    } finally {
      setExporting(false);
    }
  }, [
    prompt,
    criteria,
    readDraft,
    revisions,
    polling.evaluation,
    viewingRevision,
    feedback,
    exportRun,
  ]);

  // Hand the canvas to the coach. An unedited, graded revision on screen is
  // handed over as it is — the loop adopts its grade as the starting point and
  // no revision is duplicated. An edited draft is persisted as the base
  // revision first (so what the coach improved is on the record). Either way
  // the loop then revises in the background — the coach tab follows the
  // iterations.
  const handleStartImprove = useCallback(
    async (maxIterations: number) => {
      const loaded = viewingRevision ?? feedback;
      const graded =
        loaded !== null && (polling.evaluation?.status ?? loaded.evaluation?.status) === 'complete';
      const fromRevision = !storeApi.getState().dirty && loaded !== null && graded;
      const question = fromRevision
        ? `Hand revision #${loaded.revisionNumber} to the coach? Its grade is reused as the starting point.`
        : 'Hand this design to the coach? Your current draft is submitted as a revision first.';
      if (!window.confirm(question)) return;
      setStartingImprove(true);
      setFailure(null);
      try {
        let started;
        if (fromRevision) {
          started = await api.startImprove(sessionId, { baseRevisionId: loaded.id, maxIterations });
        } else {
          await autosave.settle();
          started = await api.startImprove(sessionId, { ...readDraft(), maxIterations });
        }
        acceptedSeen.current = 0;
        setActiveRunId(started.runId);
        holdSlot({
          kind: 'coach',
          runId: started.runId,
          revisionNumber: fromRevision ? loaded.revisionNumber : started.revision.revisionNumber,
        });
        if (!fromRevision) {
          storeApi.getState().markClean();
          setFeedback(toTarget(started.revision));
          setViewingRevision(null);
          setRevisions((current) => [
            toSummary(started.revision),
            ...current.filter((candidate) => candidate.id !== started.revision.id),
          ]);
        }
      } catch (error) {
        setFailure(actionError("Couldn't start the coach", error, 'The coach did not start.'));
      } finally {
        setStartingImprove(false);
      }
    },
    [
      sessionId,
      readDraft,
      storeApi,
      viewingRevision,
      feedback,
      polling.evaluation,
      autosave,
      holdSlot,
    ],
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
        setViewingRevision(toTarget(revision));
        setFeedback(toTarget(revision));
        setTab('feedback');
      } catch (error) {
        setFailure(
          actionError("Couldn't load that revision", error, 'The canvas was left as it was.'),
        );
      }
    },
    [storeApi, autosave.status],
  );

  const handleRestoreAsDraft = useCallback(() => {
    setViewingRevision(null);
    storeApi.getState().markDirty();
  }, [storeApi]);

  if (loading) {
    return (
      <Stack gap={4} aria-busy="true">
        <Skeleton variant="text" width="40%" />
        <Skeleton variant="block" height="520px" />
      </Stack>
    );
  }

  if (loadFailure !== null) {
    return (
      <LoadFailureNotice
        noun="practice session"
        error={loadFailure}
        onRetry={handleRetryLoad}
        exit={{ href: '/', label: 'Back to the dashboard' }}
      />
    );
  }

  // Submit and the toolbar's badge are about the session, not the revision on
  // screen: its newest submission, live while it is the one being polled, and
  // whatever run holds its grading slot — the server's word, or the coach
  // this tab is watching revise.
  const latest = latestUserRevision(revisions);
  const latestStatus =
    latest === null
      ? null
      : latest.id === feedback?.id && polling.evaluation !== null
        ? polling.evaluation.status
        : (latest.evaluation?.status ?? null);
  const coaching = improve.run !== null && improve.run.status === 'running' ? improve.run : null;
  const coachBase = revisions.find((candidate) => candidate.id === coaching?.baseRevisionId);
  const holder: SessionInFlightDto | null =
    inFlight ??
    (coaching !== null && coachBase !== undefined
      ? { kind: 'coach', runId: coaching.runId, revisionNumber: coachBase.revisionNumber }
      : null);
  const blockedReason = holder !== null ? describeInFlight(holder) : null;
  const earlierBest = improve.run !== null ? earlierRunBest(revisions, improve.run.runId) : null;
  const legacy = feedback !== null && feedback.evaluation === null;

  return (
    <WorkspaceRoot>
      <Heading level={1}>{prompt?.title ?? 'Practice session'}</Heading>
      <Layout>
        <SideColumn>
          <WorkspacePalette />
          <WorkspaceProperties />
        </SideColumn>

        <CanvasColumn>
          <CanvasToolbar
            onSubmit={() => void handleSubmit()}
            submitting={submitting}
            revisionStatus={latestStatus}
            revisionNumber={latest?.revisionNumber ?? null}
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
          {viewingRevision !== null ? (
            <ReadOnlyBanner data-testid="readonly-banner">
              <span>Viewing revision #{viewingRevision.revisionNumber} — read-only.</span>
              <Button variant="subtle" size="sm" onClick={handleRestoreAsDraft}>
                Restore as draft
              </Button>
            </ReadOnlyBanner>
          ) : null}
          <CanvasArea>
            <SdCanvasLazy />
          </CanvasArea>
        </CanvasColumn>

        <Dock as="aside" padding={5} aria-label="Session details">
          <DockTabs value={tab} onChange={setTab}>
            <DockTabStrip ref={tabStrip}>
              <DockTabList aria-label="Session panels">
                <Tab value="prompt">Prompt</Tab>
                <Tab value="brief">Brief</Tab>
                <Tab value="narrative">Narrative</Tab>
                <Tab value="feedback">Feedback</Tab>
                <Tab value="coach">Coach</Tab>
                <Tab value="revisions">Revisions</Tab>
              </DockTabList>
            </DockTabStrip>
            <DockPanel value="prompt">
              {prompt ? (
                <PromptPane
                  prompt={prompt}
                  criteria={criteria}
                  deriving={promptCriteria.deriving}
                  deriveError={promptCriteria.error}
                  onDerive={promptCriteria.derive}
                />
              ) : (
                <Text size="sm" tone="muted">
                  Prompt unavailable.
                </Text>
              )}
            </DockPanel>
            <DockPanel value="brief">
              <DesignBriefEditor criteria={criteria} deriving={promptCriteria.deriving} />
            </DockPanel>
            <DockPanel value="narrative">
              <NarrativeEditor criteria={criteria} />
            </DockPanel>
            <DockPanel value="feedback">
              <EvaluationPanel
                evaluation={polling.evaluation}
                error={polling.error}
                isPolling={polling.isPolling}
                message={polling.message}
                criteria={criteria}
                legacy={legacy}
                startedAt={feedback?.createdAt ?? null}
                onRetry={() => void handleSubmit()}
                onSelectFinding={handleSelectFinding}
              />
            </DockPanel>
            <DockPanel value="coach">
              <ImprovementPanel
                run={improve.run}
                error={improve.error}
                isPolling={improve.isPolling}
                message={improve.message}
                availability={availability}
                starting={startingImprove}
                canvasEmpty={canvasEmpty}
                promptArchived={promptArchived}
                blockedReason={blockedReason}
                criteria={criteria}
                earlierBest={earlierBest}
                onStart={(maxIterations) => void handleStartImprove(maxIterations)}
                onLoadRevision={(revisionId) => void handleSelectRevision({ id: revisionId })}
              />
            </DockPanel>
            <DockPanel value="revisions">
              <RevisionTimeline
                revisions={revisions}
                activeRevisionId={viewingRevision?.id ?? feedback?.id ?? null}
                onSelect={(summary) => void handleSelectRevision(summary)}
              />
            </DockPanel>
          </DockTabs>
        </Dock>
      </Layout>
    </WorkspaceRoot>
  );
}
