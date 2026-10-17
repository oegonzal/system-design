import {
  toolDeclarationOf,
  type ApiValidationIssue,
  type ToolDeclaration,
  type ToolDefinition,
  type ToolOutcome,
} from '@sysdesign/contracts';
import type { z } from 'zod';

/** What a running tool is handed beside its arguments. */
export interface ToolContext {
  signal?: AbortSignal;
}

/** A tool the catalog can run: its declaration for the wire, and the run that takes arguments already read. */
export interface RunnableTool {
  declaration: ToolDeclaration;
  run(args: Record<string, unknown>, context: ToolContext): Promise<ToolOutcome>;
}

/** Arguments the tool's own schema refused: the issues, as a 400 names them. */
export class ToolArgumentsRefused extends Error {
  override readonly name = 'ToolArgumentsRefused';
  constructor(
    readonly tool: string,
    readonly issues: readonly ApiValidationIssue[],
  ) {
    super(
      `${tool} refuses its arguments: ${issues.map((issue) => `${issue.path || '(root)'}: ${issue.message}`).join('; ')}`,
    );
  }
}

/** Where more tools come from as a session starts: another program's, over HTTP, or a spec's. */
export interface ToolProvider {
  tools(): Promise<RunnableTool[]>;
}

/** A tool nothing declared. */
export class ToolUnknown extends Error {
  override readonly name = 'ToolUnknown';
  constructor(readonly tool: string) {
    super(`no tool ${JSON.stringify(tool)}`);
  }
}

/** A tool as a program defines it: the declaration's facts, and what runs once the arguments have been read. */
export interface ToolSpec<P extends z.ZodObject> extends ToolDefinition<P> {
  run(args: z.infer<P>, context: ToolContext): Promise<ToolOutcome>;
}

/**
 * One tool, defined once: its declaration is written from the definition,
 * and its run parses the arguments with the definition's own schema first,
 * refusing by the issues — the full check behind the validator's shallow one.
 */
export function defineTool<P extends z.ZodObject>(
  spec: ToolSpec<P>,
  provider: string,
): RunnableTool {
  const declaration = toolDeclarationOf(spec, provider);
  return {
    declaration,
    run: async (args, context) => {
      const parsed = spec.parameters.safeParse(args);
      if (!parsed.success) {
        throw new ToolArgumentsRefused(
          spec.name,
          parsed.error.issues.map((issue) => ({
            path: issue.path.map(String).join('.'),
            message: issue.message,
          })),
        );
      }
      return spec.run(parsed.data, context);
    },
  };
}
