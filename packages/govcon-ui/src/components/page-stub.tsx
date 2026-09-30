'use client';

import { Heading, Stack, Surface, Text } from '@sysdesign/design-system';

import { navItemFor } from '../app/nav';

/** A route the nav already names but this build does not fill yet. Replaced page by page. */
export function PageStub({ href }: { href: string }) {
  const item = navItemFor(href);
  return (
    <Surface as="section" aria-label={item?.label ?? href}>
      <Stack gap={2}>
        <Heading level={1}>{item?.label ?? href}</Heading>
        <Text tone="secondary">{item?.description ?? ''}</Text>
        <Text tone="muted" size="sm">
          This page is next in the build.
        </Text>
      </Stack>
    </Surface>
  );
}
