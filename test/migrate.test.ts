import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db";
import { MIGRATIONS_DIR, migrate, schemaVersion } from "../src/migrations";

let dir: string;
let db: Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gainz-migrations-"));
  db = new Database(":memory:", { create: true });
  db.run("PRAGMA foreign_keys = ON;");
});

afterEach(() => {
  db.close();
  // Recursive, so the WAL/SHM sidecars of any file database written here go too. Windows releases
  // the handle a moment after close(), so retry rather than fail the test on EBUSY.
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

/** Writes a fixture migration into the temp directory. */
function write(filename: string, sql: string): void {
  writeFileSync(join(dir, filename), sql);
}

function run() {
  return migrate(db, { dir });
}

function tables(database: Database): string[] {
  return database
    .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => row.name);
}

function foreignKeysOn(database: Database): boolean {
  return database.prepare<{ foreign_keys: number }, []>("PRAGMA foreign_keys").get()?.foreign_keys === 1;
}

describe("migration runner", () => {
  test("applies every migration to a fresh database, in version order", () => {
    // Written out of order on purpose: the ALTER only parses if 001 ran first.
    write("002-add-colour.sql", "ALTER TABLE widgets ADD COLUMN colour TEXT;");
    write("001-create-widgets.sql", "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL);");

    const result = run();

    expect(result.applied.map((migration) => migration.version)).toEqual([1, 2]);
    expect(result.applied.map((migration) => migration.name)).toEqual(["create-widgets", "add-colour"]);
    expect(result.version).toBe(2);
    expect(db.query("SELECT colour FROM widgets").all()).toEqual([]);
  });

  test("is a no-op on an already-migrated database", () => {
    write("001-create-widgets.sql", "CREATE TABLE widgets (id INTEGER PRIMARY KEY);");
    run();

    const again = run();

    expect(again.applied).toEqual([]);
    expect(again.version).toBe(1);
  });

  test("applies only the pending migrations", () => {
    write("001-create-widgets.sql", "CREATE TABLE widgets (id INTEGER PRIMARY KEY);");
    run();

    write("002-add-colour.sql", "ALTER TABLE widgets ADD COLUMN colour TEXT;");
    const result = run();

    expect(result.applied.map((migration) => migration.name)).toEqual(["add-colour"]);
    expect(result.version).toBe(2);
  });

  test("rolls back and rethrows when a migration fails part-way", () => {
    write("001-create-widgets.sql", "CREATE TABLE widgets (id INTEGER PRIMARY KEY);");
    // The table is created, then the second insert violates the primary key at run time — so this
    // fails only after the DDL has taken effect, which is what makes it a rollback test.
    write("002-broken.sql", "CREATE TABLE gadgets (id INTEGER PRIMARY KEY);\nINSERT INTO gadgets (id) VALUES (1);\nINSERT INTO gadgets (id) VALUES (1);");

    expect(() => run()).toThrow(/002-broken\.sql/);

    expect(schemaVersion(db)).toBe(1);
    expect(tables(db)).not.toContain("gadgets");
  });

  test("refuses a migration numbered at or below the highest applied version", () => {
    write("001-create-widgets.sql", "CREATE TABLE widgets (id INTEGER PRIMARY KEY);");
    write("003-create-gadgets.sql", "CREATE TABLE gadgets (id INTEGER PRIMARY KEY);");
    run();

    write("002-late-addition.sql", "CREATE TABLE doodads (id INTEGER PRIMARY KEY);");

    expect(() => run()).toThrow(/002-late-addition\.sql/);
    expect(tables(db)).not.toContain("doodads");
  });

  test("refuses two migrations that share a version number", () => {
    write("001-create-widgets.sql", "CREATE TABLE widgets (id INTEGER PRIMARY KEY);");
    write("001-create-gadgets.sql", "CREATE TABLE gadgets (id INTEGER PRIMARY KEY);");

    expect(() => run()).toThrow(/share version 1/);
  });

  test("refuses a .sql file that is not named <version>-<name>.sql", () => {
    write("initial.sql", "CREATE TABLE widgets (id INTEGER PRIMARY KEY);");

    expect(() => run()).toThrow(/initial\.sql/);
  });

  test("refuses a database that is newer than the checkout", () => {
    write("001-create-widgets.sql", "CREATE TABLE widgets (id INTEGER PRIMARY KEY);");
    run();

    db.query("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(99, "add-programs");

    expect(() => run()).toThrow(/99 \(add-programs\)/);
  });

  test("rolls back a migration that leaves orphaned rows", () => {
    write(
      "001-create-widgets.sql",
      `CREATE TABLE widgets (id INTEGER PRIMARY KEY);
       CREATE TABLE parts (id INTEGER PRIMARY KEY, widget_id INTEGER NOT NULL REFERENCES widgets (id));`,
    );
    run();

    // Foreign keys are off during the run, so this insert succeeds and only foreign_key_check catches it.
    write("002-orphan.sql", "INSERT INTO parts (id, widget_id) VALUES (1, 404);");

    expect(() => run()).toThrow(/orphaned rows in "parts"/);
    expect(schemaVersion(db)).toBe(1);
    expect(db.query("SELECT id FROM parts").all()).toEqual([]);
  });

  test("leaves foreign keys on after a successful run and after a failed one", () => {
    write("001-create-widgets.sql", "CREATE TABLE widgets (id INTEGER PRIMARY KEY);");
    run();
    expect(foreignKeysOn(db)).toBe(true);

    write("002-broken.sql", "UPDATE nope SET x = 1;");
    expect(() => run()).toThrow();
    expect(foreignKeysOn(db)).toBe(true);
  });
});

describe("the real migrations", () => {
  test("openDatabase applies them to an in-memory database", () => {
    const real = openDatabase(":memory:");

    expect(tables(real)).toEqual(expect.arrayContaining(["exercises", "workouts", "sets", "schema_migrations"]));
    expect(schemaVersion(real)).toBe(1);

    real.close();
  });

  test("openDatabase enables WAL for a file-backed database", () => {
    const file = openDatabase(join(dir, "wal-check.sqlite"));

    expect(file.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()?.journal_mode).toBe("wal");

    // close(true) finalizes outstanding statements and releases the connection immediately;
    // a plain close() leaves the file locked on Windows until they are collected.
    file.close(true);
  });

  test("adopt a database that already has the schema but no ledger", () => {
    // How an existing data/gainz.sqlite, created before migrations existed, is taken over.
    const legacy = new Database(":memory:", { create: true });
    legacy.run(readFileSync(join(MIGRATIONS_DIR, "001-initial-schema.sql"), "utf8"));
    legacy.query("INSERT INTO exercises (name) VALUES (?)").run("Back Squat");
    expect(schemaVersion(legacy)).toBe(0);

    const result = migrate(legacy);

    expect(result.applied.map((migration) => migration.version)).toEqual([1]);
    expect(schemaVersion(legacy)).toBe(1);
    // The row it already held is untouched.
    expect(legacy.query<{ name: string }, []>("SELECT name FROM exercises").all()).toEqual([{ name: "Back Squat" }]);

    legacy.close();
  });
});
