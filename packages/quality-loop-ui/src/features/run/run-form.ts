import {
  DEFAULT_QUALITY_RUN_ITERATIONS,
  MAX_QUALITY_RUN_ITERATIONS,
  type PipelineSummary,
  type PromptLibraryEntryDto,
} from '@sysdesign/contracts';

/** What the person chose; the request is built from it and the chosen prompt's markdown. */
export interface RunForm {
  promptId: string;
  pipelineId: string;
  iterations: number;
}

/** The service's bounds, applied at the edge; a blank or wild number falls back to the default. */
export const clampIterations = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(MAX_QUALITY_RUN_ITERATIONS, Math.max(1, Math.trunc(value)))
    : DEFAULT_QUALITY_RUN_ITERATIONS;

/** First of each list — the service lists pipelines in registry order, prompts by id. */
export const initialForm = (
  prompts: readonly PromptLibraryEntryDto[],
  pipelines: readonly PipelineSummary[],
): RunForm => ({
  promptId: prompts[0]?.id ?? '',
  pipelineId: pipelines[0]?.id ?? '',
  iterations: DEFAULT_QUALITY_RUN_ITERATIONS,
});
