/** The route a notice opens at — `/notices/:id` — spelled once for every table that links to one. */
export const noticeHref = (noticeId: string): string => `/notices/${encodeURIComponent(noticeId)}`;
