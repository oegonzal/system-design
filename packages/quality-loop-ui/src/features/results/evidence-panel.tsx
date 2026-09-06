import styled from '@emotion/styled';
import type { Diagnostic, RemediationNote } from '@sysdesign/contracts';
import { Badge, Heading, Stack, Text } from '@sysdesign/design-system';

import { subjectLabel, type CriterionRow, type FindingGroup } from './select';
import { RESULT_TONE } from './tones';

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-family: ${({ theme }) => theme.font.family.base};
  font-size: ${({ theme }) => theme.font.size.sm};

  th,
  td {
    text-align: left;
    padding: ${({ theme }) => `${theme.space[2]}px ${theme.space[3]}px`};
    border-bottom: 1px solid ${({ theme }) => theme.color.border.subtle};
    vertical-align: top;
  }

  th {
    color: ${({ theme }) => theme.color.text.secondary};
    font-weight: ${({ theme }) => theme.font.weight.semibold};
  }
`;

const Item = styled.li`
  list-style: none;
  padding: ${({ theme }) => theme.space[3]}px;
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.bg.surface};
`;

const Code = styled.code`
  font-family: ${({ theme }) => theme.font.family.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
`;

export interface EvidencePanelProps {
  rows: CriterionRow[];
  groups: FindingGroup[];
  remediations: readonly RemediationNote[];
  diagnostics: readonly Diagnostic[];
}

const refs = (ids: readonly string[]): string => (ids.length > 0 ? ids.join(', ') : '—');

/** The ledger, readable: criteria against the contract, confirmed findings by severity, what to do next. */
export function EvidencePanel({ rows, groups, remediations, diagnostics }: EvidencePanelProps) {
  return (
    <Stack gap={5}>
      <Stack gap={2}>
        <Heading level={3}>Criteria</Heading>
        {rows.length === 0 ? (
          <Text tone="muted" size="sm">
            No criteria were derived.
          </Text>
        ) : (
          <Table aria-label="Criteria">
            <thead>
              <tr>
                <th>Id</th>
                <th>Kind</th>
                <th>Statement</th>
                <th>Result</th>
                <th>Hits</th>
                <th>Confidence</th>
                <th>Where</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Code>{row.id}</Code>
                  </td>
                  <td>{row.kind}</td>
                  <td>{row.statement}</td>
                  <td>
                    <Badge tone={RESULT_TONE[row.result]}>{row.result}</Badge>
                  </td>
                  <td>{row.hits}</td>
                  <td>{row.confidence ?? '—'}</td>
                  <td>{refs(row.locationRefs)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Stack>

      <Stack gap={2}>
        <Heading level={3}>Findings</Heading>
        {groups.length === 0 ? (
          <Text tone="muted" size="sm">
            No confirmed findings.
          </Text>
        ) : (
          groups.map((group) => (
            <Stack key={group.severity} gap={2}>
              <Heading level={4}>
                {group.severity} ({group.findings.length})
              </Heading>
              <Stack as="ul" gap={2} style={{ padding: 0, margin: 0 }}>
                {group.findings.map((finding) => (
                  <Item key={finding.key}>
                    <Stack gap={1}>
                      <Stack direction="row" gap={2} align="center" wrap>
                        <Badge tone={finding.severity}>{finding.severity}</Badge>
                        <Text as="span">{finding.type}</Text>
                        <Text as="span" tone="muted" size="sm">
                          at {refs(finding.locationRefs)} · {finding.fixability} · confidence{' '}
                          {finding.confidence} · {finding.hits} hit{finding.hits === 1 ? '' : 's'}{' '}
                          via {finding.lenses.join(', ')}
                          {finding.reconciledTo ? ` · charged through ${finding.reconciledTo}` : ''}
                        </Text>
                      </Stack>
                      <Text size="sm" tone={finding.note ? 'primary' : 'muted'}>
                        {finding.note
                          ? `${finding.action}: ${finding.note}`
                          : 'Not selected for remediation.'}
                      </Text>
                    </Stack>
                  </Item>
                ))}
              </Stack>
            </Stack>
          ))
        )}
      </Stack>

      {remediations.length > 0 && (
        <Stack gap={2}>
          <Heading level={3}>Remediations</Heading>
          <Stack as="ul" gap={2} style={{ padding: 0, margin: 0 }}>
            {remediations.map((remediation) => (
              <Item key={`${subjectLabel(remediation.subject)}`}>
                <Stack direction="row" gap={2} align="center" wrap>
                  <Badge tone={remediation.severity}>{remediation.action}</Badge>
                  <Text as="span">{subjectLabel(remediation.subject)}</Text>
                  <Text as="span" tone="muted" size="sm">
                    → {refs(remediation.targetRefs)}
                  </Text>
                </Stack>
                <Text size="sm">{remediation.note}</Text>
              </Item>
            ))}
          </Stack>
        </Stack>
      )}

      {diagnostics.length > 0 && (
        <Stack gap={2}>
          <Heading level={3}>Diagnostics</Heading>
          <Stack as="ul" gap={1} style={{ padding: 0, margin: 0 }}>
            {diagnostics.map((diagnostic) => (
              <li key={`${diagnostic.stage}.${diagnostic.sample ?? 0}.${diagnostic.reason}`}>
                <Text as="span" size="sm">
                  <Code>{diagnostic.stage}</Code>
                  {diagnostic.sample !== null ? ` sample ${diagnostic.sample}` : ''}:{' '}
                  {diagnostic.reason}
                  {diagnostic.detail ? ` — ${diagnostic.detail}` : ''}
                </Text>
              </li>
            ))}
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}
