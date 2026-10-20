'use client';

import {
  CANVAS_CRITERION_KIND_LABELS,
  CANVAS_CRITERION_KINDS,
  PRACTICE_FORMATS,
  type CanvasCriterionKind,
  type ExperienceProfileDto,
  type PracticeFormatId,
} from '@sysdesign/contracts';
import {
  Button,
  CheckboxField,
  LiveRegion,
  SelectField,
  Spinner,
  Stack,
  Text,
} from '@sysdesign/design-system';
import { useState } from 'react';

import { FormatField } from './format-field';
import type { usePromptGeneration } from './use-prompt-generation';

export interface ComposerGenerateTabProps {
  experiences: readonly ExperienceProfileDto[];
  format: PracticeFormatId;
  onFormat: (format: PracticeFormatId) => void;
  /** The emphasised kinds preselected from a link, if any. */
  initialEmphasis: readonly CanvasCriterionKind[];
  generation: ReturnType<typeof usePromptGeneration>;
}

/**
 * Ask the quality loop's prompt writer for a prompt: from one experience or
 * the least practised, in a chosen format, leaning on the competencies the
 * author ticks. The format's own emphasis is the default; a tick adds to it,
 * and the writer reads the result as a section of its goal.
 */
export function ComposerGenerateTab({
  experiences,
  format,
  onFormat,
  initialEmphasis,
  generation,
}: ComposerGenerateTabProps) {
  const [experienceId, setExperienceId] = useState('');
  const [emphasis, setEmphasis] = useState<CanvasCriterionKind[]>([...initialEmphasis]);
  const toggle = (kind: CanvasCriterionKind) =>
    setEmphasis((current) =>
      current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind],
    );
  const defaults: readonly CanvasCriterionKind[] = PRACTICE_FORMATS[format].emphasis;

  return (
    <Stack gap={4}>
      <Text size="sm" tone="muted">
        The prompt writer drafts from your experience: the data it owned, the contracts it exposed,
        the decisions it made, with a figure only where the experience had one. Pick the format and
        the competencies to lean on; the writer is told both.
      </Text>
      <FormatField value={format} onChange={onFormat} data-testid="generate-format" />
      <SelectField
        label="Experience to draw from"
        value={experienceId}
        onChange={(event) => setExperienceId(event.target.value)}
        data-testid="generate-experience"
      >
        <option value="">Least practised</option>
        {experiences.map((experience) => (
          <option key={experience.id} value={experience.id}>
            {experience.companyLabel} — {experience.title}
          </option>
        ))}
      </SelectField>
      <Stack gap={2} role="group" aria-label="Competencies to emphasise">
        <Text as="span" size="sm" tone="secondary">
          Lean on
        </Text>
        {CANVAS_CRITERION_KINDS.map((kind) => (
          <CheckboxField
            key={kind}
            label={`${CANVAS_CRITERION_KIND_LABELS[kind]}${defaults.includes(kind) ? ' · part of this format' : ''}`}
            data-testid={`emphasis-${kind}`}
            checked={emphasis.includes(kind)}
            onChange={() => toggle(kind)}
          />
        ))}
      </Stack>
      <div>
        <Button
          variant="solid"
          onClick={() =>
            void generation.start({
              ...(experienceId ? { experienceId } : {}),
              format,
              ...(emphasis.length > 0 ? { emphasis } : {}),
            })
          }
          disabled={generation.generating}
          data-testid="generate-submit"
        >
          {generation.generating ? 'Writing…' : 'Generate prompt'}
        </Button>
      </div>
      <LiveRegion message={generation.message} />
      {generation.generating ? (
        <Stack direction="row" gap={3} align="center" data-testid="generate-progress">
          <Spinner label="" />
          <Text size="sm" tone="secondary">
            {generation.message}
          </Text>
        </Stack>
      ) : null}
    </Stack>
  );
}
