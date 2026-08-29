'use client';

import styled from '@emotion/styled';
import { INTERFACE_CAPABILITIES, type NodeKind, type Severity } from '@sysdesign/contracts';
import { transient } from '@sysdesign/design-system';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';

import type { SdNode as SdNodeModel } from '../types';
import { NODE_ICONS } from './node-icons';

const Root = styled('div', transient)<{
  $kind: NodeKind;
  $ghost: boolean;
  $selected: boolean;
  $severity: Severity | null;
}>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  min-width: 132px;
  max-width: 220px;
  padding: ${({ theme }) => `${theme.space[3]}px ${theme.space[4]}px`};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.surface};
  /* The kind's identity color as a left accent bar. */
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-left: 4px solid ${({ theme, $kind }) => theme.color.nodeKind[$kind]};
  box-shadow: ${({ theme }) => theme.shadow.sm};
  font-family: ${({ theme }) => theme.font.family.base};

  /* Selection ring and severity outline share the outline channel; a finding
     pointing at the selected node wins — that is the one being discussed. */
  outline: ${({ theme, $selected, $severity }) =>
    $severity
      ? `2px solid ${theme.color.severity[$severity].fg}`
      : $selected
        ? `2px solid ${theme.color.border.focus}`
        : 'none'};
  outline-offset: 2px;

  ${({ $ghost, theme }) =>
    $ghost
      ? `opacity: 0.6; border-style: dashed; border-left-style: solid; background: ${theme.color.bg.subtle};`
      : ''}
`;

const IconChip = styled('span', transient)<{ $kind: NodeKind }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme, $kind }) => theme.color.nodeKind[$kind]};
  color: ${({ theme, $kind }) => theme.color.nodeKindFg[$kind]};
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
`;

const Label = styled.span`
  font-size: ${({ theme }) => theme.font.size.md};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.text.primary};
  line-height: ${({ theme }) => theme.font.lineHeight.tight};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Meta = styled.span`
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.text.muted};
  /* One line, however much the node declares — the panel holds the detail. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

function SdNodeComponent({ id, data, selected }: NodeProps<SdNodeModel>) {
  const configCount = data.config ? Object.keys(data.config).length : 0;
  const severity = data.severity ?? null;

  // Declared interface, summarized in the role's own vocabulary: an api-role
  // node serves ops, a channel carries types; other roles declare nothing
  // worth counting even if stale data lingers after a kind switch.
  const role = INTERFACE_CAPABILITIES[data.kind].role;
  const opCount = data.operations?.length ?? 0;
  const roleCount = data.responsibilities?.length ?? 0;
  const opsSegment =
    opCount > 0 && (role === 'api' || role === 'channel')
      ? ` · ${opCount} ${role === 'api' ? 'ops' : 'types'}`
      : '';

  return (
    <Root
      $kind={data.kind}
      $ghost={data.ghost ?? false}
      $selected={selected ?? false}
      $severity={severity}
      data-testid={`node-${id}`}
      data-kind={data.kind}
      {...(opCount > 0 ? { 'data-op-count': opCount } : {})}
      {...(severity ? { 'data-severity': severity } : {})}
      {...(data.ghost ? { 'data-ghost': 'true' } : {})}
    >
      <Handle type="target" position={Position.Top} />
      <IconChip $kind={data.kind}>{NODE_ICONS[data.kind]}</IconChip>
      <Body>
        <Label title={data.label}>{data.label}</Label>
        <Meta>
          {data.kind}
          {opsSegment}
          {roleCount > 0 ? ` · ${roleCount} roles` : ''}
          {configCount > 0 ? ` · ${configCount} ${configCount === 1 ? 'knob' : 'knobs'}` : ''}
        </Meta>
      </Body>
      <Handle type="source" position={Position.Bottom} />
    </Root>
  );
}

/** Memoized: React Flow re-renders every node on viewport moves otherwise. */
export const SdNode = memo(SdNodeComponent);
