'use client';

import styled from '@emotion/styled';
import type {
  DesignRevisionDto,
  DesignRevisionSummaryDto,
  DesignSessionDto,
  FindingDto,
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
import { ReactFlowProvider } from '@xyflow/react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api, toErrorMessage } from '../../api/client';
import { useLatestRequest } from '../../hooks/use-latest-request';
import { CanvasStoreProvider, useCanvasStoreApi } from '../canvas/canvas-store-context';
import { Palette } from '../canvas/palette/palette';
import { PropertiesPanel } from '../canvas/properties/properties-panel';
import { CanvasToolbar } from '../canvas/toolbar/canvas-toolbar';
import { EvaluationPanel } from '../evaluation/evaluation-panel';
import { RevisionTimeline } from '../evaluation/revision-timeline';
import { useEvaluationPolling } from '../evaluation/use-evaluation-polling';
import { PromptPane } from '../prompts/prompt-pane';
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

  const polling = useEvaluationPolling(feedback?.id ?? null);
  const completedFor = useRef<string | null>(null);

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
    const { narrative } = storeApi.getState();
    const graph = storeApi.getState().serialize();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const revision = await api.submitRevision(sessionId, {
        graph,
        narrative: narrative.trim() || undefined,
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

  const handleRetry = useCallback(() => {
    if (!feedback) return;
    void api
      .retryEvaluation(feedback.id)
      .then(() => polling.restart())
      .catch((error) => setSubmitError(toErrorMessage(error, 'Could not retry the evaluation.')));
  }, [feedback, polling]);

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

  const handleSelectRevision = useCallback(
    async (summary: DesignRevisionSummaryDto) => {
      const { dirty } = storeApi.getState();
      if (dirty && !window.confirm('Load this revision? Your unsaved draft will be replaced.')) {
        return;
      }
      try {
        const revision = await api.getRevision(summary.id);
        storeApi.getState().setGraph(revision.graph);
        storeApi.getState().loadNarrative(revision.narrative);
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
          <WorkspaceProperties />
        </SideColumn>

        <CanvasColumn>
          <CanvasToolbar
            onSubmit={() => void handleSubmit()}
            submitting={submitting}
            revisionStatus={revisionStatus}
            revisionNumber={feedback?.revisionNumber ?? null}
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
              <Tab value="narrative">Narrative</Tab>
              <Tab value="feedback">Feedback</Tab>
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
            <DockPanel value="narrative">
              <NarrativeEditor />
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
