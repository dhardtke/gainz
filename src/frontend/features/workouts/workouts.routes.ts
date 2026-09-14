import type { RouteDef } from '../../app/router.ts';

export const workoutsRoutes: RouteDef[] = [
  {
    pattern: /^\/workouts\/?$/,
    keys: [],
    view: async () => {
      const { GzWorkoutList } = await import('./gz-workout-list.ts');
      return new GzWorkoutList();
    },
    nav: { path: '/workouts', label: 'Workouts' },
  },
  {
    pattern: /^\/workouts\/(\d+)\/?$/,
    keys: ['id'],
    view: async ({ id }) => {
      const { GzWorkoutDetail } = await import('./gz-workout-detail.ts');
      const view = new GzWorkoutDetail();
      view.setAttribute('workout-id', id ?? '');
      return view;
    },
  },
];
