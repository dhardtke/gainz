import { badRequest } from '../http/errors.ts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The two length bounds the translators share: a name-ish field and a free-text one. */
export const MAX_NAME = 120;
export const MAX_NOTES = 2000;

export function isPresent(body: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined;
}

export function requiredString(body: Record<string, unknown>, field: string, maxLength = 200): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest(`"${field}" is required and must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw badRequest(`"${field}" must be at most ${maxLength} characters`);
  }
  return trimmed;
}

/** An optional string; empty strings and null both normalise to null. */
export function optionalString(body: Record<string, unknown>, field: string, maxLength = 2000): string | null {
  const value = body[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw badRequest(`"${field}" must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw badRequest(`"${field}" must be at most ${maxLength} characters`);
  }
  return trimmed;
}

export function requiredInt(
  body: Record<string, unknown>,
  field: string,
  { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number {
  const value = body[field];
  const num = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isInteger(num)) {
    throw badRequest(`"${field}" must be a whole number`);
  }
  if (num < min || num > max) {
    throw badRequest(`"${field}" must be between ${min} and ${max}`);
  }
  return num;
}

export function requiredNumber(body: Record<string, unknown>, field: string, { min = 0, max = 100000 }: { min?: number; max?: number } = {}): number {
  const value = body[field];
  const num = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    throw badRequest(`"${field}" must be a number`);
  }
  if (num < min || num > max) {
    throw badRequest(`"${field}" must be between ${min} and ${max}`);
  }
  // Store at most two decimals; avoids 2.5000000000000004 style noise.
  return Math.round(num * 100) / 100;
}

export function requiredDate(body: Record<string, unknown>, field: string): string {
  const value = requiredString(body, field, 10);
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) {
    throw badRequest(`"${field}" must be a date in YYYY-MM-DD format`);
  }
  return value;
}

export function pathId(raw: string | undefined, what: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw badRequest(`Invalid ${what} id`);
  }
  return id;
}

export function queryInt(params: URLSearchParams, key: string, fallback: number, { min = 0, max = 1000 }: { min?: number; max?: number } = {}): number {
  const raw = params.get(key);
  if (raw === null || raw === '') {
    return fallback;
  }
  const num = Number(raw);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw badRequest(`"${key}" must be a whole number between ${min} and ${max}`);
  }
  return num;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
