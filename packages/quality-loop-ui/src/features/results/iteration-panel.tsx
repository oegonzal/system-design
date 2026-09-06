import type { IterationTrace, SuccessCriterion } from '@sysdesign/contracts';
import { Badge, Heading, Meter, Stack, Text } from '@sysdesign/design-system';

import { PrewrapText } from '../../components/prewrap-text';
import { EvidencePanel } from './evidence-panel';
import { criteriaRows, dimensionRows, findingGroups, GATE_ORDER } from './select';
import { DECISION_TONE, GATE_TONE, STEP_TONE } from './tones';

export interface IterationPanelProps {
  iteration: IterationTrace;
  criteria: readonly SuccessCriterion[];
}

/** One iteration, top down: what the controller decided, the numbers behind it, the evidence, the artifact. */
export function IterationPanel({ iteration, criteria }: IterationPanelProps) {
  const { decision, ledger } = iteration;
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        <Stack direction="row" gap={3} align="center" wrap>
          <Heading level={3}>Decision</Heading>
          <Badge tone={DECISION_TONE[decision.finalDecision]}>{decision.finalDecision}</Badge>
          <Text as="span" tone="muted" size="sm">
            artifact {iteration.mode} · {iteration.durationMs} ms
          </Text>
        </Stack>
        <Text>{decision.reason}</Text>
        <Stack direction="row" gap={2} wrap aria-label="Gates">
          {GATE_ORDER.map((gate) => (
            <Badge key={gate} tone={GATE_TONE[decision.gates[gate] ? 'open' : 'closed']}>
              {gate}: {decision.gates[gate] ? 'yes' : 'no'}
            </Badge>
          ))}
        </Stack>
      </Stack>

      <Stack gap={3}>
        <Heading level={3}>Scores</Heading>
        <Meter label="Overall" value={decision.scores.overall} />
        {dimensionRows(decision).map((row) =>
          row.score === null ? (
            <Text key={row.dimension} tone="muted" size="sm">
              {row.dimension}: not assessed
            </Text>
          ) : (
            <Stack key={row.dimension} gap={1}>
              <Meter
                label={`${row.dimension}${row.weight !== null ? ` (weight ${row.weight})` : ''}`}
                value={row.score}
              />
              {row.penaltyTotal > 0 && (
                <Text tone="muted" size="sm">
                  −{row.penaltyTotal} from findings
                </Text>
              )}
            </Stack>
          ),
        )}
      </Stack>

      <Stack gap={2}>
        <Heading level={3}>How the policy decided</Heading>
        <Stack as="ol" gap={1} style={{ margin: 0, paddingLeft: 20 }}>
          {decision.trace.steps.map((step) => (
            <li key={step.order}>
              <Stack direction="row" gap={2} align="center" wrap>
                <Text as="span" size="sm">
                  {step.factor}
                </Text>
                <Badge tone={STEP_TONE[step.outcome]}>{step.outcome}</Badge>
                <Text as="span" tone="muted" size="sm">
                  {step.detail}
                </Text>
              </Stack>
            </li>
          ))}
        </Stack>
      </Stack>

      <EvidencePanel
        rows={criteriaRows(criteria, ledger.criteria)}
        groups={findingGroups(ledger.findings, iteration.remediations)}
        remediations={iteration.remediations}
        diagnostics={ledger.diagnostics}
      />

      <PrewrapText
        label="Rendered artifact"
        text={iteration.rendered ?? 'No artifact was produced.'}
      />
    </Stack>
  );
}
