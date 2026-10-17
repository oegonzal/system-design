/**
 * @sysdesign/google-kit — what a program needs to act as the owner on a
 * Google API: the credentials it reads, the consent that obtains a refresh
 * token, the file that keeps it, the access tokens minted from it, and the
 * authorized request. No API of its own: the mailbox and calendar services
 * declare theirs over `googleRequest`.
 */
export { authorize, ConsentFailed, type AuthorizeOptions, type Listen } from './authorize';
export {
  ALL_GOOGLE_SCOPES,
  AUTHORIZE_LOOPBACK_PORT,
  GOOGLE_ENV,
  GOOGLE_SCOPES,
  GoogleConfigError,
  googleCredentialsFromEnv,
  type GoogleCredentials,
} from './env';
export {
  AUTHORIZE_COMMAND,
  GoogleAuth,
  GoogleAuthFailed,
  GoogleAuthRevoked,
  GoogleScopeMissing,
  GoogleTokenMissing,
  loadGrant,
  type Grant,
  type TokenSource,
} from './oauth';
export {
  googleRequest,
  GoogleRefused,
  GoogleUnreachable,
  type GoogleCall,
  type GoogleMethod,
} from './request';
export {
  readTokenFile,
  TokenFileInvalid,
  writeTokenFile,
  type StoredToken,
  type TokenFileSystem,
} from './token-file';
