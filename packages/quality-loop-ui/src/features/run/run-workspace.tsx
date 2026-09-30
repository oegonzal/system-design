'use client';

import type {
  PipelineSummary,
  PromptLibraryDocumentDto,
  PromptLibraryEntryDto,
  QualityRunSummaryDto,
} from '@sysdesign/contracts';
import {
  Heading,
  LiveRegion,
  PreformattedText,
  Spinner,
  Stack,
  Surface,
  Text,
} from '@sysdesign/design-system';
import { isAbortError, toErrorMessage, useLatestRequest } from '@sysdesign/web-kit';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { api } from '../../api/client';
import { RunResults } from '../results/run-results';
import { RecentRuns } from './recent-runs';
import { RunControls } from './run-controls';
import { clampIterations, initialForm, type RunForm } from './run-form';
import { RunProgress } from './run-progress';
import { useRun } from './use-run';

interface Library {
  prompts: PromptLibraryEntryDto[];
  pipelines: PipelineSummary[];
}

const RECENT_LIMIT = 20;

/**
 * The one screen: choose a prompt and a pipeline, run, watch the exchanges
 * arrive, read the verdict — or reopen a recent run, which the URL remembers
 * as `?run=<id>`. Everything shown comes off the wire contract.
 */
export function RunWorkspace() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [form, setForm] = useState<RunForm>(() => initialForm([], []));
  const [document, setDocument] = useState<PromptLibraryDocumentDto | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [recent, setRecent] = useState<QualityRunSummaryDto[] | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const prompt = useLatestRequest();
  const run = useRun();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([api.listPrompts({ signal }), api.listPipelines({ signal })])
      .then(([prompts, pipelines]) => {
        setLibrary({ prompts, pipelines });
        setForm(initialForm(prompts, pipelines));
      })
      .catch((caught: unknown) => {
        if (!isAbortError(caught)) {
          setLibraryError(toErrorMessage(caught, 'Could not load the prompt library.'));
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (form.promptId === '') return;
    const { id, signal } = prompt.begin();
    api
      .getPrompt(form.promptId, { signal })
      .then((next) => {
        if (prompt.isCurrent(id)) {
          setDocument(next);
          setDocumentError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!prompt.isStale(id, caught)) {
          setDocumentError(toErrorMessage(caught, 'Could not load the prompt.'));
        }
      });
  }, [form.promptId, prompt]);

  // The list on mount, and again each time the followed run reaches its end.
  const status = run.run?.status ?? null;
  useEffect(() => {
    const idle = run.runId === null && status === null;
    const ended = status !== null && status !== 'running';
    if (!idle && !ended) return;
    const controller = new AbortController();
    api
      .listRuns({ limit: RECENT_LIMIT }, { signal: controller.signal })
      .then((page) => {
        setRecent(page.data);
        setRecentError(null);
      })
      .catch((caught: unknown) => {
        if (!isAbortError(caught)) {
          setRecentError(toErrorMessage(caught, 'Could not load recent runs.'));
        }
      });
    return () => controller.abort();
  }, [status, run.runId]);

  // `?run=<id>` is read once: a reload or a shared link reopens that run.
  const linkConsumed = useRef(false);
  const { select } = run;
  useEffect(() => {
    if (linkConsumed.current) return;
    linkConsumed.current = true;
    const linked = searchParams.get('run');
    if (linked) select(linked);
  }, [searchParams, select]);

  // The URL follows the run being shown.
  useEffect(() => {
    if (run.runId !== null && searchParams.get('run') !== run.runId) {
      router.replace(`?run=${encodeURIComponent(run.runId)}`);
    }
  }, [run.runId, router, searchParams]);

  const busy = run.starting || run.isPolling;

  const onRun = () => {
    if (!document) return;
    void run.start({
      pipeline: form.pipelineId,
      goal: document.markdown,
      maxIterations: clampIterations(form.iterations),
    });
  };

  return (
    <Stack gap={6}>
      <Surface as="section">
        <Stack gap={4}>
          <Heading level={2}>Choose a prompt and run</Heading>
          {library ? (
            <RunControls
              prompts={library.prompts}
              pipelines={library.pipelines}
              value={form}
              onChange={setForm}
              onRun={onRun}
              disabled={busy || document === null}
            />
          ) : libraryError ? (
            <Text tone="secondary">{libraryError}</Text>
          ) : (
            <Spinner label="Loading the library" />
          )}
          {run.startError && <Text tone="secondary">{run.startError}</Text>}
        </Stack>
      </Surface>

      {documentError && <Text tone="secondary">{documentError}</Text>}
      {document && (
        <Surface as="section">
          <PreformattedText label={document.title} text={document.markdown} />
        </Surface>
      )}

      <Surface as="section" aria-label="Recent runs">
        {recent ? (
          <RecentRuns runs={recent} activeRunId={run.runId} onSelect={run.select} />
        ) : recentError ? (
          <Text tone="secondary">{recentError}</Text>
        ) : (
          <Spinner label="Loading recent runs" />
        )}
      </Surface>

      <LiveRegion message={run.message} />
      {run.run && (
        <Surface as="section" aria-label="Run progress">
          <RunProgress run={run.run} />
        </Surface>
      )}
      {run.run?.trace && (
        <Surface as="section" aria-label="Results">
          <RunResults key={run.run.runId} trace={run.run.trace} />
        </Surface>
      )}
    </Stack>
  );
}
