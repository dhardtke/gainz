import type { RouteDef } from '../../app/router.ts';

export const exercisesRoutes: RouteDef[] = [
  {
    pattern: /^\/exercises\/?$/,
    keys: [],
    view: async () => {
      const { GzExerciseList } = await import('./gz-exercise-list.ts');
      return new GzExerciseList();
    },
    nav: { path: '/exercises', label: 'Exercises' },
  },
  {
    pattern: /^\/exercises\/(\d+)\/?$/,
    keys: ['id'],
    view: async ({ id }) => {
      const { GzExerciseDetail } = await import('./gz-exercise-detail.ts');
      const view = new GzExerciseDetail();
      view.setAttribute('exercise-id', id ?? '');
      return view;
    },
  },
];
