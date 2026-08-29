/**
 * What the depth pass asks the model to return. Bounded and clamped by the
 * schema itself — the pass never has to sanitize scores.
 */
import { z } from 'zod';

export const DEPTH_AXIS_ID = 'depth';
export const DEPTH_AXIS_LABEL = 'Depth & justification';

export const depthSchema = z.object({
  /** How deeply the hard problems are addressed by mechanism, 0–100. */
  depthScore: z.number().int().min(0).max(100),
  subScores: z.object({
    tradeoffArticulation: z.number().int().min(0).max(100),
    bottleneckAwareness: z.number().int().min(0).max(100),
    failureDesign: z.number().int().min(0).max(100),
    dataFlowClarity: z.number().int().min(0).max(100),
  }),
  summary: z.string().max(1200),
});

export type DepthCritique = z.infer<typeof depthSchema>;
