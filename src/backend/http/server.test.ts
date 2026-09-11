import { describe, expect, test } from 'bun:test';
import { openDatabase } from '../db/db.ts';
import { HttpError } from './http.ts';
import { Repo } from '../db/repos';
import { serveOptions } from './server.ts';

describe('the error hook', () => {
  // Called directly rather than over HTTP: the hook is reachable — the `/*` static route is
  // deliberately unguarded, because it answers plain text rather than JSON — but nothing there
  // throws on purpose. The only way through is an I/O failure reading a module for transpilation
  // (`src/backend/transpile.ts:22`, outside that module's own `try`), which a test cannot provoke
  // over HTTP. What is under test is our wiring in `serveOptions`, not Bun's dispatch. The 500
  // branch logs one `Unhandled error: Error: boom` line to stderr on the way past.
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
