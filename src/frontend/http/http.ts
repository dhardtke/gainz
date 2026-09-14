/** Thin client for the gainz REST API. No dependencies, just fetch. */

import { ApiError } from './errors.ts';

/**
 * One request against the API.
 *
 * The response body is whatever the server sent, so `T` is a promise the caller
 * makes rather than one this function keeps — every method on the API classes
 * declares the shape its own endpoint returns, and those declarations are the
 * single place the frontend states what it expects.
 *
 * @returns the parsed body, or `null` when there is no body — a 204, say.
 * @throws {ApiError} on a transport failure or a non-2xx response.
 */
async function request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      // oxlint-disable-next-line unicorn/no-invalid-fetch-options
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw new ApiError('Could not reach the gainz server', 0, cause);
  }

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text === '' ? null : JSON.parse(text);
  } catch {
    data = null;
  }

  if (!response.ok) {
    // The shape being narrowed toward is `ErrorDto`, but it is narrowed rather than claimed:
    // every other endpoint's DTO is asserted below, and an error body is the one response the
    // client cannot assume arrived well-formed — a 502 from a proxy carries no JSON at all.
    const errorBody = typeof data === 'object' && data !== null ? data : {};
    const message = 'error' in errorBody && typeof errorBody.error === 'string' ? errorBody.error : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, 'details' in errorBody ? errorBody.details : undefined);
  }

  // The methods on the API classes declare what each endpoint returns. This is
  // the one place that declaration is asserted rather than proven — validating
  // it would mean a schema library, and this app deliberately has none.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the server contract boundary
  return data as T;
}

export const get = <T>(path: string): Promise<T> => request<T>('GET', path);

export const post = <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body ?? {});

export const patch = <T>(path: string, body?: unknown): Promise<T> => request<T>('PATCH', path, body ?? {});

export const remove = (path: string): Promise<null> => request<null>('DELETE', path);
