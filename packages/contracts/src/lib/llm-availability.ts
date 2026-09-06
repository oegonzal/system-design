/**
 * Whether a model-backed role can run at all — derived facts only, never the
 * key. The coach and the quality loop both report it so a client can disable
 * a button with an honest reason instead of a failing call.
 */
export interface LlmAvailabilityDto {
  enabled: boolean;
  model: string | null;
  reason: 'deterministic' | 'no-key' | null;
}
