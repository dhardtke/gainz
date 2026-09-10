/** An error carrying an HTTP status code; turned into a JSON error body by the server. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string, details?: unknown): HttpError => new HttpError(400, message, details);
export const notFound = (what: string): HttpError => new HttpError(404, `${what} not found`);
export const conflict = (message: string): HttpError => new HttpError(409, message);

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: err.message, details: err.details ?? undefined }, err.status);
  }
  console.error("Unhandled error:", err);
  return json({ error: "Internal server error" }, 500);
}

/**
 * A JSON value that is a plain object. Written as a type guard rather than a
 * check followed by a cast, so the narrowing the check performs is the same
 * narrowing the caller gets.
 */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses a JSON request body, rejecting anything that is not a plain object. */
export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
  if (!isJsonObject(parsed)) {
    throw badRequest("Request body must be a JSON object");
  }
  return parsed;
}
