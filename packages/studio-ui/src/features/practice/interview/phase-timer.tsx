'use client';

import type { InterviewPhase } from '@sysdesign/contracts';
import { Badge, Text } from '@sysdesign/design-system';
import { useEffect, useState } from 'react';

export interface PhaseTimerProps {
  phase: InterviewPhase;
  /** When the phase began, by the server's clock. */
  startedAt: string;
  /** The clock, injectable so a spec can hold time still. */
  now?: () => number;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** The wall clock, named once so the default prop is a stable reference. */
const systemClock = (): number => Date.now();

/** `12:05` from a count of seconds. */
export const formatClock = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  return `${pad(Math.floor(whole / 60))}:${pad(whole % 60)}`;
};

/**
 * The phase's countdown from the server's start time against the minutes
 * the format gives it: what is left, or how far over it has run. Shown,
 * never enforced — the phase ends on its declared event.
 */
export function PhaseTimer({ phase, startedAt, now = systemClock }: PhaseTimerProps) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  void tick;
  const elapsed = (now() - new Date(startedAt).getTime()) / 1000;
  const remaining = phase.minutes * 60 - elapsed;
  const over = remaining < 0;
  return (
    <Text as="span" size="sm" tone={over ? 'secondary' : 'muted'} data-testid="phase-timer">
      <Badge tone={over ? 'medium' : 'neutral'}>{phase.label}</Badge>{' '}
      {over ? `over by ${formatClock(-remaining)}` : `${formatClock(remaining)} left`}
    </Text>
  );
}
