import { basename } from 'node:path';
import { DEFAULT_DB_PATH, openDatabase } from '../backend/db/db.ts';
import { schemaVersion } from '../backend/db/migrations.ts';

function main(): void {
  console.log(`database: ${DEFAULT_DB_PATH}`);

  let applied = 0;
  const db = openDatabase(DEFAULT_DB_PATH, (migration) => {
    applied++;
    console.log(`  applied ${basename(migration.file, '.sql')}`);
  });

  const version = schemaVersion(db);
  console.log(applied > 0 ? `now at schema version ${version}` : `already at schema version ${version} — nothing to apply`);
  db.close();
}

if (import.meta.main) {
  main();
}
