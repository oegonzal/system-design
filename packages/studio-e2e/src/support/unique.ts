/**
 * A title or tag no other test will produce.
 *
 * The suite runs against one shared database with files in parallel, and the
 * story specs assert on list contents. Scoping every test to its own names is
 * what lets them search and filter without seeing each other's rows.
 */
export const uniqueName = (label: string): string =>
  `${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
