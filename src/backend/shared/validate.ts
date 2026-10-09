import { badRequest } from '../http/errors.ts';
import type { Iso8601Date } from '../../shared/flavors.ts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function requiredString<T extends object>(dto: T, field: keyof T & string, maxLength = 200): string {
  const value: unknown = dto[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest(`"${field}" is required and must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw badRequest(`"${field}" must be at most ${maxLength} characters`);
  }
  return trimmed;
}

export function optionalString<T extends object>(dto: T, field: keyof T & string, maxLength = 2000): string | null {
  const value: unknown = dto[field];
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

export function requiredInt<T extends object>(
  dto: T,
  field: keyof T & string,
  { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number {
  const value: unknown = dto[field];
  const num = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isInteger(num)) {
    throw badRequest(`"${field}" must be a whole number`);
  }
  if (num < min || num > max) {
    throw badRequest(`"${field}" must be between ${min} and ${max}`);
  }
  return num;
}

export function requiredNumber<T extends object>(dto: T, field: keyof T & string, { min = 0, max = 100000 }: { min?: number; max?: number } = {}): number {
  const value: unknown = dto[field];
  const num = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    throw badRequest(`"${field}" must be a number`);
  }
  if (num < min || num > max) {
    throw badRequest(`"${field}" must be between ${min} and ${max}`);
  }
  return Math.round(num * 100) / 100;
}

export function requiredBoolean<T extends object>(dto: T, field: keyof T & string): boolean {
  const value: unknown = dto[field];
  if (typeof value !== 'boolean') {
    throw badRequest(`"${field}" must be true or false`);
  }
  return value;
}

function isOneOf<V extends string>(values: readonly V[], value: unknown): value is V {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export function requiredOneOf<T extends object, V extends string>(dto: T, field: keyof T & string, values: readonly V[]): V {
  const value: unknown = dto[field];
  if (!isOneOf(values, value)) {
    throw badRequest(`"${field}" must be one of: ${values.join(', ')}`);
  }
  return value;
}

export function optionalOneOf<T extends object, V extends string>(dto: T, field: keyof T & string, values: readonly V[]): V | null {
  const value: unknown = dto[field];
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return requiredOneOf(dto, field, values);
}

export function requiredDate<T extends object>(dto: T, field: keyof T & string): Iso8601Date {
  const value = requiredString(dto, field, 10);
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) {
    throw badRequest(`"${field}" must be a date in YYYY-MM-DD format`);
  }
  return value;
}

export function today(): Iso8601Date {
  return new Date().toISOString().slice(0, 10);
}
