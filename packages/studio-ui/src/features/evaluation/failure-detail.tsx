'use client';

import styled from '@emotion/styled';
import type { HTMLAttributes } from 'react';

const Fold = styled.details`
  font-size: ${({ theme }) => theme.font.size.sm};
`;

const Toggle = styled.summary`
  width: fit-content;
  cursor: pointer;
  border-radius: ${({ theme }) => theme.radius.sm};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
  }
`;

const Line = styled.p`
  margin: ${({ theme }) => theme.space[1]}px 0 0;
  overflow-wrap: anywhere;
`;

export interface FailureDetailProps extends HTMLAttributes<HTMLDetailsElement> {
  /** The run's own word on what went wrong, verbatim — written for whoever operates the grader. */
  detail: string;
}

/**
 * What a run said about its own failure, kept but folded away. The sentence
 * beside it tells the author what happened and what to do; this line — a
 * stale heartbeat, a model that went away — is for whoever has to look into
 * it, so it is one click down, never the headline. A native disclosure: it
 * opens from the keyboard and reads as a collapsed group without any state
 * here. Inherits its colours from the alert it sits in.
 */
export function FailureDetail({ detail, ...rest }: FailureDetailProps) {
  return (
    <Fold data-testid="failure-detail" {...rest}>
      <Toggle>Technical details</Toggle>
      <Line>{detail}</Line>
    </Fold>
  );
}
