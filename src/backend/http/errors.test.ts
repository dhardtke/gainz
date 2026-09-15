import { describe, expect, spyOn, test } from 'bun:test';
import type { ErrorDto } from '../../shared/dto/error.ts';
import { HttpError, errorResponse } from './errors.ts';
import { body } from '../testing.ts';

describe('errorResponse', () => {
  test('renders an HttpError with its status, message and details', async () => {
    const res = errorResponse(new HttpError(400, 'bad input', { field: 'name' }));
    expect(res.status).toBe(400);
    expect(await body<ErrorDto>(res)).toEqual({ error: 'bad input', details: { field: 'name' } });
  });

  test('renders anything else as a logged 500', async () => {
    const log = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = errorResponse(new Error('boom'));
      expect(res.status).toBe(500);
      expect(await body<ErrorDto>(res)).toEqual({ error: 'Internal server error' });
      expect(log).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));
    } finally {
      log.mockRestore();
    }
  });
});
