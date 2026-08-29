'use client';

import styled from '@emotion/styled';
import { SkipLink } from '@sysdesign/design-system';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import { PrimaryNav } from './primary-nav';
import { RouteAnnouncer } from './route-announcer';

const Shell = styled.div`
  height: 100vh; /* fallback for browsers without dvh */
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.color.bg.app};
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[5]}px;
  padding: ${({ theme }) => `${theme.space[4]}px ${theme.space[6]}px`};
  background: ${({ theme }) => theme.color.bg.surface};
  border-bottom: 1px solid ${({ theme }) => theme.color.border.subtle};
  position: sticky;
  top: 0;
  z-index: ${({ theme }) => theme.zIndex.sticky};
`;

const Brand = styled(Link)`
  font-family: ${({ theme }) => theme.font.family.base};
  font-size: ${({ theme }) => theme.font.size.lg};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.text.primary};
  text-decoration: none;
  white-space: nowrap;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
  }
`;

const BrandMark = styled.span`
  color: ${({ theme }) => theme.color.accent.default};
`;

/**
 * The app's single scroll container. Pages fill it by growing as flex items
 * (never by measuring chrome heights), and viewport-bounded pages like the
 * practice workspace scroll their own columns instead of this element.
 */
const Main = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space[6]}px;
  box-sizing: border-box;
`;

export interface AppShellProps {
  children?: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const mainRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  // The router resets *document* scroll on navigation, but the document no
  // longer scrolls — Main does, and it persists across client navigations.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <Shell>
      <SkipLink href="#main">Skip to main content</SkipLink>
      <Header>
        <Brand href="/">
          <BrandMark>▦</BrandMark> System Design Studio
        </Brand>
        <PrimaryNav />
      </Header>
      <Main id="main" ref={mainRef}>
        {children}
      </Main>
      <RouteAnnouncer />
    </Shell>
  );
}
