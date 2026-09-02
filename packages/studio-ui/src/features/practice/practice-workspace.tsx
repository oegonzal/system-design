'use client';

import styled from '@emotion/styled';
import type {
  DesignRevisionDto,
  DesignRevisionSummaryDto,
  DesignSessionDto,
  FindingDto,
  ImproverAvailabilityDto,
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
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api, toErrorMessage } from '../../api/client';
import { useLatestRequest } from '../../hooks/use-latest-request';
import { CanvasStoreProvider, useCanvasStoreApi } from '../canvas/canvas-store-context';
import { buildAndDownloadRunZip } from '../export/export-run';
import { Palette } from '../canvas/palette/palette';
import { PropertiesPanel } from '../canvas/properties/properties-panel';
import { CanvasToolbar } from '../canvas/toolbar/canvas-toolbar';
import { EvaluationPanel } from '../evaluation/evaluation-panel';
import { RevisionTimeline } from '../evaluation/revision-timeline';
import { useEvaluationPolling } from '../evaluation/use-evaluation-polling';
import { ImprovementPanel } from '../improve/improvement-panel';
import { useImprovementRunPolling } from '../improve/use-improvement-run-polling';
import { PromptPane } from '../prompts/prompt-pane';
import { DesignBriefEditor } from './brief/design-brief-editor';
import { useBriefSuggestions } from './brief/use-brief-suggestions';
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
    narrative: revision.narrative,
    evaluationStatus: revision.evaluation?.status ?? 'queued',
    overallScore: revision.evaluation?.overallScore ?? null,
    grade: revision.evaluation?.grade ?? null,
    createdAt: revision.createdAt,
  };
}

