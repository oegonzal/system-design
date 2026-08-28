'use client';

import styled from '@emotion/styled';
import { Heading, Surface, Text } from '@sysdesign/design-system';
import Link from 'next/link';

const Wrap = styled.div`
  max-width: 480px;
  margin: ${({ theme }) => theme.space[8]}px auto;
`;

const HomeLink = styled(Link)`
  color: ${({ theme }) => theme.color.accent.default};
  font-weight: ${({ theme }) => theme.font.weight.semibold};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 1px;
  }
`;

export default function NotFound() {
  return (
    <Wrap>
      <Surface padding={6}>
        <Heading level={1}>Page not found</Heading>
        <Text tone="secondary" style={{ marginTop: 8 }}>
          Nothing lives at this address. It may have been archived or deleted.
        </Text>
        <Text style={{ marginTop: 12 }}>
          <HomeLink href="/">Back to the dashboard</HomeLink>
        </Text>
      </Surface>
    </Wrap>
  );
}
