import styled from '@emotion/styled';
import { useId, type HTMLAttributes } from 'react';

import { transient } from '../../theme/styled';

export type MeterTone = 'danger' | 'warn' | 'success';

export interface MeterProps extends HTMLAttributes<HTMLDivElement> {
  /** Visible label; also the meter's accessible name via `aria-labelledby`. */
  label: string;
  /** 0–100. Clamped, not validated — a 103 from a rounding bug should render, not throw. */
  value: number;
  /**
   * Omit it and the tone follows the value — low reads as danger, high as
   * success — which is the right default for scores. Pass it explicitly when
   * the scale inverts (queue depth: high is the bad end).
   */
  tone?: MeterTone;
  /**
   * How the value is printed beside the label, and spoken as
   * `aria-valuetext`: given the clamped value, unrounded. Omit it and the
   * meter prints whole points. Pass the app's own score format so a meter
   * and every other place that prints the same score agree by construction,
   * not by both happening to round alike.
   */
  formatValue?: (value: number) => string;
}

const wholePoints = (value: number): string => String(Math.round(value));

/** Score bands: below 40 is failing, 40–69 needs work, 70+ is healthy. */
const autoTone = (value: number): MeterTone =>
  value < 40 ? 'danger' : value < 70 ? 'warn' : 'success';

const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]}px;
`;

const Row = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[4]}px;
`;

const Label = styled.span`
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.text.secondary};
`;

const Value = styled.span`
  font-size: ${({ theme }) => theme.font.size.sm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.text.primary};
  font-variant-numeric: tabular-nums;
`;

const Track = styled.div`
  height: 8px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.bg.subtle};
  overflow: hidden;
`;

/*
 * The fill borrows the intent pair's *foreground*: those are the saturated
 * ends of each pair — deep in light mode, bright in dark — so the bar clears
 * 3:1 against the subtle track in both modes without a third colour ramp.
 */
const Fill = styled('div', transient)<{ $tone: MeterTone }>`
  height: 100%;
  border-radius: inherit;
  background: ${({ theme, $tone }) => theme.color[$tone].fg};
  transition: width ${({ theme }) => theme.motion.duration.slow}
    ${({ theme }) => theme.motion.easing.emphasized};
`;

/**
 * A labeled 0–100 bar — dimension scores, an overall grade.
 *
 * `role="meter"` rather than `progressbar`: this reports a measurement, not
 * the progress of a task, and screen readers phrase the two differently.
 */
export function Meter({ label, value, tone, formatValue, ...rest }: MeterProps) {
  const labelId = useId();
  const clamped = Math.min(100, Math.max(0, value));
  const whole = Math.round(clamped);
  const printed = (formatValue ?? wholePoints)(clamped);

  return (
    <Root {...rest}>
      <Row>
        <Label id={labelId}>{label}</Label>
        <Value aria-hidden="true">{printed}</Value>
      </Row>
      <Track
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={whole}
        aria-valuetext={formatValue ? printed : undefined}
        aria-labelledby={labelId}
      >
        <Fill $tone={tone ?? autoTone(whole)} style={{ width: `${whole}%` }} />
      </Track>
    </Root>
  );
}
