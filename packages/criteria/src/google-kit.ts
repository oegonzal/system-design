import type { Criterion } from './criterion';

/** The Google kit (packages/google-kit): consent, refresh, the token file and the authorized request. */
export const GOOGLE_KIT_CRITERIA: readonly Criterion[] = [
  {
    id: 'GGL-1',
    statement:
      'Every variable a Google-backed program reads for its credentials is named once with its fallback, read from an environment it is handed, and refused by name when a required one is unset; the scopes each program needs are one table every consent requests whole.',
  },
  {
    id: 'GGL-2',
    statement:
      'The refresh token is kept in one file the owner alone can read, written with its scopes, its client and when it was obtained; a file that is missing reads as none, and one that is not a token is refused by name.',
  },
  {
    id: 'GGL-3',
    statement:
      'An access token is minted from the refresh token and kept until a minute before it expires, minted again after it or after the service refused one; a grant Google revoked names the command that obtains a new one; a program whose scopes the grant lacks refuses to start, naming the scope and the command.',
  },
  {
    id: 'GGL-4',
    statement:
      'Consent is obtained once for every program: a loopback listener on the declared port, the consent URL announced for the person to open, the state checked on the way back, the code exchanged for a refresh token, and the token written as soon as it is granted, whatever connection the browser keeps open to the listener; a consent that yields no refresh token is refused rather than stored.',
  },
  {
    id: 'GGL-5',
    statement:
      'An authorized request carries the bearer token and parses the answer against the schema the caller hands in; a refused token is minted again and the request sent once more, a rate limit or a server error is ridden out within the declared recovery, any other refusal names Google’s own reason and the route, a dead socket reads as unreachable, and an answer with no body reads as none.',
  },
];
