'use client';

import styled from '@emotion/styled';
import {
  SEVERITIES,
  type EvaluationFindingDto,
  type Severity,
  type SuccessCriterion,
} from '@sysdesign/contracts';
import { Badge, Heading, Stack, Text } from '@sysdesign/design-system';

import { humanizeToken } from './humanize';

export interface FindingsListProps {
  findings: EvaluationFindingDto[];
  /** The prompt's rubric — a criterion chip carries the statement as its title. */
  criteria?: SuccessCriterion[];
  /** Called with the clicked finding — the workspace highlights its elements. */
  onSelect: (finding: EvaluationFindingDto) => void;
}

/**
 * The finding types that are about the story told over the boxes rather than
 * the boxes: a claim the diagram does not back, a component nothing explains,
 * a narration that contradicts the drawing. Tagged so the author sees which
 * findings the Brief and Narrative tabs answer. Data, not a rule — a pipeline
 * that never emits them simply never shows the tag.
 */
const EXPLANATION_FINDING_TYPES: readonly string[] = [
  'unbacked_claim',
  'unexplained_component',
  'contradiction',
];

const NO_CRITERIA: SuccessCriterion[] = [];

const Item = styled.li`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]}px;
  padding: ${({ theme }) => theme.space[3]}px 0;
  border-bottom: 1px solid ${({ theme }) => theme.color.border.subtle};

  &:last-of-type {
    border-bottom: none;
  }
`;

const TitleButton = styled.button`
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.family.base};
  font-size: ${({ theme }) => theme.font.size.md};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.text.primary};

  &:hover {
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 1px;
  }
`;

const BadgeRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
`;

function groupBySeverity(findings: EvaluationFindingDto[]): [Severity, EvaluationFindingDto[]][] {
  return SEVERITIES.map(
    (severity) =>
      [severity, findings.filter((finding) => finding.severity === severity)] as [
        Severity,
        EvaluationFindingDto[],
      ],
  ).filter(([, group]) => group.length > 0);
}

/**
 * Confirmed findings grouped by severity in the contract's urgency order.
 * Every chip is a fact from the ledger — which lenses confirmed it, its type,
 * how sure they were, how fixable it is, which criteria it names. Clicking a
 * title highlights the affected elements on the canvas. Presentational —
 * everything stateful arrives through props.
 */
export function FindingsList({ findings, criteria = NO_CRITERIA, onSelect }: FindingsListProps) {
  if (findings.length === 0) {
    return (
      <Text size="sm" tone="muted" data-testid="findings-empty">
        No findings — a clean sheet.
      </Text>
    );
  }

  const statementOf = new Map(criteria.map((criterion) => [criterion.id, criterion.statement]));

  return (
    <Stack gap={5} data-testid="findings-list">
      {groupBySeverity(findings).map(([severity, group]) => (
        <Stack key={severity} gap={2} data-testid={`findings-group-${severity}`}>
          <Heading level={3}>
            {severity} ({group.length})
          </Heading>
          <Stack as="ul" gap={0}>
            {group.map((finding) => (
              <Item key={finding.id} data-testid={`finding-${finding.id}`}>
                <BadgeRow>
                  <Badge tone={finding.severity}>{finding.severity}</Badge>
                  {finding.lenses.map((lens) => (
                    <Badge key={lens} tone="neutral" data-testid="finding-lens">
                      {lens}
                    </Badge>
                  ))}
                  <Badge tone="neutral" data-testid="finding-type">
                    {finding.type}
                  </Badge>
                  <Badge tone="neutral">{finding.confidence} confidence</Badge>
                  <Badge tone="neutral">{humanizeToken(finding.fixability).toLowerCase()}</Badge>
                  {EXPLANATION_FINDING_TYPES.includes(finding.type) ? (
                    <Badge tone="accent" data-testid="finding-explanation">
                      Explanation
                    </Badge>
                  ) : null}
                  {finding.reconciledTo !== null ? (
                    <Badge tone="neutral" data-testid="finding-reconciled">
                      priced under {finding.reconciledTo}
                    </Badge>
                  ) : null}
                </BadgeRow>
                <TitleButton
                  type="button"
                  onClick={() => onSelect(finding)}
                  data-testid={`finding-select-${finding.id}`}
                >
                  {humanizeToken(finding.type)}
                </TitleButton>
                <Text size="sm" tone="secondary">
                  {finding.rationale ?? 'No rationale was recorded for this finding.'}
                </Text>
                {finding.criterionIds.length > 0 || finding.locationRefs.length > 0 ? (
                  <BadgeRow>
                    {finding.criterionIds.map((criterionId) => (
                      <Badge
                        key={criterionId}
                        tone="accent"
                        title={statementOf.get(criterionId)}
                        data-testid="finding-criterion"
                      >
                        {criterionId}
                      </Badge>
                    ))}
                    {finding.locationRefs.length > 0 ? (
                      <Text as="span" size="sm" tone="muted">
                        at {finding.locationRefs.join(', ')}
                      </Text>
                    ) : null}
                  </BadgeRow>
                ) : null}
              </Item>
            ))}
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}
