import { badRequest } from './errors.ts';

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

/**
 * A JSON value that is a plain object. Written as a type guard rather than a
 * check followed by a cast, so the narrowing the check performs is the same
 * narrowing the caller gets.
 */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    throw badRequest('Request body must be valid JSON');
  }
  if (!isJsonObject(parsed)) {
    throw badRequest('Request body must be a JSON object');
  }
  return parsed;
}
