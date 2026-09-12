import { json, noContent, readJsonObject } from '../../http/http.ts';
import type { SetFacade } from './workouts.facade.ts';
import { toLiftSet } from './ports/set.ts';
import { fromEditSet } from './internal/set.mapper.ts';
import { translateToEditSetDto } from './internal/set.translator.ts';
import { pathId } from '../../shared/validate.ts';
import type { RouteTable } from '../../http/routing.ts';
import { guardAll } from '../../http/routing.ts';

export function setRoutes(sets: SetFacade): RouteTable {
  return {
    '/api/sets/:id': guardAll({
      GET: (req) => json(toLiftSet(sets.require(pathId(req.params.id, 'set')))),

      PATCH: async (req) => {
        const id = pathId(req.params.id, 'set');
        const patch = translateToEditSetDto(await readJsonObject(req));
        return json(toLiftSet(sets.update(id, fromEditSet(patch))));
      },

      DELETE: (req) => {
        sets.delete(pathId(req.params.id, 'set'));
        return noContent();
      },
    }),
  };
}
