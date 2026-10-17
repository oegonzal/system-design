import {
  toolDeclarationSchema,
  type ApiValidationIssue,
  type ToolOutcome,
} from '@sysdesign/contracts';
import { z } from 'zod';

import {
  ToolArgumentsRefused,
  ToolUnknown,
  type RunnableTool,
  type ToolContext,
  type ToolProvider,
} from './tool';

/** A peer program that could not be asked for its tools. */
export class PeerUnreachable extends Error {
  override readonly name = 'PeerUnreachable';
  constructor(
    readonly url: string,
    detail: string,
  ) {
    super(`the tools at ${url} cannot be reached: ${detail}`);
  }
}

/** How long a peer may take to list its tools or run one. */
const CALL_TIMEOUT_MS = 15_000;
/** A peer's tools run for as long as the tool needs; a slow one is the peer's to bound. */
const RUN_TIMEOUT_MS = 120_000;

const declarationsSchema = z.strictObject({ data: z.array(toolDeclarationSchema) });
const outcomeSchema = z.strictObject({
  data: z.strictObject({
    outcome: z.enum(['ok', 'failed', 'refused']),
    summary: z.string(),
    data: z.unknown(),
  }),
});
const refusalSchema = z.object({
  issues: z.array(z.object({ path: z.string(), message: z.string() })),
});

const describe = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/**
 * Another program's tools as this one's: its `GET /tools` lists them with the
 * parameters and effects it declared, and each call goes to its
 * `POST /tools/:name`. A refusal, an unknown tool and a failure come back as
 * what they are, so the catalog reads a peer's outcome as it reads its own.
 */
export class HttpToolProvider implements ToolProvider {
  constructor(
    private readonly url: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async tools(): Promise<RunnableTool[]> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.url}/tools`, {
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
    } catch (error) {
      throw new PeerUnreachable(this.url, describe(error));
    }
    if (response.status !== 200) {
      throw new PeerUnreachable(this.url, `GET /tools answered ${response.status}`);
    }
    const listed = declarationsSchema.safeParse(await response.json());
    if (!listed.success) {
      throw new PeerUnreachable(this.url, 'GET /tools answered something other than tools');
    }
    return listed.data.data.map((declaration) => ({
      declaration,
      run: (args, context) => this.invoke(declaration.name, args, context),
    }));
  }

  private async invoke(
    name: string,
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolOutcome> {
    const signal =
      context.signal === undefined
        ? AbortSignal.timeout(RUN_TIMEOUT_MS)
        : AbortSignal.any([context.signal, AbortSignal.timeout(RUN_TIMEOUT_MS)]);
    const response = await this.fetchImpl(`${this.url}/tools/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ arguments: args }),
      signal,
    });
    const body: unknown = await response.json().catch(() => null);
    if (response.status === 200) {
      const parsed = outcomeSchema.safeParse(body);
      if (parsed.success) return parsed.data.data;
      throw new Error(
        `${this.url} answered POST /tools/${name} with something other than an outcome`,
      );
    }
    if (response.status === 400) {
      const refusal = refusalSchema.safeParse(body);
      const issues: ApiValidationIssue[] = refusal.success ? refusal.data.issues : [];
      throw new ToolArgumentsRefused(name, issues);
    }
    if (response.status === 404) throw new ToolUnknown(name);
    throw new Error(`${this.url} answered POST /tools/${name} with ${response.status}`);
  }
}
