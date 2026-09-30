/**
 * Whether the EMBEDDINGS tier can run — derived facts only, never the key.
 * The memory half of a run is optional: without OPENAI_API_KEY its steps skip
 * with `embeddings-disabled` and the target still runs. The model itself is
 * never optional — a loop without one does not boot — so its report is the
 * plain `LlmModelDto`.
 */
export interface LlmAvailabilityDto {
  enabled: boolean;
  model: string | null;
  reason: 'no-key' | null;
}
