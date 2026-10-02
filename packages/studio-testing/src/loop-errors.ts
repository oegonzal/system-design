/**
 * The fake loop throws the shared client's own errors, so every adapter over
 * it — the studio's Nest-facing one, the e2e stub, a plain client — tells the
 * same three refusals apart by the same classes. Re-exported here so the
 * fake's consumers keep one import; the classes live with the client.
 */
export { DerivationFailed, LoopRefused, LoopUnreachable } from '@sysdesign/loop-client';
