/**
 * The session layer's door: the layer itself, its seams, and the real
 * adapters `main.ts` wires behind them.
 */
export { cognitoAuthenticator, cognitoClient, cognitoTokenVerifier } from './adapters';
export { SESSION_COOKIE_NAMES } from './cookies';
export { createSession, type Gate, type Session } from './session';
