'use client';

import type { GeneratePromptRequest, PromptDto, PromptGenerationDto } from '@sysdesign/contracts';
import { toErrorMessage, usePolledResource } from '@sysdesign/web-kit';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../api/client';

export const GENERATION_POLL_INTERVAL_MS = 1500;

export interface PromptGenerationState {
  /** The run being followed, or null when idle. */
  runId: string | null;
  generation: PromptGenerationDto | null;
  /** True from the start request until the run ends. */
  generating: boolean;
  /** The start failed, or the run ended without a prompt. */
  error: string | null;
  /** For a LiveRegion — the consumer renders it so announcements have a home. */
  message: string;
  start(request: GeneratePromptRequest): Promise<void>;
}

function describe(
  generation: PromptGenerationDto | null,
  starting: boolean,
  error: string | null,
  unreachable: boolean,
): string {
  if (error !== null) return `Prompt generation problem: ${error}`;
  if (unreachable) return 'Cannot reach the API — retrying…';
  if (starting) return 'Starting the prompt writer…';
  if (generation === null) return '';
  switch (generation.status) {
    case 'running':
      return 'Writing a prompt from your experience…';
    case 'complete':
      return generation.prompt
        ? `Prompt ready: ${generation.prompt.title}.`
        : 'The run finished without a usable prompt.';
    case 'failed':
      return 'Prompt generation failed.';
  }
}

const fetchGeneration = (runId: string, signal: AbortSignal) =>
  api.getPromptGeneration(runId, { signal });
const isTerminal = (generation: PromptGenerationDto) => generation.status !== 'running';
const terminalError = (generation: PromptGenerationDto) =>
  generation.status === 'failed'
    ? (generation.error ?? 'Prompt generation failed.')
    : generation.prompt === null
      ? 'The run finished without a usable prompt.'
      : null;

/**
 * Start a prompt-generation run and follow it to the end: `POST` answers 202
 * with a run id, and the run is polled until the quality loop claims its
 * best draft as a prompt. `onComplete` fires once per run with that prompt —
 * the caller navigates.
 */
export function usePromptGeneration(
  onComplete: (prompt: PromptDto) => void,
): PromptGenerationState {
  const [runId, setRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const completedFor = useRef<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  const {
    resource: generation,
    error: runError,
    isPolling,
    unreachable,
  } = usePolledResource({
    key: runId,
    fetch: fetchGeneration,
    isTerminal,
    terminalError,
    intervalMs: GENERATION_POLL_INTERVAL_MS,
  });

  useEffect(() => {
    if (generation === null || generation.status !== 'complete' || generation.prompt === null) {
      return;
    }
    if (completedFor.current === generation.runId) return;
    completedFor.current = generation.runId;
    onCompleteRef.current(generation.prompt);
  }, [generation]);

  const start = useCallback(async (request: GeneratePromptRequest) => {
    setStarting(true);
    setStartError(null);
    try {
      const started = await api.startPromptGeneration(request);
      setRunId(started.runId);
    } catch (caught) {
      setStartError(toErrorMessage(caught, 'Could not start writing a prompt.'));
    } finally {
      setStarting(false);
    }
  }, []);

  const error = startError ?? runError;
  return {
    runId,
    generation,
    generating: starting || isPolling,
    error,
    message: describe(generation, starting, error, unreachable),
    start,
  };
}
