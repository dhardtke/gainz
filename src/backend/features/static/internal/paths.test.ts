import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { FRONTEND_DIR, resolveStaticPath } from './paths.ts';

describe('static paths', () => {
  // `FRONTEND_DIR` is derived by counting directories up from this module's own URL, so moving
  // the file changes where the whole web root points. Nothing else notices: the server simply
  // 404s every asset. These two cases are the alarm.
  test('FRONTEND_DIR points at the real src/frontend', () => {
    expect(FRONTEND_DIR.endsWith(join('src', 'frontend'))).toBe(true);
    expect(existsSync(join(FRONTEND_DIR, 'index.html'))).toBe(true);
  });

  test('a traversal attempt stays inside the web root', () => {
    // Normalizing before joining collapses the `..` against the root rather than climbing out
    // of it, so the escape never happens and the request 404s on a file that is not there.
    const target = resolveStaticPath('/../backend/main.ts');
    expect(target).not.toBeNull();
    expect(target?.startsWith(FRONTEND_DIR + sep)).toBe(true);
  });

  test('refuses a path that cannot be a filename', () => {
    expect(resolveStaticPath('/a%00b')).toBeNull();
    expect(resolveStaticPath('/%zz')).toBeNull();
  });
});
