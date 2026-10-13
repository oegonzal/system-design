'use client';

import { useAction, useResource } from '@sysdesign/web-kit';

import { api } from '../../api/client';
import { SavedViewList } from './saved-view-list';

export interface SavedViewsProps {
  /** The profile whose views these are. */
  profileId: string;
  /** The page they belong to, as its path: only views of this page are listed. */
  route: string;
  /** The page as it stands, as the address a save keeps. */
  currentHref: string;
}

/** Whether an address is one of a page's: the page itself, or the page with a query. */
const isOf = (route: string, href: string): boolean =>
  href === route || href.startsWith(`${route}?`);

/**
 * The saved views of one page for one profile: read once, and read again
 * after every save or removal, each of which is one write.
 */
export function SavedViews({ profileId, route, currentHref }: SavedViewsProps) {
  const views = useResource((signal) => api.listViews(profileId, { signal }), [profileId]);
  const write = useAction(async (change: () => Promise<unknown>) => {
    await change();
    views.reload();
  });
  return (
    <SavedViewList
      views={(views.data ?? []).filter((view) => isOf(route, view.href))}
      currentHref={currentHref}
      onSave={(name) => void write.run(() => api.saveView(profileId, { name, href: currentHref }))}
      onRemove={(id) => void write.run(() => api.removeView(id))}
      busy={write.pending}
      error={write.error ?? views.error}
    />
  );
}
