import { basename } from 'node:path';
import { DEFAULT_DB_PATH, openDatabase } from './db/db.ts';
import { ExerciseRepository } from './features/exercises/internal/exercise.repository.ts';
import { SetRepository } from './features/workouts/internal/set.repository.ts';
import { StatsRepository } from './features/stats/internal/stats.repository.ts';
import { WorkoutRepository } from './features/workouts/internal/workout.repository.ts';
import { serveOptions } from './http/server.ts';

function main(): void {
  const db = openDatabase(DEFAULT_DB_PATH, (migration) => {
    console.log(`applied ${basename(migration.file, '.sql')}`);
  });
  const workouts = new WorkoutRepository(db);
  const repositories = {
    exercises: new ExerciseRepository(db),
    workouts,
    sets: new SetRepository(db, workouts),
    stats: new StatsRepository(db),
  };
  const port = Number(process.env.PORT ?? 3000);

  const server = Bun.serve({ port, ...serveOptions(repositories) });

  console.log(`gainz is running on ${server.url}`);
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
