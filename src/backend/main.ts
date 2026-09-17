import { basename } from 'node:path';
import { DEFAULT_DB_PATH, openDatabase } from './db/db.ts';
import { DevFacade } from './features/dev/dev.facade.ts';
import { startServer } from './http/server.ts';

function main(): void {
  const db = openDatabase(DEFAULT_DB_PATH, (migration) => {
    console.log(`applied ${basename(migration.file, '.sql')}`);
  });
  const port = Number(process.env.PORT ?? 3000);

  const server = startServer(db, port);

  console.log(`gainz is running on ${server.url}`);
  console.log(`  database: ${DEFAULT_DB_PATH}`);
  if (DevFacade.enabled()) {
    console.log('  hot reload: on');
  }

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
