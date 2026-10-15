import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { clearDatabase, type DB, openDatabase } from './db.ts';
import { schemaVersion } from './migrations.ts';
import { tables, useTempDir } from '../testing.ts';

const tempDir = useTempDir();

describe('the real migrations', () => {
  test('openDatabase applies them to an in-memory database', () => {
    const real = openDatabase(':memory:');

    for (const table of ['exercises', 'workouts', 'sets', 'schema_migrations']) {
      expect(tables(real)).toContain(table);
    }
    expect(schemaVersion(real)).toBe(8);

    real.close();
  });

  test('openDatabase enables WAL for a file-backed database', () => {
    const file = openDatabase(join(tempDir(), 'wal-check.sqlite'));

    expect(file.query<{ journal_mode: string }, []>('PRAGMA journal_mode').get()?.journal_mode).toBe('wal');

    // A plain close() leaves the file locked on Windows until outstanding statements are collected.
    file.close(true);
  });
});

describe('clearDatabase', () => {
  test('empties every table, restarts the ids and keeps the migration ledger', () => {
    const db = openDatabase(':memory:');
    db.run("INSERT INTO exercises (name) VALUES ('Bench Press')");
    db.run("INSERT INTO workouts (performed_on) VALUES ('2026-10-14')");
    db.run('INSERT INTO sets (workout_id, exercise_id, reps, weight) VALUES (1, 1, 5, 100)');

    clearDatabase(db);

    for (const table of ['exercises', 'workouts', 'sets']) {
      expect(db.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n).toBe(0);
    }
    expect(schemaVersion(db)).toBe(8);
    expect(db.query<{ id: number }, []>("INSERT INTO exercises (name) VALUES ('Squat') RETURNING id").get()?.id).toBe(1);
    expect(db.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get()?.foreign_keys).toBe(1);

    db.close();
  });

  function expectOldDataKept(refill: (db: DB) => void): void {
    const db = openDatabase(':memory:');
    db.run("INSERT INTO exercises (name) VALUES ('Bench Press')");

    expect(() => {
      clearDatabase(db, () => {
        refill(db);
      });
    }).toThrow();

    expect(db.query<{ name: string }, []>('SELECT name FROM exercises').all()).toEqual([{ name: 'Bench Press' }]);
    expect(db.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get()?.foreign_keys).toBe(1);
    db.close();
  }

  test('keeps the old data when the refill throws', () => {
    expectOldDataKept(() => {
      throw new Error('Seeding failed');
    });
  });

  test('keeps the old data when the refill leaves a dangling foreign key', () => {
    expectOldDataKept((db) => {
      db.run('INSERT INTO sets (workout_id, exercise_id, reps, weight) VALUES (99, 99, 5, 100)');
    });
  });
});
