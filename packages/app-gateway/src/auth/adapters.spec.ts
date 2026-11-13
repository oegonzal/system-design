import {
  InitiateAuthCommand,
  NotAuthorizedException,
  UserNotFoundException,
  type InitiateAuthCommandOutput,
} from '@aws-sdk/client-cognito-identity-provider';

import { recordedLog } from '../testing';
import { cognitoAuthenticator, cognitoClient } from './adapters';

/** An authenticator over a `send` that answers every command the same way, keeping what it was asked. */
function authenticator(answer: InitiateAuthCommandOutput | Error) {
  const asked: InitiateAuthCommand['input'][] = [];
  const { log, lines } = recordedLog();
  const auth = cognitoAuthenticator(
    async (command) => {
      asked.push(command.input);
      if (answer instanceof Error) throw answer;
      return answer;
    },
    'client-id',
    log,
  );
  return { auth, asked, lines };
}

const refusal = (kind: typeof NotAuthorizedException | typeof UserNotFoundException) =>
  new kind({ message: 'refused', $metadata: {} });

describe('the Cognito authenticator', () => {
  it('signs in with the password flow and returns the tokens the pool grants', async () => {
    const { auth, asked } = authenticator({
      $metadata: {},
      AuthenticationResult: { IdToken: 'id-1', RefreshToken: 'refresh-1', AccessToken: 'a' },
    });
    expect(await auth.signIn('me@example.com', 'pass')).toEqual({
      kind: 'grant',
      grant: { idToken: 'id-1', refreshToken: 'refresh-1' },
    });
    expect(asked).toEqual([
      {
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: 'client-id',
        AuthParameters: { USERNAME: 'me@example.com', PASSWORD: 'pass' },
      },
    ]);
  });

  it('returns a challenge by name, and an answer without tokens as refused', async () => {
    const challenged = authenticator({ $metadata: {}, ChallengeName: 'NEW_PASSWORD_REQUIRED' });
    const empty = authenticator({ $metadata: {} });
    expect(await challenged.auth.signIn('a', 'b')).toEqual({
      kind: 'challenge',
      name: 'NEW_PASSWORD_REQUIRED',
    });
    expect(await empty.auth.signIn('a', 'b')).toEqual({ kind: 'refused' });
  });

  it('reads the pool’s refusals as refused, logging the kind and never the password', async () => {
    for (const kind of [NotAuthorizedException, UserNotFoundException]) {
      const { auth, lines } = authenticator(refusal(kind));
      expect(await auth.signIn('a', 'secret')).toEqual({ kind: 'refused' });
      expect(lines).toEqual([{ message: 'sign-in refused', detail: { reason: kind.name } }]);
      expect(JSON.stringify(lines)).not.toContain('secret');
    }
  });

  it('lets a failure to answer through: the handler’s boundary owns it', async () => {
    const { auth } = authenticator(new Error('ENETUNREACH'));
    await expect(auth.signIn('a', 'b')).rejects.toThrow('ENETUNREACH');
    await expect(auth.refresh('r')).rejects.toThrow('ENETUNREACH');
  });

  it('refreshes with the refresh-token flow, taking a rotated refresh token when one comes', async () => {
    const kept = authenticator({ $metadata: {}, AuthenticationResult: { IdToken: 'id-2' } });
    const rotated = authenticator({
      $metadata: {},
      AuthenticationResult: { IdToken: 'id-2', RefreshToken: 'refresh-2' },
    });
    expect(await kept.auth.refresh('refresh-1')).toEqual({
      kind: 'grant',
      grant: { idToken: 'id-2', refreshToken: undefined },
    });
    expect(await rotated.auth.refresh('refresh-1')).toEqual({
      kind: 'grant',
      grant: { idToken: 'id-2', refreshToken: 'refresh-2' },
    });
    expect(kept.asked).toEqual([
      {
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: 'client-id',
        AuthParameters: { REFRESH_TOKEN: 'refresh-1' },
      },
    ]);
  });

  it('reads a refresh the pool refuses as refused', async () => {
    const { auth, lines } = authenticator(refusal(NotAuthorizedException));
    expect(await auth.refresh('stale')).toEqual({ kind: 'refused' });
    expect(lines).toEqual([
      { message: 'refresh refused', detail: { reason: 'NotAuthorizedException' } },
    ]);
  });
});

describe('the Cognito client', () => {
  it('is pointed at the pool region’s own host, with the dual-stack switch off', async () => {
    const client = cognitoClient('eu-west-2');
    const [endpoint, dualStack, region] = await Promise.all([
      client.config.endpoint?.(),
      client.config.useDualstackEndpoint(),
      client.config.region(),
    ]);
    expect(endpoint).toMatchObject({
      protocol: 'https:',
      hostname: 'cognito-idp.eu-west-2.amazonaws.com',
    });
    expect(dualStack).toBe(false);
    expect(region).toBe('eu-west-2');
  });
});
