import type { RouteDef } from '../../app/router.ts';

export const statsRoutes: RouteDef[] = [
  {
    pattern: /^\/?$/,
    keys: [],
    view: async () => {
      const { GzDashboardComponent } = await import('./gz-dashboard.component.ts');
      return new GzDashboardComponent();
    },
    nav: { path: '/', label: 'Dashboard' },
  },
];

export const statisticsRoutes: RouteDef[] = [
  {
    pattern: /^\/stats\/?$/,
    keys: [],
    view: async () => {
      const { GzStatsComponent } = await import('./gz-stats.component.ts');
      return new GzStatsComponent();
    },
    title: 'Statistics',
    nav: { path: '/stats', label: 'Statistics' },
  },
];
