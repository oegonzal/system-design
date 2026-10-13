/** The four lenses, in the order the page shows them. */
export const SPENDING_TABS = [
  { id: 'pulse', label: 'Pulse' },
  { id: 'where', label: 'Where' },
  { id: 'horizon', label: 'Horizon' },
  { id: 'agency', label: 'Agency' },
] as const;
export type SpendingTab = (typeof SPENDING_TABS)[number]['id'];
