import { json } from './http.ts';

/** An error carrying an HTTP status code; turned into a JSON error body by the server. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown): HttpError => new HttpError(400, message, details);
export const notFound = (what: string): HttpError => new HttpError(404, `${what} not found`);
export const conflict = (message: string): HttpError => new HttpError(409, message);

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: err.message, details: err.details ?? undefined }, err.status);
  }
  console.error('Unhandled error:', err);
  return json({ error: 'Internal server error' }, 500);
}
