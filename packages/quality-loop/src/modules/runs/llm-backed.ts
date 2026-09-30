/**
 * How a module puts a model behind a port. The environment decides once, at
 * boot, whether there is a model; an adapter over it, or the no-op that keeps
 * every run honest about why it skipped; and the availability every record
 * and context reports the same way.
 */
import type { Logger } from '@nestjs/common';
import type { LlmAvailabilityDto } from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';

/** The adapter over the client when it has a model, else the stand-in; warnings go to the module's log. */
export const llmBacked = <T>(
  client: LlmClient,
  adapter: (client: LlmClient, warn: (message: string) => void) => T,
  fallback: T,
  logger: Logger,
): T => (client.enabled ? adapter(client, (message) => logger.warn(message)) : fallback);

/** Enabled, the model, and — only when not enabled — why not. */
export const availabilityOf = (
  client: { readonly enabled: boolean; readonly model: string | null },
  reasonWhenOff: () => LlmAvailabilityDto['reason'],
): LlmAvailabilityDto => ({
  enabled: client.enabled,
  model: client.model,
  reason: client.enabled ? null : reasonWhenOff(),
});
