import { badRequest } from './errors.ts';

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

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

export function pathId(raw: string | undefined, what: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw badRequest(`Invalid ${what} id`);
  }
  return id;
}

export function queryInt(params: URLSearchParams, key: string, fallback: number, bounds: { min?: number; max?: number } = {}): number {
  return optionalQueryInt(params, key, bounds) ?? fallback;
}

export function optionalQueryInt(params: URLSearchParams, key: string, { min = 0, max = 1000 }: { min?: number; max?: number } = {}): number | null {
  const raw = params.get(key);
  if (raw === null || raw === '') {
    return null;
  }
  const num = Number(raw);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw badRequest(`"${key}" must be a whole number between ${min} and ${max}`);
  }
  return num;
}

export function optionalQueryOneOf<V extends string>(params: URLSearchParams, key: string, values: readonly V[]): V | null {
  const raw = params.get(key);
  if (raw === null || raw === '') {
    return null;
  }
  const value = values.find((candidate) => candidate === raw);
  if (value === undefined) {
    throw badRequest(`"${key}" must be one of: ${values.join(', ')}`);
  }
  return value;
}
