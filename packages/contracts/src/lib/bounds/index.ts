// One declared bound for every string and list a model writes into, and the
// salvage that keeps what it wrote. The numbers (`bound.ts`), the declaration
// on a zod node (`bounded.ts`), paths into a value and a schema
// (`json-paths.ts`), the schema a model is shown (`model-schema.ts`), fields
// past their target (`overruns.ts`), the one wording of a fault (`issues.ts`)
// and the lenient parse (`parse-lenient.ts`). What the modules share only
// among themselves stays theirs.
export {
  BOUND_TOLERANCE,
  bound,
  composedBound,
  CUT_FACTOR,
  CUT_MARKER,
  cutPoint,
  exact,
  keptAtMost,
  type Bound,
  type BoundKind,
  type DeclaredBound,
} from './bound';
export { bounded, type IdOptions, type ListOptions, type TextOptions } from './bounded';
export {
  boundPath,
  jsonSchemaBoundPath,
  locationPath,
  type BoundPath,
  type LocationPath,
  type PathKey,
} from './json-paths';
export { modelSchema, walkJsonSchema, type ModelSchema } from './model-schema';
export { overrunsOf, type Overrun, type OverrunHandling } from './overruns';
export {
  describeIssue,
  describeOverrun,
  overrunIssue,
  schemaIssuesOf,
  SOFT_ISSUE_NOTE,
  type SchemaIssue,
} from './issues';
export { parseLenient, type LenientParse, type Repair } from './parse-lenient';
