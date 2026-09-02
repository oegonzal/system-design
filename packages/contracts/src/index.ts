// Wire contracts shared by every layer: API DTO classes `implement` these
// interfaces, the eval engine's rules read them, and the canvas UI renders
// them. The `as const` tuples are the single source of each vocabulary — a
// value added here fails compilation everywhere a `satisfies Record<...>`
// table has not caught up.
//
// Re-exports are extensionless on purpose: this barrel is resolved by tsc
// (bundler resolution), swc (the seed script and MikroORM CLI), Next's
// compiler and Vite, and the extensionless relative form is the one spelling
// all of them agree on.
export * from './lib/primitives';
export * from './lib/constants';
export * from './lib/envelope';
export * from './lib/appearance';
export * from './lib/brief-suggestions';
export * from './lib/canvas';
export * from './lib/interfaces';
export * from './lib/patches';
export * from './lib/experiences';
export * from './lib/prompts';
export * from './lib/workflow-spec';
export * from './lib/quality-areas';
export * from './lib/sessions';
export * from './lib/graph-render';
export * from './lib/graph-validator';
export * from './lib/workflow-validator';
export * from './lib/brief-validator';
export * from './lib/narration-validator';
export * from './lib/patch-apply';
export * from './lib/mechanisms';
export * from './lib/design-brief';
export * from './lib/narration';
export * from './lib/node-guide';
export * from './lib/evaluations';
export * from './lib/eval-profile';
export * from './lib/star-stories';
