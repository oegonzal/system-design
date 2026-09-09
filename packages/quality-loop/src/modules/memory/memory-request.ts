import { z } from 'zod';

/** The body of `POST /memory/retrieval-report`: a goal, and nothing else. */
export const reportRequestSchema = z.strictObject({ goal: z.string().min(1).max(64_000) });
