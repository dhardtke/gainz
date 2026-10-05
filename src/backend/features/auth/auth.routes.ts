/**
 * Logging in and out. Both stay public: the login is how a cookie is earned, and the logout only
 * expires one. Everything the guard protects is wrapped in `allRoutes()`, not here.
 */
import type { RouteTable } from '../../http/routing.ts';
import type { AuthFacade } from './auth.facade.ts';
import { AuthController } from './internal/auth.controller.ts';

export function authRoutes(auth: AuthFacade): RouteTable {
  const controller = new AuthController(auth);
  return {
    '/api/auth/login': {
      POST: (req) => controller.login(req),
    },

    '/api/auth/logout': {
      POST: () => controller.logout(),
    },
  };
}
