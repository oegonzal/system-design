'use client';

import { css, keyframes } from '@emotion/react';
import styled from '@emotion/styled';
import type { EdgeKind, Severity } from '@sysdesign/contracts';
import { transient } from '@sysdesign/design-system';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';

import type { SdEdge as SdEdgeModel } from '../types';

/** Async edges drift their dashes — data flowing, not a call waiting. */
const dashFlow = keyframes`
  to { stroke-dashoffset: -24; }
`;

/* `css` rather than a string: a stringified Keyframes is never registered. */
const flowing = css`
  animation: ${dashFlow} 1.4s linear infinite;
`;
const still = css`
  animation: none;
`;

const EdgeGroup = styled('g', transient)<{
  $kind: EdgeKind;
  $ghost: boolean;
  $severity: Severity | null;
}>`
  .react-flow__edge-path {
    stroke: ${({ theme, $ghost, $severity }) =>
      $severity
        ? theme.color.severity[$severity].fg
        : $ghost
          ? theme.color.text.muted
          : theme.color.border.default};
    stroke-width: ${({ $severity }) => ($severity ? 2.5 : 1.5)};
    ${({ $kind }) => ($kind === 'async' ? 'stroke-dasharray: 7 5;' : '')}
    ${({ $ghost }) => ($ghost ? 'stroke-dasharray: 3 4; opacity: 0.6;' : '')}
    /* Infinite animation, so the motion level gates it on/off rather than by
       duration — same policy as Spinner. The OS preference wins in CSS too. */
    ${({ theme, $kind, $ghost }) =>
      $kind === 'async' && !$ghost && theme.motion.level === 'full' ? flowing : still}
  }

  ${({ theme }) => theme.media.reducedMotion} {
    .react-flow__edge-path {
      animation: none;
    }
  }
`;

const LabelChip = styled.div`
  position: absolute;
  pointer-events: all;
  padding: 1px ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  color: ${({ theme }) => theme.color.text.secondary};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-family: ${({ theme }) => theme.font.family.base};
`;

function SdEdgeComponent(props: EdgeProps<SdEdgeModel>) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    label,
    markerEnd,
  } = props;

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const kind = data?.kind ?? 'sync';
  const ghost = data?.ghost ?? false;
  const severity = data?.severity ?? null;

  return (
    <EdgeGroup
      $kind={kind}
      $ghost={ghost}
      $severity={severity}
      data-testid={`edge-${id}`}
      data-kind={kind}
      {...(severity ? { 'data-severity': severity } : {})}
      {...(ghost ? { 'data-ghost': 'true' } : {})}
    >
      <BaseEdge id={id} path={path} markerEnd={markerEnd} />
      {typeof label === 'string' && label.length > 0 ? (
        <EdgeLabelRenderer>
          <LabelChip
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label}
          </LabelChip>
        </EdgeLabelRenderer>
      ) : null}
    </EdgeGroup>
  );
}

export const SdEdge = memo(SdEdgeComponent);
