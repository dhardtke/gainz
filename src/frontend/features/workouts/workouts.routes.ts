import type { RouteDef } from '../../app/router.ts';

export const workoutsRoutes: RouteDef[] = [
  {
    pattern: /^\/workouts\/?$/,
    keys: [],
    view: async () => {
      const { GzWorkoutListComponent } = await import('./gz-workout-list.component.ts');
      return new GzWorkoutListComponent();
    },
    title: 'Workouts',
    nav: { path: '/workouts', label: 'Workouts' },
  },
  {
    pattern: /^\/workouts\/(\d+)\/?$/,
    keys: ['id'],
    view: async ({ id }) => {
      const { GzWorkoutDetailComponent } = await import('./gz-workout-detail.component.ts');
      const view = new GzWorkoutDetailComponent();
      view.setAttribute('workout-id', id ?? '');
      return view;
    },
    title: 'Workout',
    parents: [{ path: '/workouts', label: 'Workouts' }],
  },
];
