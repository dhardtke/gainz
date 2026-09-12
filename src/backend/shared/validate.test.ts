import { describe, expect, test } from 'bun:test';
import { isPresent, optionalString, requiredDate, requiredInt, requiredNumber, requiredString } from './validate.ts';

describe('requiredString', () => {
  test('trims the value', () => {
    expect(requiredString({ name: '  Squat ' }, 'name')).toBe('Squat');
  });

  test('rejects a blank or non-string value', () => {
    expect(() => requiredString({ name: '   ' }, 'name')).toThrow('"name" is required and must be a non-empty string');
    expect(() => requiredString({ name: 5 }, 'name')).toThrow('"name" is required and must be a non-empty string');
  });

  test('measures the length after trimming', () => {
    expect(requiredString({ name: '  abc  ' }, 'name', 3)).toBe('abc');
    expect(() => requiredString({ name: 'abcd' }, 'name', 3)).toThrow('"name" must be at most 3 characters');
  });
});

describe('optionalString', () => {
  test('normalises undefined, null and blank to null', () => {
    expect(optionalString({ notes: undefined }, 'notes')).toBeNull();
    expect(optionalString({ notes: null }, 'notes')).toBeNull();
    expect(optionalString({ notes: '  ' }, 'notes')).toBeNull();
  });

  test('rejects a number', () => {
    expect(() => optionalString({ notes: 5 }, 'notes')).toThrow('"notes" must be a string');
  });
});

describe('requiredInt', () => {
  test('coerces a numeric string', () => {
    expect(requiredInt({ reps: '5' }, 'reps')).toBe(5);
  });

  test('rejects a fraction and a non-numeric string', () => {
    expect(() => requiredInt({ reps: 1.5 }, 'reps')).toThrow('"reps" must be a whole number');
    expect(() => requiredInt({ reps: 'nope' }, 'reps')).toThrow('"reps" must be a whole number');
  });

  test('enforces the range', () => {
    expect(() => requiredInt({ reps: 0 }, 'reps', { min: 1, max: 1000 })).toThrow('"reps" must be between 1 and 1000');
  });
});

describe('requiredNumber', () => {
  test('rounds to two decimals', () => {
    expect(requiredNumber({ weight: 62.555 }, 'weight')).toBe(62.56);
  });

  test('rejects NaN and Infinity', () => {
    expect(() => requiredNumber({ weight: Number.NaN }, 'weight')).toThrow('"weight" must be a number');
    expect(() => requiredNumber({ weight: Number.POSITIVE_INFINITY }, 'weight')).toThrow('"weight" must be a number');
  });
});

describe('requiredDate', () => {
  test('accepts an ISO date and rejects any other format', () => {
    expect(requiredDate({ performedOn: '2026-09-12' }, 'performedOn')).toBe('2026-09-12');
    expect(() => requiredDate({ performedOn: '12.09.2026' }, 'performedOn')).toThrow('"performedOn" must be a date in YYYY-MM-DD format');
  });
});

describe('isPresent', () => {
  test('treats an undefined value as absent', () => {
    expect(isPresent({ notes: undefined }, 'notes')).toBe(false);
    expect(isPresent({ notes: null }, 'notes')).toBe(true);
  });
});
