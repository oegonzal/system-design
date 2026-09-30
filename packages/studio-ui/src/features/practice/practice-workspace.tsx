'use client';

import styled from '@emotion/styled';
import type {
  DesignRevisionDto,
  DesignRevisionSummaryDto,
  DesignSessionDto,
  EvaluationFindingDto,
  PromptDto,
} from '@sysdesign/contracts';
import {
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
import { ApiError, toErrorMessage, useLatestRequest } from '@sysdesign/web-kit';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../api/client';
import { FullPageNotice } from '../../components/full-page-notice';
import { CanvasStoreProvider, useCanvasStoreApi } from '../canvas/canvas-store-context';
import { Palette } from '../canvas/palette/palette';
import { PropertiesPanel } from '../canvas/properties/properties-panel';
import { CanvasToolbar } from '../canvas/toolbar/canvas-toolbar';
import { EvaluationPanel } from '../evaluation/evaluation-panel';
import { RevisionTimeline } from '../evaluation/revision-timeline';
import { useEvaluationPolling } from '../evaluation/use-evaluation-polling';
import { buildAndDownloadRunZip } from '../export/export-run';
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

/** The grader could not even be asked — the coach reads it as off, without a reason. */

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

const DockPanel = styled(TabPanel)`
  flex: 1;
  min-height: 0;
  overflow-y: auto;

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

interface FeedbackTarget {
  id: string;
  revisionNumber: number;
}

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

function WorkspaceInner({ sessionId }: PracticeWorkspaceProps) {
  const storeApi = useCanvasStoreApi();
  const loader = useLatestRequest();

  const [, setSession] = useState<DesignSessionDto | null>(null);
  const [prompt, setPrompt] = useState<PromptDto | null>(null);
  const [revisions, setRevisions] = useState<DesignRevisionSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackTarget | null>(null);
  const [viewingRevision, setViewingRevision] = useState<FeedbackTarget | null>(null);
  const [tab, setTab] = useState('prompt');
  const [exporting, setExporting] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [startingImprove, setStartingImprove] = useState(false);
  const [availability, setAvailability] = useState<GraderAvailability>(CHECKING);

  const promptCriteria = usePromptCriteria(prompt);
  const { criteria } = promptCriteria;
  const polling = useEvaluationPolling(feedback?.id ?? null);
  const improve = useImproveRunPolling(sessionId, activeRunId);
  const { getNodes } = useReactFlow();
  const completedFor = useRef<string | null>(null);
  const acceptedSeen = useRef(0);

  // Initial load: session → prompt + revision summaries → latest full graph.
  useEffect(() => {
    const { id, signal } = loader.begin();
    void (async () => {
      try {
        const loadedSession = await api.getSession(sessionId, { signal });
        const [loadedPrompt, loadedRevisions] = await Promise.all([
          api.getPrompt(loadedSession.promptId, { signal }),
          api.listRevisions(sessionId, { signal }),
        ]);
        const sorted = [...loadedRevisions.data].sort(byNewest);
        const latest = sorted[0];
        const latestFull = latest ? await api.getRevision(latest.id, { signal }) : null;
        if (!loader.isCurrent(id)) return;

        setSession(loadedSession);
        setPrompt(loadedPrompt);
        setRevisions(sorted);
        if (latestFull && latest) {
          storeApi.getState().setGraph(latestFull.graph);
          storeApi.getState().loadNarrative(latestFull.narrative);
          storeApi.getState().loadBrief(latestFull.brief);
          setFeedback({ id: latest.id, revisionNumber: latest.revisionNumber });
        }
        setLoading(false);
      } catch (error) {
        if (loader.isStale(id, error)) return;
        // A 404 means the session is gone — retrying cannot help, so offer a way
        // back instead. Anything else (network, 5xx) is transient and retryable.
        if (error instanceof ApiError && error.status === 404) {
          setNotFound(true);
        } else {
          setLoadError(toErrorMessage(error, 'Could not load this practice session.'));
        }
        setLoading(false);
      }
    })();
  }, [sessionId, reloadKey]);

  const handleRetryLoad = useCallback(() => {
    setLoadError(null);
    setNotFound(false);
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

  // When the grade for the submitted draft lands, the draft is no longer
  // "unsaved work" — and the timeline needs the fresh score.
  useEffect(() => {
    const evaluation = polling.evaluation;
    if (!evaluation || evaluation.status !== 'complete') return;
    const key = `${evaluation.runId}:${evaluation.iteration}`;
    if (completedFor.current === key) return;
    completedFor.current = key;
    if (viewingRevision === null) storeApi.getState().markClean();
    refreshRevisions();
  }, [polling.evaluation, refreshRevisions, viewingRevision, storeApi]);

  /** The draft as the API takes it: graph plus brief and narrative, null when nothing is claimed. */
  const readDraft = useCallback(() => {
    const state = storeApi.getState();
    return {
      graph: state.serialize(),
      brief: state.serializeBrief(criteria),
      narrative: state.serializeNarrative(criteria),
    };
  }, [storeApi, criteria]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const revision = await api.submitRevision(sessionId, readDraft());
      setFeedback({ id: revision.id, revisionNumber: revision.revisionNumber });
      setViewingRevision(null);
      setRevisions((current) => [
        toSummary(revision),
        ...current.filter((candidate) => candidate.id !== revision.id),
      ]);
      setTab('feedback');
    } catch (error) {
      setSubmitError(toErrorMessage(error, 'Could not submit the revision.'));
    } finally {
      setSubmitting(false);
    }
  }, [sessionId, readDraft]);

  // Export the run as one zip: the diagram as a PDF plus prompt/narrative/brief/
  // feedback/revisions each as a separate .md. Reads whatever revision is on
  // screen — the live draft, or an older revision being viewed.
  const handleExport = useCallback(async () => {
    if (!prompt) return;
    setExporting(true);
    setSubmitError(null);
    try {
      await buildAndDownloadRunZip({
        prompt,
        criteria,
        ...readDraft(),
        evaluation: polling.evaluation,
        revisions,
        revisionNumber: (viewingRevision ?? feedback)?.revisionNumber ?? null,
        nodes: getNodes(),
      });
    } catch (error) {
      setSubmitError(toErrorMessage(error, 'Could not export the run.'));
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
    getNodes,
  ]);

  // Hand the current canvas to the coach: the draft is persisted as the base
  // revision (so what the coach improved is on the record), then the loop
  // revises it in the background — the coach tab follows the iterations.
  const handleStartImprove = useCallback(
    async (maxIterations: number) => {
      if (
        !window.confirm(
          'Hand this design to the coach? Your current draft is submitted as a revision first.',
        )
      ) {
        return;
      }
      setStartingImprove(true);
      setSubmitError(null);
      try {
        const started = await api.startImprove(sessionId, { ...readDraft(), maxIterations });
        acceptedSeen.current = 0;
        setActiveRunId(started.runId);
        setFeedback({ id: started.revision.id, revisionNumber: started.revision.revisionNumber });
        setViewingRevision(null);
        setRevisions((current) => [
          toSummary(started.revision),
          ...current.filter((candidate) => candidate.id !== started.revision.id),
        ]);
        storeApi.getState().markClean();
      } catch (error) {
        setSubmitError(toErrorMessage(error, 'Could not start the coach.'));
      } finally {
        setStartingImprove(false);
      }
    },
    [sessionId, readDraft, storeApi],
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
  // coach panel's bare best-revision reference.
  const handleSelectRevision = useCallback(
    async (summary: { id: string }) => {
      const { dirty } = storeApi.getState();
      if (dirty && !window.confirm('Load this revision? Your unsaved draft will be replaced.')) {
        return;
      }
      try {
        const revision = await api.getRevision(summary.id);
        storeApi.getState().setGraph(revision.graph);
        storeApi.getState().loadNarrative(revision.narrative);
        storeApi.getState().loadBrief(revision.brief);
        setViewingRevision({ id: revision.id, revisionNumber: revision.revisionNumber });
        setFeedback({ id: revision.id, revisionNumber: revision.revisionNumber });
        setTab('feedback');
      } catch (error) {
        setSubmitError(toErrorMessage(error, 'Could not load that revision.'));
      }
    },
    [storeApi],
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

  if (notFound) {
    return (
      <FullPageNotice
        title="Session not found"
        message="This practice session couldn't be found. It may have been removed, or created in a different environment."
        backHref="/"
      />
    );
  }

  if (loadError !== null) {
    return (
      <FullPageNotice
        title="Couldn't load this session"
        message={loadError}
        onRetry={handleRetryLoad}
        backHref="/"
      />
    );
  }

  const revisionStatus = feedback
    ? (polling.evaluation?.status ??
      revisions.find((candidate) => candidate.id === feedback.id)?.evaluation?.status ??
      null)
    : null;

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
            revisionStatus={revisionStatus}
            revisionNumber={feedback?.revisionNumber ?? null}
            onExport={() => void handleExport()}
            exporting={exporting}
          />
          {submitError !== null ? (
            <Text size="sm" tone="secondary" data-testid="submit-error">
              {submitError}
            </Text>
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
            <SdCanvasLazy readOnly={viewingRevision !== null} />
          </CanvasArea>
        </CanvasColumn>

        <Dock as="aside" padding={5} aria-label="Session details">
          <DockTabs value={tab} onChange={setTab}>
            <TabList aria-label="Session panels">
              <Tab value="prompt">Prompt</Tab>
              <Tab value="brief">Brief</Tab>
              <Tab value="narrative">Narrative</Tab>
              <Tab value="feedback">Feedback</Tab>
              <Tab value="coach">Coach</Tab>
              <Tab value="revisions">Revisions</Tab>
            </TabList>
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
