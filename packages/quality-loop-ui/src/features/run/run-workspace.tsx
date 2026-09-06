'use client';

import type {
  PipelineSummary,
  PromptLibraryDocumentDto,
  PromptLibraryEntryDto,
} from '@sysdesign/contracts';
import { Heading, LiveRegion, Spinner, Stack, Surface, Text } from '@sysdesign/design-system';
import { isAbortError, toErrorMessage, useLatestRequest } from '@sysdesign/web-kit';
import { useEffect, useState } from 'react';

import { api } from '../../api/client';
import { PrewrapText } from '../../components/prewrap-text';
import { RunResults } from '../results/run-results';
import { RunControls } from './run-controls';
import { clampIterations, initialForm, type RunForm } from './run-form';
import { RunProgress } from './run-progress';
import { useRun } from './use-run';

interface Library {
  prompts: PromptLibraryEntryDto[];
  pipelines: PipelineSummary[];
}

/**
 * The one screen: choose a prompt and a pipeline, run, watch the exchanges
 * arrive, read the verdict. Everything shown comes off the wire contract.
 */
export function RunWorkspace() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [form, setForm] = useState<RunForm>(() => initialForm([], []));
  const [document, setDocument] = useState<PromptLibraryDocumentDto | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const prompt = useLatestRequest();
  const run = useRun();

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
          <PrewrapText label={document.title} text={document.markdown} />
        </Surface>
      )}

      <LiveRegion message={run.message} />
      {run.run && (
        <Surface as="section">
          <RunProgress run={run.run} />
        </Surface>
      )}
      {run.run?.trace && (
        <Surface as="section">
          <RunResults key={run.run.runId} trace={run.run.trace} />
        </Surface>
      )}
    </Stack>
  );
}
