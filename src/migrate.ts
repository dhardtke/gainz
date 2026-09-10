/**
 * Applies any pending schema migrations without starting the server. The server does the same on
 * boot, so this is only for doing it deliberately — before a backup, or to see what a new file did.
 */
import { basename } from "node:path";
import { DEFAULT_DB_PATH, openDatabase } from "./db";
import { schemaVersion } from "./migrations";

function main() {
  console.log(`database: ${DEFAULT_DB_PATH}`);

  let applied = 0;
  const db = openDatabase(DEFAULT_DB_PATH, (migration) => {
    applied++;
    console.log(`  applied ${basename(migration.file, ".sql")}`);
  });

  const version = schemaVersion(db);
  console.log(applied > 0 ? `now at schema version ${version}` : `already at schema version ${version} — nothing to apply`);
  db.close();
}

if (import.meta.main) {
  main();
}
