import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  NotAuthorizedException,
  PasswordResetRequiredException,
  UserNotConfirmedException,
  UserNotFoundException,
  type InitiateAuthCommandOutput,
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { JwtExpiredError } from 'aws-jwt-verify/error';

import type { CognitoPool } from '../config';
import type { Log } from '../log';
import type { Authenticator, SessionGrant, TokenVerifier } from './port';

/**
 * The real sides of the session's two seams: Cognito's ID tokens verified
 * against the pool's published keys, and the pool's `cognito-idp` API asked
 * for tokens. The verifier is thin on purpose; the authenticator takes the
 * client's `send` so a spec answers it without the SDK reaching anywhere.
 */

/** One verifier for the pool, kept so its key cache outlives a request. */
export function cognitoTokenVerifier(pool: CognitoPool): TokenVerifier {
  const verifier = CognitoJwtVerifier.create({
    userPoolId: pool.userPoolId,
    clientId: pool.clientId,
    tokenUse: 'id',
  });
  return {
    async verify(idToken) {
      try {
        await verifier.verify(idToken);
        return 'valid';
      } catch (error) {
        return error instanceof JwtExpiredError ? 'expired' : 'invalid';
      }
    },
  };
}

/**
 * The API client, pointed at the one host the pool's region answers on. The
 * gateway reaches AWS over IPv6 alone, and `cognito-idp.<region>.amazonaws.com`
 * is dual-stack as it is: the endpoint is written out, and the SDK's own
 * dual-stack switch is off, so the function-wide `AWS_USE_DUALSTACK_ENDPOINT`
 * never rewrites it into a host that may not exist.
 */
export function cognitoClient(region: string): CognitoIdentityProviderClient {
  return new CognitoIdentityProviderClient({
    region,
    endpoint: `https://cognito-idp.${region}.amazonaws.com`,
    useDualstackEndpoint: false,
  });
}

type InitiateAuth = (command: InitiateAuthCommand) => Promise<InitiateAuthCommandOutput>;

/** The refusals the pool answers a sign-in with, as opposed to a failure to answer. */
const SIGN_IN_REFUSALS = [
  NotAuthorizedException,
  UserNotFoundException,
  PasswordResetRequiredException,
  UserNotConfirmedException,
];

const isRefusal = (error: unknown, kinds: readonly (new (...args: never[]) => Error)[]) =>
  kinds.some((kind) => error instanceof kind);

const grantOf = (answer: InitiateAuthCommandOutput): SessionGrant | undefined => {
  const result = answer.AuthenticationResult;
  return result?.IdToken === undefined
    ? undefined
    : { idToken: result.IdToken, refreshToken: result.RefreshToken };
};

/**
 * `InitiateAuth` with the two flows the client allows: a password for a
 * sign-in, a refresh token for a refresh. A refusal is the pool's answer and
 * is returned as one; anything else — the API unreachable, throttled — is
 * thrown, for the handler's boundary to log and answer.
 */
export function cognitoAuthenticator(
  send: InitiateAuth,
  clientId: string,
  log: Log,
): Authenticator {
  const initiate = (
    flow: 'USER_PASSWORD_AUTH' | 'REFRESH_TOKEN_AUTH',
    parameters: Record<string, string>,
  ) =>
    send(
      new InitiateAuthCommand({ AuthFlow: flow, ClientId: clientId, AuthParameters: parameters }),
    );
  return {
    async signIn(email, password) {
      try {
        const answer = await initiate('USER_PASSWORD_AUTH', {
          USERNAME: email,
          PASSWORD: password,
        });
        if (answer.ChallengeName !== undefined) {
          return { kind: 'challenge', name: answer.ChallengeName };
        }
        const grant = grantOf(answer);
        return grant === undefined ? { kind: 'refused' } : { kind: 'grant', grant };
      } catch (error) {
        if (!isRefusal(error, SIGN_IN_REFUSALS)) throw error;
        log('sign-in refused', { reason: (error as Error).name });
        return { kind: 'refused' };
      }
    },

    async refresh(refreshToken) {
      try {
        const grant = grantOf(
          await initiate('REFRESH_TOKEN_AUTH', { REFRESH_TOKEN: refreshToken }),
        );
        return grant === undefined ? { kind: 'refused' } : { kind: 'grant', grant };
      } catch (error) {
        if (!isRefusal(error, [NotAuthorizedException])) throw error;
        log('refresh refused', { reason: (error as Error).name });
        return { kind: 'refused' };
      }
    },
  };
}
