'use client';

import styled from '@emotion/styled';
import {
  proseLocations,
  SEVERITIES,
  type EvaluationFindingDto,
  type Severity,
  type SuccessCriterion,
} from '@sysdesign/contracts';
import { Badge, Heading, Stack, Text } from '@sysdesign/design-system';

import { humanizeToken, lensName } from './humanize';
import { lensProse } from './lens-prose';
import { WrappingText } from './wrapping-text';

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
  overflow-wrap: anywhere;

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

/** Why a reconciled finding costs no points of its own: the criterion already charges it. */
const reconciledTitle = (criterionId: string, statement: string | undefined): string =>
  `Already counted against ${criterionId}${statement ? ` (${statement})` : ''}, so it is not scored twice.`;

/**
 * Confirmed findings grouped by severity in the contract's urgency order.
 * Every chip is a fact from the ledger, in words — which lenses confirmed it
 * (the lens id as its title), how sure they were, how fixable it is, which
 * criterion already counts it, which criteria it names, and where on the
 * design it points, by label rather than position — the places the lens
 * cited, which are the finding's. The type is the title. The rationale reads
 * with labels in place of the ids the lens wrote: those places and every
 * place it merely mentions (`proseLocations`), which a sentence may name
 * without the finding being about it. Clicking a title highlights the
 * affected elements on the canvas. Presentational — everything stateful
 * arrives through props.
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
            {humanizeToken(severity)} ({group.length})
          </Heading>
          <Stack as="ul" gap={0}>
            {group.map((finding) => (
              <Item key={finding.id} data-testid={`finding-${finding.id}`}>
                <BadgeRow>
                  <Badge tone={finding.severity}>{finding.severity}</Badge>
                  {finding.lenses.map((lens) => (
                    <Badge key={lens} tone="neutral" title={lens} data-testid="finding-lens">
                      {lensName(lens)}
                    </Badge>
                  ))}
                  <Badge tone="neutral">{finding.confidence} confidence</Badge>
                  <Badge tone="neutral">{humanizeToken(finding.fixability).toLowerCase()}</Badge>
                  {EXPLANATION_FINDING_TYPES.includes(finding.type) ? (
                    <Badge tone="accent" data-testid="finding-explanation">
                      Explanation
                    </Badge>
                  ) : null}
                  {finding.reconciledTo !== null ? (
                    <Badge
                      tone="neutral"
                      title={reconciledTitle(
                        finding.reconciledTo,
                        statementOf.get(finding.reconciledTo),
                      )}
                      data-testid="finding-reconciled"
                    >
                      counted against {finding.reconciledTo}
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
                <WrappingText size="sm" tone="secondary">
                  {finding.rationale !== null
                    ? lensProse(finding.rationale, proseLocations(finding))
                    : 'No rationale was recorded for this finding.'}
                </WrappingText>
                {finding.criterionIds.length > 0 || finding.locations.length > 0 ? (
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
                    {finding.locations.map((location) => (
                      <Badge
                        key={location.ref}
                        tone="neutral"
                        title={location.ref}
                        data-testid="finding-location"
                      >
                        {location.label}
                      </Badge>
                    ))}
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
