// The optional marker lets a plain number or string assign in without a cast, but not another flavor.
interface Flavoring<FlavorT> {
  _type?: FlavorT;
}
type Flavor<T, FlavorT> = T & Flavoring<FlavorT>;

export type WorkoutId = Flavor<number, 'WorkoutId'>;

export type ExerciseId = Flavor<number, 'ExerciseId'>;

export type LiftSetId = Flavor<number, 'LiftSetId'>;

export type Iso8601Date = Flavor<string, 'Iso8601Date'>; // YYYY-MM-DD

export type Iso8601DateTime = Flavor<string, 'Iso8601DateTime'>; // YYYY-MM-DDTHH:MM:SSZ
