import type { RouteDef } from '../../app/router.ts';

export const exercisesRoutes: RouteDef[] = [
  {
    pattern: /^\/exercises\/?$/,
    keys: [],
    module: import.meta.resolve('./gz-exercise-list.component.ts'),
    view: async () => {
      const { GzExerciseListComponent } = await import('./gz-exercise-list.component.ts');
      return new GzExerciseListComponent();
    },
    title: 'Exercises',
    nav: { path: '/exercises', label: 'Exercises' },
  },
  {
    pattern: /^\/exercises\/(\d+)\/?$/,
    keys: ['id'],
    module: import.meta.resolve('./gz-exercise-detail.component.ts'),
    view: async ({ id }) => {
      const { GzExerciseDetailComponent } = await import('./gz-exercise-detail.component.ts');
      const view = new GzExerciseDetailComponent();
      view.setAttribute('exercise-id', id ?? '');
      return view;
    },
    title: 'Exercise',
    parents: [{ path: '/exercises', label: 'Exercises' }],
  },
];
