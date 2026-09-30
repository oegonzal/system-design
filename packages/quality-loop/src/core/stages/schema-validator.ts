/**
 * The one validator every pipeline runs, first: does the artifact have the
 * declared shape? A provided artifact is only trusted after this says so; a
 * produced one already passed the same schema at the model boundary.
 */
import type { Validator } from '../ports';

const SCHEMA_VALIDATOR_ID = 'schema';

export function schemaValidator<T>(): Validator<T> {
  return {
    id: SCHEMA_VALIDATOR_ID,
    gate: 'block',
    validate(artifact, contract) {
      const parsed = contract.output.schema.safeParse(artifact);
      return {
        validatorId: SCHEMA_VALIDATOR_ID,
        gate: 'block',
        problems: parsed.success
          ? []
          : parsed.error.issues.map((issue) => ({
              severity: 'critical' as const,
              locationRefs: [],
              message: `${issue.path.map(String).join('.') || '$'}: ${issue.message}`,
            })),
      };
    },
  };
}
