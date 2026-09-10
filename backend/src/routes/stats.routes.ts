import { json } from "../http";
import type { Repo } from "../repo";
import type { RouteTable } from "./shared";
import { guardAll } from "./shared";

export function statsRoutes(repo: Repo): RouteTable {
  return {
    "/api/stats/summary": guardAll({
      GET: () => json(repo.summary()),
    }),
  };
}
