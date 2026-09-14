export class ApiError extends Error {
  /** The HTTP status, or 0 when the request never left. */
  status: number;
  /** Whatever the server put in `details`, if anything. */
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/**
 * The message to show a user for a thrown value.
 *
 * Everything the API client throws is an `ApiError`, but a `catch` binding is
 * `unknown` and a bug in a view would land here too, so fall back to the value
 * itself rather than showing "undefined".
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
