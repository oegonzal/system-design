/**
 * Response envelopes.
 *
 * Success bodies are `{ data }` (single resource) or `{ data, meta }`
 * (collections). Errors are deliberately NOT enveloped — they keep the
 * framework's exception shape (`{ statusCode, message, error? }`) so the
 * client can branch on `response.ok` and trust each arm's type.
 */
export interface ApiResponse<T> {
  data: T;
}

export interface ListMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface ApiListResponse<T> {
  data: T[];
  meta: ListMeta;
}

/** One offending field of a refused request body or query: its dotted path (`tags.1`) and why. */
export interface ApiValidationIssue {
  path: string;
  message: string;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
  /** A 400 from schema validation names every offending path, so a client can say which field. */
  issues?: ApiValidationIssue[];
}
