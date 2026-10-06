import type { RouteDef } from '../../app/router.ts';

export const statsRoutes: RouteDef[] = [
  {
    pattern: /^\/?$/,
    keys: [],
    module: import.meta.resolve('./gz-dashboard.component.ts'),
    view: async () => {
      const { GzDashboardComponent } = await import('./gz-dashboard.component.ts');
      return new GzDashboardComponent();
    },
    nav: { path: '/', label: 'Dashboard' },
  },
];
