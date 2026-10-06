import { basename } from 'node:path';
import { DEFAULT_DB_PATH, openDatabase } from './db/db.ts';
import { isPasswordHash } from './features/auth/auth.facade.ts';
import { DevFacade } from './features/dev/dev.facade.ts';
import { startServer } from './http/server.ts';
import { log } from './shared/log.ts';

function main(): void {
  try {
    const passwordHash = process.env.GAINZ_PASSWORD_HASH ?? '';
    if (passwordHash !== '' && !isPasswordHash(passwordHash)) {
      log.error('server', 'GAINZ_PASSWORD_HASH is not an argon2 or bcrypt hash; create one with `bun run hash-password`');
      process.exit(1);
    }

    const db = openDatabase(DEFAULT_DB_PATH, (migration) => {
      log.info('db', `applied ${basename(migration.file, '.sql')}`);
    });
    const port = Number(process.env.PORT ?? 3000);

    const server = startServer(db, port, { passwordHash: passwordHash === '' ? null : passwordHash });

    log.info('server', `gainz is running on ${server.url}`);
    log.info('server', `database: ${DEFAULT_DB_PATH}`);
    log.info('server', passwordHash === '' ? 'auth: off (GAINZ_PASSWORD_HASH is not set)' : 'auth: on');
    if (DevFacade.enabled()) {
      log.info('server', 'hot reload: on');
    }

    const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
      log.info('server', `stopping (${signal})`);
      await server.stop();
      db.close();
      process.exit(0);
    };
    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
  } catch (err) {
    log.error('server', 'failed to start', err);
    process.exit(1);
  }

  // Startup is synchronous and covered above; these catch what runs after it — request callbacks
  // outside the route wrappers, timers, sockets.
  process.on('uncaughtException', (err) => {
    log.error('server', 'uncaught exception', err);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    log.error('server', 'unhandled rejection', reason);
    process.exit(1);
  });
}

if (import.meta.main) {
  main();
}
