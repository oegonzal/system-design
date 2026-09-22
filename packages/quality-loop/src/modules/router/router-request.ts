import { z } from 'zod';

/** The body of `POST /router/report`: a brief, and nothing else — the router chooses the pipeline. */
export const routeReportRequestSchema = z.strictObject({ goal: z.string().min(1).max(64_000) });
