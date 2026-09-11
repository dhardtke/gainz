import { json } from './http.ts';
import type { ErrorDto } from '../../shared/dto';

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
    const body: ErrorDto = { error: err.message, details: err.details ?? undefined };
    return json(body, err.status);
  }
  console.error('Unhandled error:', err);
  const body: ErrorDto = { error: 'Internal server error' };
  return json(body, 500);
}
