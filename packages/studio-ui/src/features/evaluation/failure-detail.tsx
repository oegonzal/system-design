'use client';

import styled from '@emotion/styled';
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  type DisclosureProps,
} from '@sysdesign/design-system';

const Fold = styled(Disclosure)`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[1]}px;
  font-size: ${({ theme }) => theme.font.size.sm};
`;

const Line = styled.p`
  margin: 0;
  overflow-wrap: anywhere;
`;

export interface FailureDetailProps extends Omit<DisclosureProps, 'children'> {
  /** The run's own word on what went wrong, verbatim — written for whoever operates the grader. */
  detail: string;
}

/**
 * What a run said about its own failure, kept but folded away. The sentence
 * beside it tells the author what happened and what to do; this line — a
 * stale heartbeat, a model that went away — is for whoever has to look into
 * it, so it is one click down, never the headline. The design system's
 * disclosure: a button that says whether the line shows and which line it
 * is, opened from the keyboard as any button is.
 */
export function FailureDetail({ detail, ...rest }: FailureDetailProps) {
  return (
    <Fold data-testid="failure-detail" {...rest}>
      <DisclosureButton variant="ghost" size="sm" data-testid="failure-detail-toggle">
        Technical details
      </DisclosureButton>
      <DisclosurePanel>
        <Line>{detail}</Line>
      </DisclosurePanel>
    </Fold>
  );
}
