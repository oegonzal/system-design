'use client';

import styled from '@emotion/styled';
import { SkipLink, Stack, Text } from '@sysdesign/design-system';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';

import { useLink } from './link-context';
import { PrimaryNav } from './primary-nav';
import { ProfileSwitcher } from './profile-switcher';
import { RouteAnnouncer } from './route-announcer';

const Shell = styled.div`
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.color.bg.app};
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[5]}px;
  flex-wrap: wrap;
  padding: ${({ theme }) => `${theme.space[3]}px ${theme.space[6]}px`};
  background: ${({ theme }) => theme.color.bg.surface};
  border-bottom: 1px solid ${({ theme }) => theme.color.border.subtle};
  position: sticky;
  top: 0;
  z-index: ${({ theme }) => theme.zIndex.sticky};
`;

const BrandMark = styled.span`
  color: ${({ theme }) => theme.color.accent.default};
`;

const Main = styled.main`
  flex: 1;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space[6]}px;
  box-sizing: border-box;
`;

/** The frame every page sits in: brand, nav, the profile choice, `main`, and the route announcer. */
export function AppShell({ children }: { children?: ReactNode }) {
  const mainRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const Link = useLink();

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <Shell>
      <SkipLink href="#main">Skip to main content</SkipLink>
      <Header>
        <Stack direction="row" gap={5} align="center" wrap>
          <Link href="/" $variant="card" aria-label="Govcon home">
            <Text as="span" size="lg">
              <BrandMark>▣</BrandMark> Govcon
            </Text>
          </Link>
          <PrimaryNav />
        </Stack>
        <ProfileSwitcher />
      </Header>
      <Main id="main" ref={mainRef}>
        {children}
      </Main>
      <RouteAnnouncer />
    </Shell>
  );
}
