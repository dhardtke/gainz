import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { openDatabase } from './db.ts';
import { schemaVersion } from './migrations.ts';
import { tables, useTempDir } from '../testing.ts';

const tempDir = useTempDir();

describe('the real migrations', () => {
  test('openDatabase applies them to an in-memory database', () => {
    const real = openDatabase(':memory:');

    // Asserted one at a time: expect.arrayContaining is typed `any`, and a
    // failure names the missing table rather than dumping both arrays.
    for (const table of ['exercises', 'workouts', 'sets', 'schema_migrations']) {
      expect(tables(real)).toContain(table);
    }
    expect(schemaVersion(real)).toBe(1);

    real.close();
  });

  test('openDatabase enables WAL for a file-backed database', () => {
    const file = openDatabase(join(tempDir(), 'wal-check.sqlite'));

    expect(file.query<{ journal_mode: string }, []>('PRAGMA journal_mode').get()?.journal_mode).toBe('wal');

    // close(true) finalizes outstanding statements and releases the connection immediately;
    // a plain close() leaves the file locked on Windows until they are collected.
    file.close(true);
  });
});
