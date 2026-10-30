/**
 * The ports the session engine drives, one file per port. The engine is pure
 * over these: a browser that observes and acts, a brain that decides through
 * the quality loop and keeps the operator's answers wherever it is bound to, a
 * ledger for the records, an operator at a terminal and the operator's
 * interrupt, and a goal to read, a clock and a dump to write. The advisor and
 * the session events ports live beside their flows, in `unit-advice.ts` and
 * `session-events.ts`. Every adapter lives under `adapters/`; every fake under
 * `core/testing*.ts`; nothing here names a site, a database or a model.
 */
export * from './browser';
export * from './brain';
export * from './ledger';
export * from './operator';
export * from './infra';
