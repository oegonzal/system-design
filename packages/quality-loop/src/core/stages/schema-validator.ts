/**
 * The two validators every pipeline runs, first: does the artifact have the
 * declared shape, and where did it write past the sizes it was asked for? A
 * provided artifact is only trusted after the first says so; a produced one
 * already passed the same reading at the model boundary. Both read the
 * artifact the way the seam reads a reply, so they split exactly where it
 * does: a structural fault blocks, a size is a warning that blocks nothing.
 */
import { describeIssue, describeOverrun } from '@sysdesign/contracts';

import { problem, readArtifact } from '../contracts';
import type { Validator } from '../ports';

export const SCHEMA_VALIDATOR_ID = 'schema';
export const BOUNDS_VALIDATOR_ID = 'bounds';

/**
 * Blocks an artifact the schema refuses — a wrong type, a missing field, an
 * unknown id or enum value — naming every fault; the size faults beside them
 * are listed as noted, not refused.
 */
export function createSchemaValidator<T>(): Validator<T> {
  return {
    id: SCHEMA_VALIDATOR_ID,
    gate: 'block',
    validate(artifact, contract) {
      const parsed = readArtifact(contract.output.schema, artifact);
      return {
        validatorId: SCHEMA_VALIDATOR_ID,
        gate: 'block',
        problems: parsed.issues.map((issue) =>
          problem(issue.soft ? 'info' : 'critical', describeIssue(issue)),
        ),
      };
    },
  };
}

/**
 * Warns, one problem per field, where a well-formed artifact runs past the
 * size its schema asks for — kept whole, judged whole, never a block. A
 * malformed artifact is the schema validator's to report, so it passes here.
 */
export function createBoundsValidator<T>(): Validator<T> {
  return {
    id: BOUNDS_VALIDATOR_ID,
    gate: 'warn',
    validate(artifact, contract) {
      const parsed = readArtifact(contract.output.schema, artifact);
      return {
        validatorId: BOUNDS_VALIDATOR_ID,
        gate: 'warn',
        problems: parsed.overruns.map((overrun) => problem('info', describeOverrun(overrun))),
      };
    },
  };
}
