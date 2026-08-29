'use client';

import type { EvalAxisDto, ScenarioReportDto, ScenarioVerdict } from '@sysdesign/contracts';
import { Badge, Heading, Meter, Stack, Text, type BadgeTone } from '@sysdesign/design-system';

const VERDICT_TONE: Record<ScenarioVerdict, BadgeTone> = {
  survives: 'accent',
  degrades: 'medium',
  fails: 'critical',
};

export interface LlmInsightsProps {
  axes: EvalAxisDto[];
  scenarios: ScenarioReportDto[];
}

/**
 * The advisory layer: LLM-scored axes and adversarial scenario stories,
 * displayed beside the deterministic verdict and structurally unable to move
 * it — that separation is the whole point, and the caption says so.
 */
export function LlmInsights({ axes, scenarios }: LlmInsightsProps) {
  if (axes.length === 0 && scenarios.length === 0) return null;

  return (
    <Stack gap={5} data-testid="llm-insights">
      {axes.map((axis) => (
        <Stack key={axis.id} gap={3} data-testid={`axis-${axis.id}`}>
          <Heading level={3}>{axis.label}</Heading>
          {axis.score !== null ? (
            <Meter label={`${axis.label.toLowerCase()} (AI)`} value={axis.score} />
          ) : (
            <Text size="sm" tone="muted">
              Not scored — the model critic was unavailable.
            </Text>
          )}
          {axis.subScores ? (
            <Stack gap={2}>
              {Object.entries(axis.subScores).map(([name, value]) => (
                <Meter key={name} label={name} value={value} />
              ))}
            </Stack>
          ) : null}
          {axis.summary ? <Text size="sm">{axis.summary}</Text> : null}
          <Text size="sm" tone="muted">
            AI-assessed — does not affect the grade.
          </Text>
        </Stack>
      ))}

      {scenarios.length > 0 ? (
        <Stack gap={3} data-testid="scenario-reports">
          <Heading level={3}>Stress scenarios</Heading>
          {scenarios.map((report) => (
            <Stack key={report.scenarioId} gap={2} data-testid={`scenario-${report.scenarioId}`}>
              <Stack direction="row" gap={2} align="center">
                <Badge tone={VERDICT_TONE[report.verdict]}>{report.verdict}</Badge>
                <Text size="sm">{report.title}</Text>
              </Stack>
              <Text size="sm">{report.story}</Text>
            </Stack>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
