import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { useTempDir, waitForUrl } from './testing.ts';

// Kill in each test's `finally`, not a hook: useTempDir()'s cleanup runs first and fails on Windows.
describe('main', () => {
  const dir = useTempDir();

  function spawn(env: Record<string, string> = {}): Bun.Subprocess<'ignore', 'pipe', 'pipe'> {
    const base: Record<string, string | undefined> = { ...process.env };
    delete base.JOURNAL_STREAM;
    delete base.GAINZ_PASSWORD_HASH;
    delete base.GAINZ_DEV;
    return Bun.spawn([process.execPath, 'src/backend/main.ts'], {
      env: { ...base, PORT: '0', GAINZ_DB: join(dir(), 'gainz.sqlite'), ...env },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
  }

  async function started(env: Record<string, string> = {}): Promise<string> {
    const proc = spawn(env);
    try {
      return (await waitForUrl(proc.stdout, () => new Response(proc.stderr).text())).stdout;
    } finally {
      proc.kill();
      await proc.exited;
    }
  }

  test('prints the banner in the terminal format', async () => {
    expect(await started()).toMatch(/^\d\d:\d\d:\d\d server gainz is running on /m);
  });

  test('keeps the terminal format when JOURNAL_STREAM names another file', async () => {
    const stdout = await started({ JOURNAL_STREAM: '8:1234' });
    expect(stdout).toMatch(/^\d\d:\d\d:\d\d server gainz is running on /m);
    expect(stdout).not.toContain('<6>');
  });

  test('refuses a GAINZ_PASSWORD_HASH that is no hash', async () => {
    const proc = spawn({ GAINZ_PASSWORD_HASH: 'nope' });
    try {
      expect(await proc.exited).toBe(1);
      expect(await new Response(proc.stderr).text()).toContain('ERROR server GAINZ_PASSWORD_HASH is not an argon2 or bcrypt hash');
    } finally {
      proc.kill();
      await proc.exited;
    }
  });

  test('logs a startup failure with its error and exits with 1', async () => {
    const proc = spawn({ GAINZ_DB: dir() });
    try {
      expect(await proc.exited).toBe(1);
      expect(await new Response(proc.stderr).text()).toMatch(/ERROR server failed to start\n[\s\S]*SQLiteError/);
    } finally {
      proc.kill();
      await proc.exited;
    }
  });

  // Windows cannot deliver SIGTERM to a handler.
  test.skipIf(process.platform === 'win32')('logs the signal it stops on and exits with 0', async () => {
    const proc = spawn();
    try {
      await waitForUrl(proc.stdout, () => new Response(proc.stderr).text());
      proc.kill('SIGTERM');
      expect(await proc.exited).toBe(0);
      // A Response refuses a stream that waitForUrl() already read from.
      let rest = '';
      const decoder = new TextDecoder();
      for await (const chunk of proc.stdout) {
        rest += decoder.decode(chunk, { stream: true });
      }
      expect(rest).toContain('server stopping (SIGTERM)');
    } finally {
      proc.kill();
      await proc.exited;
    }
  });
});
