import type { ApiResponse } from '../envelope';

/** How long a view's address may be: a scope of twenty codes of each kind with every facet set fits well inside it. */
export const MAX_VIEW_HREF_LENGTH = 2000;
export const MAX_VIEW_NAME_LENGTH = 120;

/**
 * A view a profile keeps by name. A page of the client is its address — the
 * scope, the tab and each setting travel in it — so a saved view is that
 * address and nothing more, and opening one is following a link. The address
 * is a path inside the client, never another site's.
 */
export interface SavedView {
  id: string;
  profileId: string;
  name: string;
  /** A path with its query, beginning with one `/`. */
  href: string;
  createdAt: string;
  updatedAt: string;
}

/** `PUT /profiles/:id/views`: saved under its name — a name already kept takes the new address. */
export interface SaveSavedViewRequest {
  name: string;
  href: string;
}

export type ListSavedViewsResponse = ApiResponse<SavedView[]>;
export type SaveSavedViewResponse = ApiResponse<SavedView>;
