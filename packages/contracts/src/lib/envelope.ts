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

export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
}
