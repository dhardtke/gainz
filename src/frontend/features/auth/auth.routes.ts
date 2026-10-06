import type { RouteDef } from '../../app/router.ts';

export const authRoutes: RouteDef[] = [
  {
    pattern: /^\/login\/?$/,
    keys: [],
    view: async () => {
      const { GzLoginComponent } = await import('./gz-login.component.ts');
      return new GzLoginComponent();
    },
    title: 'Log in',
  },
];
