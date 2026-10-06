import type { RouteDef } from '../../app/router.ts';

export const authRoutes: RouteDef[] = [
  {
    pattern: /^\/login\/?$/,
    keys: [],
    module: import.meta.resolve('./gz-login.component.ts'),
    view: async () => {
      const { GzLoginComponent } = await import('./gz-login.component.ts');
      return new GzLoginComponent();
    },
    title: 'Log in',
  },
];
