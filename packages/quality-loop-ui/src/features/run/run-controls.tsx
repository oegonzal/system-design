'use client';

import {
  MAX_QUALITY_RUN_ITERATIONS,
  type PipelineSummary,
  type PromptLibraryEntryDto,
} from '@sysdesign/contracts';
import { Button, SelectField, Stack, TextField } from '@sysdesign/design-system';

import { clampIterations, type RunForm } from './run-form';

export interface RunControlsProps {
  prompts: readonly PromptLibraryEntryDto[];
  pipelines: readonly PipelineSummary[];
  value: RunForm;
  onChange(next: RunForm): void;
  onRun(): void;
  /** While a run is starting or in flight. */
  disabled?: boolean;
}

/** Three choices and a button; the lists are whatever the service offers. */
export function RunControls({
  prompts,
  pipelines,
  value,
  onChange,
  onRun,
  disabled = false,
}: RunControlsProps) {
  return (
    <Stack direction="row" gap={4} align="end" wrap>
      <SelectField
        label="Prompt"
        value={value.promptId}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, promptId: event.target.value })}
      >
        {prompts.map((prompt) => (
          <option key={prompt.id} value={prompt.id}>
            {prompt.title}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Pipeline"
        value={value.pipelineId}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, pipelineId: event.target.value })}
      >
        {pipelines.map((pipeline) => (
          <option key={pipeline.id} value={pipeline.id}>
            {pipeline.id}@{pipeline.version} — {pipeline.description}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Iterations"
        type="number"
        min={1}
        max={MAX_QUALITY_RUN_ITERATIONS}
        value={value.iterations}
        disabled={disabled}
        onChange={(event) =>
          onChange({ ...value, iterations: clampIterations(event.target.valueAsNumber) })
        }
      />
      <Button
        variant="solid"
        size="md"
        onClick={onRun}
        disabled={disabled || value.promptId === '' || value.pipelineId === ''}
      >
        Run
      </Button>
    </Stack>
  );
}
