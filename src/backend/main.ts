import { basename } from 'node:path';
import { DEFAULT_DB_PATH, openDatabase } from './db/db.ts';
import { isPasswordHash } from './features/auth/auth.facade.ts';
import { DevFacade } from './features/dev/dev.facade.ts';
import { startServer } from './http/server.ts';

function main(): void {
  const passwordHash = process.env.GAINZ_PASSWORD_HASH ?? '';
  if (passwordHash !== '' && !isPasswordHash(passwordHash)) {
    console.error('GAINZ_PASSWORD_HASH is not an argon2 or bcrypt hash; create one with `bun run hash-password`');
    process.exit(1);
  }

  const db = openDatabase(DEFAULT_DB_PATH, (migration) => {
    console.log(`applied ${basename(migration.file, '.sql')}`);
  });
  const port = Number(process.env.PORT ?? 3000);

  const server = startServer(db, port, { passwordHash: passwordHash === '' ? null : passwordHash });

  console.log(`gainz is running on ${server.url}`);
  console.log(`  database: ${DEFAULT_DB_PATH}`);
  console.log(passwordHash === '' ? '  auth: off (GAINZ_PASSWORD_HASH is not set)' : '  auth: on');
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
