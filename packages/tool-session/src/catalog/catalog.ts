import {
  excerpt,
  OBSERVATION_RESULT_MAX_LENGTH,
  type ToolDeclaration,
  type ToolOutcome,
} from '@sysdesign/contracts';

import { ToolArgumentsRefused, ToolUnknown, type RunnableTool, type ToolContext } from './tool';

/** What a refused outcome carries when it was the arguments the catalog refused, so a caller can tell it from a tool's own refusal. */
export interface ArgumentsRefusal {
  refusedBy: 'arguments';
  issues: ToolArgumentsRefused['issues'];
}

export const isArgumentsRefusal = (data: unknown): data is ArgumentsRefusal =>
  typeof data === 'object' &&
  data !== null &&
  (data as { refusedBy?: unknown }).refusedBy === 'arguments';

const describe = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/**
 * The tools a session may call, by name. A name declared twice is refused
 * when the catalog is built, so no plan can name an ambiguous tool; a call
 * ends in an outcome whatever the tool did — arguments its schema refused
 * are a refusal naming the issues, a tool that threw is a failure naming the
 * error — and every summary is cut to the bound an observation keeps.
 */
export class ToolCatalog {
  private readonly tools: ReadonlyMap<string, RunnableTool>;

  constructor(tools: readonly RunnableTool[]) {
    const byName = new Map<string, RunnableTool>();
    for (const tool of tools) {
      const { name } = tool.declaration;
      const earlier = byName.get(name);
      if (earlier !== undefined) {
        throw new Error(
          `tool ${name} is declared twice: by ${earlier.declaration.provider} and by ${tool.declaration.provider}`,
        );
      }
      byName.set(name, tool);
    }
    this.tools = byName;
  }

  declarations(): ToolDeclaration[] {
    return [...this.tools.values()].map((tool) => tool.declaration);
  }

  declaration(name: string): ToolDeclaration | null {
    return this.tools.get(name)?.declaration ?? null;
  }

  /** This catalog with more tools beside its own: how another program's tools join a session. */
  with(more: readonly RunnableTool[]): ToolCatalog {
    return new ToolCatalog([...this.tools.values(), ...more]);
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    context: ToolContext = {},
  ): Promise<ToolOutcome> {
    const tool = this.tools.get(name);
    if (tool === undefined) throw new ToolUnknown(name);
    try {
      const outcome = await tool.run(args, context);
      return { ...outcome, summary: excerpt(outcome.summary, OBSERVATION_RESULT_MAX_LENGTH) };
    } catch (error) {
      if (error instanceof ToolArgumentsRefused) {
        const refusal: ArgumentsRefusal = { refusedBy: 'arguments', issues: error.issues };
        return { outcome: 'refused', summary: error.message, data: refusal };
      }
      return {
        outcome: 'failed',
        summary: excerpt(`${name} failed: ${describe(error)}`, OBSERVATION_RESULT_MAX_LENGTH),
        data: null,
      };
    }
  }
}
