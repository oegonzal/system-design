/** What every page declares about itself for search engines and link previews. */
export interface PageMeta {
  /** The complete document title, brand included. */
  readonly title: string;
  readonly description: string;
  /** Kept out of search results — the 404 page. Such a page has no canonical URL. */
  readonly noindex?: boolean;
  /** schema.org data for this page, if it has any (only the home page does). */
  readonly structuredData?: Record<string, unknown>;
}
