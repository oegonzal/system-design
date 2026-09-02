'use client';

import type {
  AxisFactorLevel,
  EvalAxisDto,
  ScenarioReportDto,
  ScenarioVerdict,
} from '@sysdesign/contracts';
import { Badge, Heading, Meter, Stack, Text, type BadgeTone } from '@sysdesign/design-system';

const VERDICT_TONE: Record<ScenarioVerdict, BadgeTone> = {
  survives: 'accent',
  degrades: 'medium',
  fails: 'critical',
};

/** Ordinal factor levels, higher-is-better direction. */
const FACTOR_TONE: Record<AxisFactorLevel, BadgeTone> = {
  none: 'critical',
  low: 'medium',
  medium: 'neutral',
  high: 'accent',
};

/** The same levels when higher is WORSE — "remaining risk: high" is bad news. */
const INVERSE_FACTOR_TONE: Record<AxisFactorLevel, BadgeTone> = {
  none: 'accent',
  low: 'neutral',
  medium: 'medium',
  high: 'critical',
};

/** Subscore keys arrive camelCased from the engine; readers get words. */
function humanizeSubScore(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

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
          {axis.factors ? (
            // An evaluator that answered in ordinals: level + the rationale
            // that earned it. The meters would repeat the same information
            // with less of it, so factors replace them.
            <Stack gap={2}>
              {axis.factors.map((factor) => (
                <Stack key={factor.id} gap={1} data-testid={`factor-${factor.id}`}>
                  <Stack direction="row" gap={2} align="center">
                    <Badge
                      tone={
                        (factor.polarity === 'higher-is-worse' ? INVERSE_FACTOR_TONE : FACTOR_TONE)[
                          factor.level
                        ]
                      }
                    >
                      {factor.level}
                    </Badge>
                    <Text as="span" size="sm">
                      {factor.label}
                    </Text>
                  </Stack>
                  <Text size="sm" tone="muted">
                    {factor.rationale}
                  </Text>
                </Stack>
              ))}
            </Stack>
          ) : axis.subScores ? (
            <Stack gap={2}>
              {Object.entries(axis.subScores).map(([name, value]) => (
                <Meter key={name} label={humanizeSubScore(name)} value={value} />
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
