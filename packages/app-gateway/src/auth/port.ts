/**
 * The seams of the session layer: who says an ID token is good, and who
 * turns a password or a refresh token into tokens. Specs inject fakes;
 * `adapters.ts` holds the real ones, over `aws-jwt-verify` and the
 * `cognito-idp` API.
 */
export type TokenVerdict = 'valid' | 'expired' | 'invalid';

export interface TokenVerifier {
  verify(idToken: string): Promise<TokenVerdict>;
}

export interface SessionGrant {
  idToken: string;
  /** A sign-in returns one; a refresh returns one only when the pool rotates them. */
  refreshToken?: string;
}

/**
 * What a sign-in came to: tokens; a refusal (a wrong password, an unknown
 * account, one that must reset); or a challenge the pool asks to be met
 * first, by name — the sign-in page meets none, it tells the viewer which.
 */
export type SignIn =
  | { kind: 'grant'; grant: SessionGrant }
  | { kind: 'refused' }
  | { kind: 'challenge'; name: string };

export type Refresh = { kind: 'grant'; grant: SessionGrant } | { kind: 'refused' };

export interface Authenticator {
  signIn(email: string, password: string): Promise<SignIn>;
  refresh(refreshToken: string): Promise<Refresh>;
}
