// The Nest apps' shared plumbing: what every zod-native service needs and
// none should copy. Small on purpose — anything here couples every API to it.
export * from './zod.pipe';
