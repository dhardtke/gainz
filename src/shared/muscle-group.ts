export type MuscleGroup = 'Chest' | 'Back' | 'Shoulders' | 'Arms' | 'Legs' | 'Core' | 'Full body';

/** A group, or `none` for exercises without one. */
export type MuscleGroupFilter = MuscleGroup | 'none';
