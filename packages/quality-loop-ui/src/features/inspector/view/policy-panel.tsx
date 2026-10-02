import { Badge, Heading, Meter, Stack, Surface, Table, Text } from '@sysdesign/design-system';

import { GATE_TONE, STEP_TONE } from '../../results/tones';
import type { DimensionRow, GateRow, PolicyNumbers, ValidatorRow } from '../model/policy-view';

/**
 * The declared policy beside what it did.
 *
 * Every number here is published — the whole decision policy, the controller's
 * factors with their parameters — and every outcome comes off the decision's own
 * trace. Nothing is recomputed: the point is to show which gate decided and
 * against which declared number, not to grade anything a second time.
 */

const pct = (value: number | null): string => (value === null ? '—' : `${value}`);

export interface PolicyPanelProps {
  numbers: PolicyNumbers;
  gates: readonly GateRow[];
  dimensions: readonly DimensionRow[];
  validators: readonly ValidatorRow[];
  /** The overall this iteration reached, for reading against the thresholds. */
  overall: number | null;
}

export function PolicyPanel({ numbers, gates, dimensions, validators, overall }: PolicyPanelProps) {
  return (
    <Stack gap={5}>
      <Surface as="section" aria-label="The declared policy">
        <Stack gap={3}>
          <Stack direction="row" gap={3} align="baseline" wrap>
            <Heading level={2}>Policy</Heading>
            {numbers.version !== null && <Badge tone="neutral">version {numbers.version}</Badge>}
          </Stack>
          <Table aria-label="Declared numbers">
            <tbody>
              <tr>
                <th scope="row">Accept at / reject below</th>
                <td>
                  {pct(numbers.acceptAt)} / {pct(numbers.rejectBelow)}
                  {overall !== null && (
                    <Text as="span" tone="muted" size="sm">
                      {' '}
                      — this iteration reached {overall}
                    </Text>
                  )}
                </td>
              </tr>
              <tr>
                <th scope="row">Agreement</th>
                <td>
                  a defect needs {pct(numbers.minHits)} samples of one lens;{' '}
                  {numbers.minAssessedShare === null
                    ? '—'
                    : `${Math.round(numbers.minAssessedShare * 100)}%`}{' '}
                  of criteria must be assessed before a score means anything
                </td>
              </tr>
              <tr>
                <th scope="row">Penalties</th>
                <td>
                  {numbers.bySeverity === null
                    ? '—'
                    : Object.entries(numbers.bySeverity)
                        .map(([severity, points]) => `${severity} ${points}`)
                        .join(', ')}{' '}
                  · each successive finding in a dimension ×{pct(numbers.decay)} · at most{' '}
                  {pct(numbers.maxPerDimension)} per dimension
                </td>
              </tr>
              <tr>
                <th scope="row">Blocking severities</th>
                <td>{numbers.blockingSeverities.join(', ') || 'none'}</td>
              </tr>
              <tr>
                <th scope="row">Loop</th>
                <td>
                  at most {pct(numbers.maxIterations)} iterations · stop after{' '}
                  {pct(numbers.plateauAfter)} without progress · {pct(numbers.concurrency)} lenses
                  at once
                </td>
              </tr>
            </tbody>
          </Table>
        </Stack>
      </Surface>

      <Surface as="section" aria-label="The gate ladder">
        <Stack gap={3}>
          <Heading level={2}>Gates, in the order they were consulted</Heading>
          <Table aria-label="Gates">
            <thead>
              <tr>
                <th>Order</th>
                <th>Factor</th>
                <th>Declared with</th>
                <th>What it did</th>
              </tr>
            </thead>
            <tbody>
              {gates.map((gate) => (
                <tr key={gate.factor}>
                  <td>{gate.order ?? '—'}</td>
                  <td>
                    <Stack direction="row" gap={2} align="center" wrap>
                      <Text as="span" size="sm">
                        {gate.factor}
                      </Text>
                      {gate.undeclared && <Badge tone="neutral">recorded by the engine</Badge>}
                      {gate.unreached && <Badge tone="low">never reached</Badge>}
                    </Stack>
                  </td>
                  <td>
                    {gate.params === null || Object.keys(gate.params).length === 0 ? (
                      <Text as="span" tone="muted" size="sm">
                        no parameters
                      </Text>
                    ) : (
                      Object.entries(gate.params)
                        .map(([name, value]) => `${name} ${String(value)}`)
                        .join(', ')
                    )}
                  </td>
                  <td>
                    <Stack direction="row" gap={2} align="center" wrap>
                      {gate.outcome !== null && (
                        <Badge tone={STEP_TONE[gate.outcome]}>{gate.outcome}</Badge>
                      )}
                      <Text as="span" tone="secondary" size="sm">
                        {gate.detail === null || gate.detail === '' ? '—' : gate.detail}
                      </Text>
                    </Stack>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Stack>
      </Surface>

      <Surface as="section" aria-label="How evidence became a number">
        <Stack gap={4}>
          <Heading level={2}>How the evidence became a number</Heading>
          {dimensions.map((dimension) => (
            <Stack key={dimension.dimension} gap={2}>
              <Stack direction="row" gap={2} align="center" wrap>
                <Heading level={3}>{dimension.dimension}</Heading>
                <Badge tone="neutral">weight {pct(dimension.declaredWeight)}</Badge>
                {dimension.weight === null && <Badge tone="low">unassessed this iteration</Badge>}
                {!dimension.earnable && (
                  <Badge tone="high">no criterion kind earns credit here</Badge>
                )}
                {dimension.score !== null && <Badge tone="accent">scored {dimension.score}</Badge>}
              </Stack>
              {dimension.score !== null && (
                <Meter value={dimension.score} label={dimension.dimension} />
              )}
              {dimension.criteria.length > 0 && (
                <Table aria-label={`${dimension.dimension} criteria`}>
                  <thead>
                    <tr>
                      <th>Criterion</th>
                      <th>Kind</th>
                      <th>Weight</th>
                      <th>Result</th>
                      <th>Earned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dimension.criteria.map((criterion) => (
                      <tr key={criterion.criterionId}>
                        <td>{criterion.criterionId}</td>
                        <td>{criterion.kind}</td>
                        <td>{criterion.weight}</td>
                        <td>{criterion.result}</td>
                        <td>{criterion.value ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              <Text tone="muted" size="sm">
                base {pct(dimension.base)} − penalties {dimension.penaltyTotal} ={' '}
                {pct(dimension.score)}
                {dimension.clampScale !== 1
                  ? ` (scaled ×${dimension.clampScale} by the clamp)`
                  : ''}
              </Text>
              {dimension.penalties.length > 0 && (
                <Table aria-label={`${dimension.dimension} penalties`}>
                  <thead>
                    <tr>
                      <th>Finding</th>
                      <th>Severity</th>
                      <th>List</th>
                      <th>After decay</th>
                      <th>Subtracted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dimension.penalties.map((penalty) => (
                      <tr key={`${penalty.key}#${penalty.position}`}>
                        <td>{penalty.key}</td>
                        <td>
                          <Badge tone={penalty.severity}>{penalty.severity}</Badge>
                        </td>
                        <td>{penalty.listPoints}</td>
                        <td>
                          {penalty.decayed}
                          <Text as="span" tone="muted" size="sm">
                            {' '}
                            (×{penalty.decay.toFixed(2)} at position {penalty.position})
                          </Text>
                        </td>
                        <td>
                          {penalty.points}
                          {penalty.clamped && (
                            <Badge tone="medium">clamped at {dimension.maxPerDimension}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              {dimension.penalisedBy.length > 0 && (
                <Text tone="muted" size="sm">
                  Penalised by: {dimension.penalisedBy.join(', ')}
                </Text>
              )}
            </Stack>
          ))}
        </Stack>
      </Surface>

      {validators.length > 0 && (
        <Surface as="section" aria-label="Validators">
          <Stack gap={3}>
            <Heading level={2}>Validators</Heading>
            <Table aria-label="Validators">
              <thead>
                <tr>
                  <th>Validator</th>
                  <th>Gate</th>
                  <th>Problems</th>
                </tr>
              </thead>
              <tbody>
                {validators.map((validator) => (
                  <tr key={validator.validatorId}>
                    <td>
                      <Stack direction="row" gap={2} align="center" wrap>
                        <Text as="span" size="sm">
                          {validator.validatorId}
                        </Text>
                        {validator.injected && <Badge tone="neutral">injected by the engine</Badge>}
                        {validator.unreported && <Badge tone="low">no report</Badge>}
                      </Stack>
                    </td>
                    <td>
                      <Badge tone={GATE_TONE[validator.gate === 'block' ? 'closed' : 'open']}>
                        {validator.gate}
                      </Badge>
                    </td>
                    <td>
                      {validator.problems.length === 0 ? (
                        <Text as="span" tone="muted" size="sm">
                          none
                        </Text>
                      ) : (
                        <Stack gap={1}>
                          {validator.problems.map((problem) => (
                            <Text key={problem.message} as="span" size="sm">
                              <Badge tone={problem.severity}>{problem.severity}</Badge>{' '}
                              {problem.message}
                            </Text>
                          ))}
                        </Stack>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Stack>
        </Surface>
      )}
    </Stack>
  );
}
