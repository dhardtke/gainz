import { describe, expect, test } from 'bun:test';
import { openDatabase } from '../db/db.ts';
import { HttpError } from './http.ts';
import { Repo } from '../db/repo';
import { serveOptions } from './server.ts';

describe('the error hook', () => {
  // Called directly rather than over HTTP: `guardAll` wraps the method maps and `guard` the
  // `/api/*` catch-all, so no request can reach the hook through the route table. What is
  // under test is our wiring in `serveOptions`, not Bun's dispatch. The 500 branch logs one
  // `Unhandled error: Error: boom` line to stderr on the way past.
  test("renders errors through Bun.serve's error hook", () => {
    const db = openDatabase(':memory:');
    try {
      const { error } = serveOptions(new Repo(db));

      expect(error(new HttpError(418, 'teapot')).status).toBe(418);
      expect(error(new Error('boom')).status).toBe(500);
    } finally {
      db.close();
    }
  });
});
