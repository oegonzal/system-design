/** What a firm's page reads, in the order it shows them; each is read only once its tab is opened. */
export const PRIME_TABS = [
  { id: 'ending', label: 'Awards ending' },
  { id: 'buyers', label: 'Who buys from it' },
  { id: 'hires', label: 'Who it hires' },
  { id: 'hired-by', label: 'Who hires it' },
] as const;
export type PrimeTab = (typeof PRIME_TABS)[number]['id'];
