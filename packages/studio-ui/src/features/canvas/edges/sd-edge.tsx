'use client';

import { css, keyframes, useTheme, type Theme } from '@emotion/react';
import styled from '@emotion/styled';
import type { EdgeKind, Severity } from '@sysdesign/contracts';
import { transient } from '@sysdesign/design-system';
import { BaseEdge, EdgeLabelRenderer, useStore, type EdgeProps } from '@xyflow/react';
import { memo, useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from 'react';

import { dimmedStyle } from '../focus-style';
import type { Size } from '../geometry';
import type { SdEdge as SdEdgeModel } from '../types';
import { connectionCurve, curvePath, type Curve } from './edge-path';
import { laneOf, PARALLEL_LANE_GAP } from './parallel-edges';
import { usePillPlace } from './pill-layout';

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
 * selection, which outranks a hop of the shown path, which outranks the
 * resting line; async calls are dashed.
 */
export function edgeStroke(
  theme: Theme,
  {
    kind,
    severity,
    selected,
    onPath = false,
  }: { kind: EdgeKind; severity: Severity | null; selected: boolean; onPath?: boolean },
): CSSProperties {
  return {
    stroke: severity
      ? theme.color.severity[severity].fg
      : selected
        ? theme.color.border.focus
        : onPath
          ? theme.color.border.accent
          : theme.color.border.default,
    strokeWidth: severity ? 2.5 : selected || onPath ? 2 : 1.5,
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
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  padding: 1px ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  color: ${({ theme }) => theme.color.text.secondary};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-family: ${({ theme }) => theme.font.family.base};
`;

/** A hop's number in the shown path: the accent pair, so it reads as the path's own mark. */
const SequenceBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.6em;
  padding: 0 ${({ theme }) => theme.space[2]}px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.accent.default};
  color: ${({ theme }) => theme.color.accent.fg};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 1.6;
`;

/** The size the pill is laid out at, in flow units (unscaled by the zoom); null until it is in the page. */
function useLaidOutSize(element: HTMLElement | null, text: string): Size | null {
  const [size, setSize] = useState<Size | null>(null);
  // Before paint, so the pill is never seen on a block it is about to leave.
  useLayoutEffect(() => {
    if (element === null) return;
    const next = { width: element.offsetWidth, height: element.offsetHeight };
    setSize((current) =>
      current?.width === next.width && current.height === next.height ? current : next,
    );
  }, [element, text]);
  // And again whenever the layout changes it — a font that arrived late.
  useEffect(() => {
    if (element === null) return;
    const observer = new ResizeObserver(() => {
      const next = { width: element.offsetWidth, height: element.offsetHeight };
      setSize((current) =>
        current?.width === next.width && current.height === next.height ? current : next,
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return size;
}

/**
 * The connection's pill, centred on its line where no block and no other
 * pill is under it (`usePillPlace`). Its place is inline style on the chip,
 * like the line's stroke: a copy of the diagram (the PDF) keeps it where the
 * screen shows it.
 */
function EdgePill({
  id,
  curve,
  text,
  sequence,
  onPath,
}: {
  id: string;
  curve: Curve;
  text: string | null;
  sequence: readonly number[];
  onPath: boolean | undefined;
}) {
  const [chip, setChip] = useState<HTMLDivElement | null>(null);
  const size = useLaidOutSize(chip, `${sequence.join(',')}|${text ?? ''}`);
  const point = usePillPlace(id, curve, size);
  return (
    <EdgeLabelRenderer>
      <LabelChip
        ref={setChip}
        data-testid={`edge-pill-${id}`}
        style={{
          transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)`,
          ...dimmedStyle(onPath),
        }}
      >
        {sequence.map((ordinal) => (
          <SequenceBadge key={ordinal}>{ordinal}</SequenceBadge>
        ))}
        {text !== null ? <span>{text}</span> : null}
      </LabelChip>
    </EdgeLabelRenderer>
  );
}

function SdEdgeComponent(props: EdgeProps<SdEdgeModel>) {
  const {
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    label,
    markerStart,
    markerEnd,
    selected = false,
  } = props;
  const theme = useTheme();
  // Which lane this connection takes among those joining the same two blocks,
  // so a sync call and an async hop between one pair are two lines, not one.
  const lane = useStore((state) => laneOf(state.edges, { id, source, target }));

  const curve = useMemo(
    () =>
      connectionCurve(
        {
          source: { x: sourceX, y: sourceY },
          sourceSide: sourcePosition,
          target: { x: targetX, y: targetY },
          targetSide: targetPosition,
        },
        lane,
        PARALLEL_LANE_GAP,
      ),
    [sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, lane],
  );

  const kind = data?.kind ?? 'sync';
  const severity = data?.severity ?? null;
  // The shown path, as the store painted it: this hop's numbers and whether it is on it.
  const sequence = data?.sequence ?? [];
  const onPath = data?.onPath;

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
      style={dimmedStyle(onPath)}
      {...(severity ? { 'data-severity': severity } : {})}
      {...(onPath !== undefined ? { 'data-on-path': String(onPath) } : {})}
      {...(sequence.length > 0 ? { 'data-sequence': sequence.join(',') } : {})}
    >
      <BaseEdge
        id={id}
        path={curvePath(curve)}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={edgeStroke(theme, { kind, severity, selected, onPath: onPath === true })}
      />
      {pill !== null || sequence.length > 0 ? (
        <EdgePill id={id} curve={curve} text={pill} sequence={sequence} onPath={onPath} />
      ) : null}
    </EdgeGroup>
  );
}

export const SdEdge = memo(SdEdgeComponent);
