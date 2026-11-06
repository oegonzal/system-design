'use client';

import { NODE_BOUNDARY_BOUND, type PlatformBoundary } from '@sysdesign/contracts';
import { Button, Stack, TextField } from '@sysdesign/design-system';

export interface BoundaryFieldProps {
  value: string;
  /** The boundary kinds the platform offers, as chips; none on a neutral prompt. */
  boundaries: readonly PlatformBoundary[];
  onChange: (next: string) => void;
}

/**
 * Where the block sits, in the author's words — a region, an account, a
 * network, a subnet, a security group. A platform's boundary kinds are
 * offered as chips that append to the text; the author says which one and
 * how it is set. The graders read it as declared, in the goal's own terms.
 */
export function BoundaryField({ value, boundaries, onChange }: BoundaryFieldProps) {
  const append = (label: string) =>
    onChange(value.trim().length === 0 ? label : `${value.trim()} · ${label}`);
  return (
    <Stack gap={2} data-testid="boundary-section">
      <TextField
        label="Boundary"
        hint="Where this block sits — a store reachable from outside, or an entry point with nothing protecting it, is a finding."
        value={value}
        maxLength={NODE_BOUNDARY_BOUND.ceiling}
        target={NODE_BOUNDARY_BOUND.target}
        placeholder="e.g. prod VPC · private subnet · sg-app, 443 from the ALB"
        data-testid="boundary-input"
        onChange={(event) => onChange(event.target.value)}
      />
      {boundaries.length > 0 ? (
        <Stack direction="row" gap={2} wrap data-testid="boundary-hints">
          {boundaries.map((boundary) => (
            <Button
              key={boundary.id}
              size="sm"
              variant="subtle"
              title={boundary.what}
              data-testid={`boundary-hint-${boundary.id}`}
              onClick={() => append(boundary.label)}
            >
              {boundary.label}
            </Button>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
