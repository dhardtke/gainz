/**
 * What the server puts in a 4xx or 5xx body. `details` is present only on a 400 raised with one,
 * and carries whatever the thrower attached — which is why the client narrows this shape by hand
 * rather than trusting it: an error body is the one response that may not have arrived well-formed.
 */
export interface ErrorDto {
  error: string;
  details?: unknown;
}