function WorkspaceInner({ sessionId }: PracticeWorkspaceProps) {
  const storeApi = useCanvasStoreApi();
  const loader = useLatestRequest();

  const [, setSession] = useState<DesignSessionDto | null>(null);
  const [prompt, setPrompt] = useState<PromptDto | null>(null);
  const [revisions, setRevisions] = useState<DesignRevisionSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackTarget | null>(null);
  const [viewingRevision, setViewingRevision] = useState<FeedbackTarget | null>(null);
  const [tab, setTab] = useState('prompt');
  const [exporting, setExporting] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<ImproverAvailabilityDto | null>(null);

  const polling = useEvaluationPolling(feedback?.id ?? null);
  const improve = useImprovementRunPolling(activeRunId);
  const suggestions = useBriefSuggestions(sessionId);
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
        const sorted = [...loadedRevisions.data].sort(
          (a, b) => b.revisionNumber - a.revisionNumber,
        );
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
        setLoadError(toErrorMessage(error, 'Could not load this practice session.'));
        setLoading(false);
      }
    })();
  }, [sessionId]);

  // Whether the AI coach can run at all — the button explains itself when not.
  useEffect(() => {
    let disposed = false;
    void api
      .improverAvailability()
      .then((loaded) => {
        if (!disposed) setAvailability(loaded);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, []);

  // Every accepted coach iteration is a new revision the timeline should show
  // as soon as its trajectory entry appears — not minutes later at run end.
  useEffect(() => {
    if (improve.acceptedCount <= acceptedSeen.current) return;
    acceptedSeen.current = improve.acceptedCount;
    void api
      .listRevisions(sessionId)
      .then((refreshed) =>
        setRevisions([...refreshed.data].sort((a, b) => b.revisionNumber - a.revisionNumber)),
      )
      .catch(() => undefined);
  }, [improve.acceptedCount, sessionId]);

  // When the evaluation for the submitted draft completes, the draft is no
  // longer "unsaved work" — and the timeline needs the fresh grade.
  useEffect(() => {
    const evaluation = polling.evaluation;
    if (!evaluation || evaluation.status !== 'complete') return;
    if (completedFor.current === evaluation.id) return;
    completedFor.current = evaluation.id;
    if (viewingRevision === null) storeApi.getState().markClean();
    void api
      .listRevisions(sessionId)
      .then((refreshed) =>
        setRevisions([...refreshed.data].sort((a, b) => b.revisionNumber - a.revisionNumber)),
      )
      .catch(() => undefined);
  }, [polling.evaluation, sessionId, viewingRevision]);

  const handleSubmit = useCallback(async () => {
    const graph = storeApi.getState().serialize();
    // null when nothing is claimed — an empty brief or narrative would be
    // stored as an artifact while grading exactly like silence.
    const brief = storeApi.getState().serializeBrief() ?? undefined;
    const narrative = storeApi.getState().serializeNarrative() ?? undefined;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const revision = await api.submitRevision(sessionId, {
        graph,
        narrative,
        brief,
      });
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
  }, [sessionId]);

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
        graph: storeApi.getState().serialize(),
        narrative: storeApi.getState().serializeNarrative(),
        brief: storeApi.getState().serializeBrief(),
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
  }, [prompt, revisions, polling.evaluation, viewingRevision, feedback, getNodes, storeApi]);

  const handleRetry = useCallback(() => {
    if (!feedback) return;
    void api
      .retryEvaluation(feedback.id)
      .then(() => polling.restart())
      .catch((error) => setSubmitError(toErrorMessage(error, 'Could not retry the evaluation.')));
  }, [feedback, polling]);

  // Hand the current canvas to the AI coach: the draft is submitted as a base
  // revision (so what the coach improved is on the record), then a background
  // run iterates — the coach tab streams its trajectory.
  const handleImprove = useCallback(async () => {
    if (
      !window.confirm(
        'Hand this design to the AI coach? Your current draft is submitted as a revision first.',
      )
    ) {
      return;
    }
    const graph = storeApi.getState().serialize();
    const brief = storeApi.getState().serializeBrief() ?? undefined;
    const narrative = storeApi.getState().serializeNarrative() ?? undefined;
    setSubmitError(null);
    try {
      const run = await api.startImprovementRun(sessionId, { graph, narrative, brief });
      acceptedSeen.current = 0;
      setActiveRunId(run.id);
      setFeedback(null);
      setViewingRevision(null);
      storeApi.getState().markClean();
      setTab('coach');
    } catch (error) {
      setSubmitError(toErrorMessage(error, 'Could not start the improvement run.'));
    }
  }, [sessionId, storeApi]);

  const handleCancelImprove = useCallback(() => {
    if (activeRunId === null) return;
    // The poll observes the cancelled status on its next tick and stops.
    void api
      .cancelImprovementRun(activeRunId)
      .catch((error) => setSubmitError(toErrorMessage(error, 'Could not stop the coach.')));
  }, [activeRunId]);

  const handleSelectFinding = useCallback(
    (finding: FindingDto) => {
      storeApi.getState().setHighlight({
        nodeIds: finding.affectedNodeIds,
        edgeIds: finding.affectedEdgeIds,
        severity: finding.severity,
      });
    },
    [storeApi],
  );

  const handlePreviewFix = useCallback(
    (finding: FindingDto) => {
      if (!finding.suggestion) return;
      storeApi.getState().previewPatch(finding.suggestion, finding.id);
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

  if (loadError !== null) {
    return (
      <Surface padding={6}>
        <Stack gap={3}>
          <Heading level={1}>Practice session</Heading>
          <Text tone="secondary">{loadError}</Text>
        </Stack>
      </Surface>
    );
  }

  const revisionStatus = feedback
    ? (polling.evaluation?.status ??
      revisions.find((candidate) => candidate.id === feedback.id)?.evaluationStatus ??
      null)
    : null;

  return (
    <WorkspaceRoot>
      <Heading level={1}>{prompt?.title ?? 'Practice session'}</Heading>
      <Layout>
        <SideColumn>
          <WorkspacePalette />
          <WorkspaceProperties workflowSpec={prompt?.workflowSpec ?? null} />
        </SideColumn>

        <CanvasColumn>
          <CanvasToolbar
            onSubmit={() => void handleSubmit()}
            submitting={submitting}
            revisionStatus={revisionStatus}
            revisionNumber={feedback?.revisionNumber ?? null}
            onExport={() => void handleExport()}
            exporting={exporting}
            onImprove={() => void handleImprove()}
            improving={improve.isPolling}
            improveDisabledReason={
              availability !== null && !availability.enabled
                ? availability.reason === 'deterministic'
                  ? 'The AI coach is off in deterministic mode.'
                  : 'The AI coach needs an ANTHROPIC_API_KEY.'
                : null
            }
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
                <PromptPane prompt={prompt} />
              ) : (
                <Text size="sm" tone="muted">
                  Prompt unavailable.
                </Text>
              )}
            </DockPanel>
            <DockPanel value="brief">
              {prompt ? (
                <DesignBriefEditor prompt={prompt} suggestions={suggestions} />
              ) : (
                <Text size="sm" tone="muted">
                  Prompt unavailable.
                </Text>
              )}
            </DockPanel>
            <DockPanel value="narrative">
              {prompt ? (
                <NarrativeEditor prompt={prompt} />
              ) : (
                <Text size="sm" tone="muted">
                  Prompt unavailable.
                </Text>
              )}
            </DockPanel>
            <DockPanel value="feedback">
              <EvaluationPanel
                evaluation={polling.evaluation}
                error={polling.error}
                isPolling={polling.isPolling}
                message={polling.message}
                onRetry={handleRetry}
                onSelectFinding={handleSelectFinding}
                onPreviewFix={handlePreviewFix}
              />
            </DockPanel>
            <DockPanel value="coach">
              <ImprovementPanel
                run={improve.run}
                error={improve.error}
                isPolling={improve.isPolling}
                message={improve.message}
                availability={availability}
                onCancel={handleCancelImprove}
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
