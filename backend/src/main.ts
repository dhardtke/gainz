/**
 * The process entry point: open the database, applying anything pending, and serve until a
 * signal arrives.
 */
import { basename } from 'node:path';
import { DEFAULT_DB_PATH, openDatabase } from './db';
import { Repo } from './repo';
import { serveOptions } from './server';

function main(): void {
  const db = openDatabase(DEFAULT_DB_PATH, (migration) => {
    console.log(`applied ${basename(migration.file, '.sql')}`);
  });
  const repo = new Repo(db);
  const port = Number(process.env.PORT ?? 3000);

  const server = Bun.serve({ port, ...serveOptions(repo) });

  console.log(`gainz is lifting on ${server.url}`);
  console.log(`  database: ${DEFAULT_DB_PATH}`);

  const shutdown = async (): Promise<void> => {
    await server.stop();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

if (import.meta.main) {
  main();
}
