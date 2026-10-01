// Wire contracts shared by every layer: the studio API validates against
// them, the quality loop's pipelines declare their artifacts with them, and
// the canvas UI renders them. The `as const` tuples are the single source of
// each vocabulary, and the zod schemas the single source of each shape — a
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
export * from './lib/canvas';
export * from './lib/canvas.schema';
export * from './lib/design-prompt.schema';
export * from './lib/experiences';
export * from './lib/prompts';
export * from './lib/sessions';
export * from './lib/evaluations';
export * from './lib/llm-availability';
export * from './lib/llm-model';
export * from './lib/graph-render';
export * from './lib/node-label';
export * from './lib/graph-validator';
export * from './lib/brief-validator';
export * from './lib/narration-validator';
export * from './lib/brief-repair';
export * from './lib/narration-repair';
export * from './lib/submission-repair';
export * from './lib/submission-locations';
export * from './lib/node-guide';
export * from './lib/star-stories';
export * from './lib/studio-pipelines';
export * from './lib/quality-loop';
export * from './lib/govcon';
