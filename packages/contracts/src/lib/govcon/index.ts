// Government contracting: the normalized records every govcon layer reads
// (opportunities, awards, entities, bids, saved searches), the vocabularies
// and bounds, the pure formatting the CLI and the client share, and the wire
// shapes of the HTTP surface.
//
// Naming: a type is named for what it is (`Lead`, `Bid`, `SourceStatus`); the
// `Dto` suffix marks a shape that exists only as an HTTP answer composed from
// others (`NoticeDto`). Request bodies end in `Request`, response envelopes
// in `Response`.
export * from './vocab';
export * from './constants';
export * from './thresholds';
export * from './facets';
export * from './opportunity';
export * from './query';
export * from './format';
export * from './profile';
export * from './source';
export * from './pull';
export * from './lead';
export * from './notice';
export * from './search';
export * from './bid';
export * from './award';
export * from './entity';
export * from './fiscal';
export * from './windows';
export * from './alerts';
export * from './spending';
export * from './fixtures';
export * from './spending-fixtures';
