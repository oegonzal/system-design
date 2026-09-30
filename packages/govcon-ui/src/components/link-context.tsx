'use client';

import { Link, type LinkProps } from '@sysdesign/design-system';
import { createContext, use, type ComponentType, type ReactNode } from 'react';

/** Anything that renders the design system's link props — the plain anchor, or Next's routed one. */
export type LinkComponent = ComponentType<LinkProps & { href: string; children?: ReactNode }>;

const LinkContext = createContext<LinkComponent>(Link);

/** The app installs its routed link once here; a story renders the plain anchor. */
export function LinkProvider({ link, children }: { link: LinkComponent; children?: ReactNode }) {
  return <LinkContext value={link}>{children}</LinkContext>;
}

export function useLink(): LinkComponent {
  return use(LinkContext);
}
