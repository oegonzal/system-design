import type { LlmModelDto } from '../llm-model';

/**
 * The pace a running run keeps, as the loop that keeps it declares it: a run
 * in flight beats every `heartbeatEveryMs` — and on every write — and the
 * janitor fails a running run whose last beat is older than `staleAfterMs`.
 * Read from the janitor's own options, so a reader telling a quiet run from a
 * dead one measures with the loop's numbers, never a guess at them.
 */
export interface RunHeartbeatDto {
  heartbeatEveryMs: number;
  staleAfterMs: number;
}

/** `GET /health`: the loop is up, the model behind it — a booted loop always names one — and the pace its runs keep. */
export interface QualityLoopHealthDto {
  status: 'ok';
  llm: LlmModelDto;
  heartbeat: RunHeartbeatDto;
}
