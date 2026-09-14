/**
 * Flavored primitives: an id or a date carries the name of what it is.
 *
 * The marker is optional, so a plain `number` or `string` still flows into a flavor and
 * nothing here needs a cast — `pathId()`, `Number(dataset.id)` and a parsed JSON body all
 * assign straight in. What the marker refuses is one flavor standing in for another.
 */
interface Flavoring<FlavorT> {
  _type?: FlavorT;
}
type Flavor<T, FlavorT> = T & Flavoring<FlavorT>;

export type WorkoutId = Flavor<number, 'WorkoutId'>;

export type ExerciseId = Flavor<number, 'ExerciseId'>;

export type LiftSetId = Flavor<number, 'LiftSetId'>;

export type Iso8601Date = Flavor<string, 'Iso8601Date'>; // YYYY-MM-DD

export type Iso8601DateTime = Flavor<string, 'Iso8601DateTime'>; // YYYY-MM-DDTHH:MM:SSZ
