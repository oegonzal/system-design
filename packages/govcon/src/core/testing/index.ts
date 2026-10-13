/**
 * Pure fakes for the core and the service, one module per port. No vitest
 * imports, so this compiles under the app tsconfig and a spec anywhere can
 * lean on it.
 */
export * from './basics';
export * from './replies';
export * from './sources';
export * from './opportunities';
export * from './profiles';
export * from './bids';
export * from './awards';
export * from './entities';
export * from './views';
