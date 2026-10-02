import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { migrate, type MigrateResult, MIGRATIONS_DIR, readMigrations, schemaVersion } from './migrations.ts';
import { at, tables, useTempDir } from '../testing.ts';

const tempDir = useTempDir();
let db: Database;

beforeEach(() => {
  db = new Database(':memory:', { create: true });
  db.run('PRAGMA foreign_keys = ON;');
});

afterEach(() => {
  db.close();
});

/** Writes a fixture migration into the temp directory. */
function write(filename: string, sql: string): void {
  writeFileSync(join(tempDir(), filename), sql);
}

function run(): MigrateResult {
  return migrate(db, { dir: tempDir() });
}

function foreignKeysOn(database: Database): boolean {
  return database.prepare<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get()?.foreign_keys === 1;
}

describe('migration runner', () => {
  test('applies every migration to a fresh database, in version order', () => {
    // Written out of order on purpose: the ALTER only parses if 001 ran first.
    write('002-add-color.sql', 'ALTER TABLE widgets ADD COLUMN color TEXT;');
    write('001-create-widgets.sql', 'CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL);');

    const result = run();

    expect(result.applied.map((migration) => migration.version)).toEqual([1, 2]);
    expect(result.applied.map((migration) => migration.name)).toEqual(['create-widgets', 'add-color']);
    expect(result.version).toBe(2);
    expect(db.query('SELECT color FROM widgets').all()).toEqual([]);
  });

  test('is a no-op on an already-migrated database', () => {
    write('001-create-widgets.sql', 'CREATE TABLE widgets (id INTEGER PRIMARY KEY);');
    run();

    const again = run();

    expect(again.applied).toEqual([]);
    expect(again.version).toBe(1);
  });

  test('applies only the pending migrations', () => {
    write('001-create-widgets.sql', 'CREATE TABLE widgets (id INTEGER PRIMARY KEY);');
    run();

    write('002-add-color.sql', 'ALTER TABLE widgets ADD COLUMN color TEXT;');
    const result = run();

    expect(result.applied.map((migration) => migration.name)).toEqual(['add-color']);
    expect(result.version).toBe(2);
  });

  test('rolls back and rethrows when a migration fails part-way', () => {
    write('001-create-widgets.sql', 'CREATE TABLE widgets (id INTEGER PRIMARY KEY);');
    // The table is created, then the second insert violates the primary key at run time — so this
    // fails only after the DDL has taken effect, which is what makes it a rollback test.
    write('002-broken.sql', 'CREATE TABLE gadgets (id INTEGER PRIMARY KEY);\nINSERT INTO gadgets (id) VALUES (1);\nINSERT INTO gadgets (id) VALUES (1);');

    expect(() => run()).toThrow(/002-broken\.sql/);

    expect(schemaVersion(db)).toBe(1);
    expect(tables(db)).not.toContain('gadgets');
  });

  test('refuses a migration numbered at or below the highest applied version', () => {
    write('001-create-widgets.sql', 'CREATE TABLE widgets (id INTEGER PRIMARY KEY);');
    write('003-create-gadgets.sql', 'CREATE TABLE gadgets (id INTEGER PRIMARY KEY);');
    run();

    write('002-late-addition.sql', 'CREATE TABLE doodads (id INTEGER PRIMARY KEY);');

    expect(() => run()).toThrow(/002-late-addition\.sql/);
    expect(tables(db)).not.toContain('doodads');
  });

  test('refuses two migrations that share a version number', () => {
    write('001-create-widgets.sql', 'CREATE TABLE widgets (id INTEGER PRIMARY KEY);');
    write('001-create-gadgets.sql', 'CREATE TABLE gadgets (id INTEGER PRIMARY KEY);');

    expect(() => run()).toThrow(/share version 1/);
  });

  test('refuses a .sql file that is not named <version>-<name>.sql', () => {
    write('initial.sql', 'CREATE TABLE widgets (id INTEGER PRIMARY KEY);');

    expect(() => run()).toThrow(/initial\.sql/);
  });

  test('refuses a database that is newer than the checkout', () => {
    write('001-create-widgets.sql', 'CREATE TABLE widgets (id INTEGER PRIMARY KEY);');
    run();

    db.query('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(99, 'add-programs');

    expect(() => run()).toThrow(/99 \(add-programs\)/);
  });

  test('refuses a database whose ledger has a version between two files', () => {
    write('001-create-widgets.sql', 'CREATE TABLE widgets (id INTEGER PRIMARY KEY);');
    write('003-create-gadgets.sql', 'CREATE TABLE gadgets (id INTEGER PRIMARY KEY);');
    run();

    db.query('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(2, 'removed-file');

    expect(() => run()).toThrow(/2 \(removed-file\)/);
  });

  test('rolls back a migration that leaves orphaned rows', () => {
    write(
      '001-create-widgets.sql',
      `CREATE TABLE widgets (id INTEGER PRIMARY KEY);
       CREATE TABLE parts (id INTEGER PRIMARY KEY, widget_id INTEGER NOT NULL REFERENCES widgets (id));`,
    );
    run();

    // Foreign keys are off during the run, so this insert succeeds and only foreign_key_check catches it.
    write('002-orphan.sql', 'INSERT INTO parts (id, widget_id) VALUES (1, 404);');

    expect(() => run()).toThrow(/orphaned rows in "parts"/);
    expect(schemaVersion(db)).toBe(1);
    expect(db.query('SELECT id FROM parts').all()).toEqual([]);
  });

  test('leaves foreign keys on after a successful run and after a failed one', () => {
    write('001-create-widgets.sql', 'CREATE TABLE widgets (id INTEGER PRIMARY KEY);');
    run();
    expect(foreignKeysOn(db)).toBe(true);

    write('002-broken.sql', 'UPDATE nope SET x = 1;');
    expect(() => run()).toThrow();
    expect(foreignKeysOn(db)).toBe(true);
  });
});

describe('the real migrations', () => {
  test('are read from disk by bare filename, with their SQL', () => {
    const initial = readMigrations(MIGRATIONS_DIR).find((source) => source.filename === '001-initial-schema.sql');

    expect(initial?.sql).toContain('CREATE TABLE');
  });

  test('report what they applied by bare filename', () => {
    const fresh = new Database(':memory:', { create: true });

    const result = migrate(fresh);

    expect(at(result.applied, 0).file).toBe('001-initial-schema.sql');
    fresh.close();
  });

  test('adopt a database that already has the schema but no ledger', () => {
    // How an existing data/gainz.sqlite, created before migrations existed, is taken over.
    const legacy = new Database(':memory:', { create: true });
    legacy.run(readFileSync(join(MIGRATIONS_DIR, '001-initial-schema.sql'), 'utf8'));
    legacy.query('INSERT INTO exercises (name) VALUES (?)').run('Back Squat');
    expect(schemaVersion(legacy)).toBe(0);

    const result = migrate(legacy);

    expect(result.applied.map((migration) => migration.version)).toEqual([1, 2, 3]);
    expect(schemaVersion(legacy)).toBe(3);
    // The row it already held is untouched.
    expect(legacy.query<{ name: string }, []>('SELECT name FROM exercises').all()).toEqual([{ name: 'Back Squat' }]);

    legacy.close();
  });

  test('mark every set logged before 002 as done, and none after', () => {
    const legacy = new Database(':memory:', { create: true });
    legacy.run(readFileSync(join(MIGRATIONS_DIR, '001-initial-schema.sql'), 'utf8'));
    legacy.run("INSERT INTO exercises (name) VALUES ('Back Squat')");
    legacy.run("INSERT INTO workouts (performed_on) VALUES ('2026-01-05')");
    legacy.run('INSERT INTO sets (workout_id, exercise_id, reps, weight) VALUES (1, 1, 5, 100)');

    migrate(legacy);
    legacy.run('INSERT INTO sets (workout_id, exercise_id, reps, weight) VALUES (1, 1, 5, 105)');

    expect(legacy.query<{ done: number }, []>('SELECT done FROM sets ORDER BY id').all()).toEqual([{ done: 1 }, { done: 0 }]);
    expect(() => legacy.run('UPDATE sets SET done = 2 WHERE id = 1')).toThrow();

    legacy.close();
  });

  test("backfill each workout's exercises in the order their first set appears", () => {
    const legacy = new Database(':memory:', { create: true });
    legacy.run(readFileSync(join(MIGRATIONS_DIR, '001-initial-schema.sql'), 'utf8'));
    legacy.run("INSERT INTO exercises (name) VALUES ('Bench Press'), ('Barbell Row')");
    legacy.run("INSERT INTO workouts (performed_on) VALUES ('2026-01-05'), ('2026-01-07')");
    legacy.run('INSERT INTO sets (workout_id, exercise_id, reps, weight, position) VALUES (1, 2, 5, 60, 1), (1, 1, 5, 80, 2), (1, 2, 5, 60, 3)');

    migrate(legacy);

    const rows = legacy
      .query<{ workout_id: number; exercise_id: number; position: number }, []>(
        'SELECT workout_id, exercise_id, position FROM workout_exercises ORDER BY workout_id, position',
      )
      .all();
    expect(rows).toEqual([
      { workout_id: 1, exercise_id: 2, position: 1 },
      { workout_id: 1, exercise_id: 1, position: 2 },
    ]);

    legacy.close();
  });
});
