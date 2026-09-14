import type { RouteDef } from '../../app/router.ts';

export const statsRoutes: RouteDef[] = [
  {
    pattern: /^\/?$/,
    keys: [],
    view: async () => {
      const { GzDashboard } = await import('./gz-dashboard.ts');
      return new GzDashboard();
    },
    nav: { path: '/', label: 'Dashboard' },
  },
];
