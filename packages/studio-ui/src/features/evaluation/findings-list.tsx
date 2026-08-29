'use client';

import styled from '@emotion/styled';
import {
  SEVERITIES,
  type FindingDto,
  type FindingSource,
  type Severity,
} from '@sysdesign/contracts';
import { Badge, Button, Heading, Stack, Text } from '@sysdesign/design-system';

export interface FindingsListProps {
  findings: FindingDto[];
  /** Called with the clicked finding — the workspace highlights its elements. */
  onSelect: (finding: FindingDto) => void;
  /** Called for findings that carry a suggested-fix patch. */
  onPreviewFix: (finding: FindingDto) => void;
}

const SOURCE_LABEL: Record<FindingSource, string> = {
  rule: 'rule',
  expectation: 'coverage',
  llm: 'ai',
};

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
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
`;

function groupBySeverity(findings: FindingDto[]): [Severity, FindingDto[]][] {
  return SEVERITIES.map(
    (severity) =>
      [severity, findings.filter((finding) => finding.severity === severity)] as [
        Severity,
        FindingDto[],
      ],
  ).filter(([, group]) => group.length > 0);
}

/**
 * Findings grouped by severity in the contract's urgency order. Clicking a
 * title highlights the affected elements on the canvas; findings with a
 * machine-readable suggestion offer a ghost preview. Presentational —
 * everything stateful arrives through props.
 */
export function FindingsList({ findings, onSelect, onPreviewFix }: FindingsListProps) {
  if (findings.length === 0) {
    return (
      <Text size="sm" tone="muted" data-testid="findings-empty">
        No findings — a clean sheet.
      </Text>
    );
  }

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
                  <Badge tone="neutral">{SOURCE_LABEL[finding.source]}</Badge>
                  <Badge tone="neutral">{finding.dimension}</Badge>
                </BadgeRow>
                <TitleButton type="button" onClick={() => onSelect(finding)}>
                  {finding.title}
                </TitleButton>
                <Text size="sm" tone="secondary">
                  {finding.message}
                </Text>
                {finding.suggestion ? (
                  <div>
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => onPreviewFix(finding)}
                      data-testid={`preview-fix-${finding.id}`}
                    >
                      Preview fix
                    </Button>
                  </div>
                ) : null}
              </Item>
            ))}
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}
