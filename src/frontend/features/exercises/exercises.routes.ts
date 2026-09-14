import type { RouteDef } from '../../app/router.ts';

export const exercisesRoutes: RouteDef[] = [
  {
    pattern: /^\/exercises\/?$/,
    keys: [],
    view: async () => {
      const { GzExerciseListComponent } = await import('./gz-exercise-list.component.ts');
      return new GzExerciseListComponent();
    },
    nav: { path: '/exercises', label: 'Exercises' },
  },
  {
    pattern: /^\/exercises\/(\d+)\/?$/,
    keys: ['id'],
    view: async ({ id }) => {
      const { GzExerciseDetailComponent } = await import('./gz-exercise-detail.component.ts');
      const view = new GzExerciseDetailComponent();
      view.setAttribute('exercise-id', id ?? '');
      return view;
    },
  },
];
