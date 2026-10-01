'use client';

import { css, keyframes, useTheme, type Theme } from '@emotion/react';
import styled from '@emotion/styled';
import type { EdgeKind, Severity } from '@sysdesign/contracts';
import { transient } from '@sysdesign/design-system';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { memo, type CSSProperties } from 'react';

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

/**
 * The line itself, as inline style on the path rather than a stylesheet rule:
 * whatever copies the diagram out of the page — the PDF export clones the
 * viewport — keeps exactly what is drawn. A finding's severity outranks the
 * selection, which outranks the resting line; async calls are dashed.
 */
export function edgeStroke(
  theme: Theme,
  { kind, severity, selected }: { kind: EdgeKind; severity: Severity | null; selected: boolean },
): CSSProperties {
  return {
    stroke: severity
      ? theme.color.severity[severity].fg
      : selected
        ? theme.color.border.focus
        : theme.color.border.default,
    strokeWidth: severity ? 2.5 : selected ? 2 : 1.5,
    ...(kind === 'async' ? { strokeDasharray: '7 5' } : {}),
  };
}

/** Only the motion lives in the stylesheet: an animation is nothing a still copy needs. */
const EdgeGroup = styled('g', transient)<{ $kind: EdgeKind }>`
  .react-flow__edge-path {
    /* Infinite animation, so the motion level gates it on/off rather than by
       duration — same policy as Spinner. The OS preference wins in CSS too. */
    ${({ theme, $kind }) => ($kind === 'async' && theme.motion.level === 'full' ? flowing : still)}
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
    selected = false,
  } = props;
  const theme = useTheme();

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const kind = data?.kind ?? 'sync';
  const severity = data?.severity ?? null;

  // The pill: carries win, the prose label is the fallback — a structured
  // declaration outranks prose. Graphs without carries render exactly as
  // they always have.
  const carries = data?.carries ?? [];
  const pill =
    carries.length > 0
      ? carries.slice(0, 3).join(' · ') + (carries.length > 3 ? ` +${carries.length - 3}` : '')
      : typeof label === 'string' && label.length > 0
        ? label
        : null;

  return (
    <EdgeGroup
      $kind={kind}
      data-testid={`edge-${id}`}
      data-kind={kind}
      {...(severity ? { 'data-severity': severity } : {})}
    >
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={edgeStroke(theme, { kind, severity, selected })}
      />
      {pill !== null ? (
        <EdgeLabelRenderer>
          <LabelChip
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {pill}
          </LabelChip>
        </EdgeLabelRenderer>
      ) : null}
    </EdgeGroup>
  );
}

export const SdEdge = memo(SdEdgeComponent);
