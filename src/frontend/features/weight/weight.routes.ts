import type { RouteDef } from '../../app/router.ts';

export const weightRoutes: RouteDef[] = [
  {
    pattern: /^\/weight\/?$/,
    keys: [],
    view: async () => {
      const { GzWeightComponent } = await import('./gz-weight.component.ts');
      return new GzWeightComponent();
    },
    title: 'Weight',
    nav: { path: '/weight', label: 'Weight' },
  },
];
