import type { DB } from '../../../db/db.ts';
import type { Iso8601Date } from '../../../../shared/flavors.ts';
import type { WeighIn } from '../ports/weigh-in.ts';

export class WeighInRepository {
  readonly #db: DB;

  constructor(db: DB) {
    this.#db = db;
  }

  list(since: Iso8601Date | null): WeighIn[] {
    return this.#db
      .query<WeighIn, [Iso8601Date | null]>('SELECT measured_on, weight FROM weigh_ins WHERE ?1 IS NULL OR measured_on >= ?1 ORDER BY measured_on')
      .all(since);
  }

  latest(): WeighIn | null {
    return this.#db.query<WeighIn, []>('SELECT measured_on, weight FROM weigh_ins ORDER BY measured_on DESC LIMIT 1').get();
  }

  get(date: Iso8601Date): WeighIn | null {
    return this.#db.query<WeighIn, [Iso8601Date]>('SELECT measured_on, weight FROM weigh_ins WHERE measured_on = ?').get(date);
  }

  put(date: Iso8601Date, weight: number): { weighIn: WeighIn; created: boolean } {
    return this.#db.transaction(() => {
      const created = this.get(date) === null;
      const weighIn = this.#db
        .query<WeighIn, [Iso8601Date, number]>(
          `INSERT INTO weigh_ins (measured_on, weight) VALUES (?, ?)
           ON CONFLICT (measured_on) DO UPDATE SET weight = excluded.weight
           RETURNING measured_on, weight`,
        )
        .get(date, weight);
      if (!weighIn) {
        throw new Error('Upsert of weigh-in returned no row');
      }
      return { weighIn, created };
    })();
  }

  putAll(weighIns: WeighIn[]): { created: number; replaced: number } {
    const exists = this.#db.query<{ found: 1 }, [Iso8601Date]>('SELECT 1 AS found FROM weigh_ins WHERE measured_on = ?');
    const upsert = this.#db.query<null, [Iso8601Date, number]>(
      `INSERT INTO weigh_ins (measured_on, weight) VALUES (?, ?)
       ON CONFLICT (measured_on) DO UPDATE SET weight = excluded.weight`,
    );
    return this.#db.transaction(() => {
      let replaced = 0;
      for (const { measured_on, weight } of weighIns) {
        if (exists.get(measured_on)) {
          replaced++;
        }
        upsert.run(measured_on, weight);
      }
      return { created: weighIns.length - replaced, replaced };
    })();
  }

  delete(date: Iso8601Date): boolean {
    return this.#db.query('DELETE FROM weigh_ins WHERE measured_on = ?').run(date).changes > 0;
  }
}
