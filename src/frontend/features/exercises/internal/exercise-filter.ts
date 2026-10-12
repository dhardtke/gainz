import type { ExerciseFilterDto, ExerciseType } from '../../../../shared/dto/exercise.ts';
import type { RawHtml } from '../../../ui/html.ts';
import { html } from '../../../ui/html.ts';
import { parseMuscleGroupFilter } from './muscle-groups.ts';

export const EXERCISE_TYPES = ['bodyweight', 'weighted'] as const satisfies readonly ExerciseType[];

const TYPE_LABELS: Record<ExerciseType, string> = { bodyweight: 'Bodyweight', weighted: 'Weighted' };

export function parseExerciseType(value: string | null | undefined): ExerciseType | null {
  return EXERCISE_TYPES.find((type) => type === value) ?? null;
}

/** An unknown value of either filter reads as "All". */
export function parseExerciseFilter(search: string): ExerciseFilterDto {
  const muscleGroup = parseMuscleGroupFilter(search);
  const type = parseExerciseType(new URLSearchParams(search).get('type'));
  return { ...(muscleGroup === null ? {} : { muscleGroup }), ...(type === null ? {} : { type }) };
}

export function isFiltered(filter: ExerciseFilterDto): boolean {
  return filter.muscleGroup !== undefined || filter.type !== undefined;
}

export function exercisesPath(filter: ExerciseFilterDto, page: number): string {
  const query = new URLSearchParams();
  if (filter.muscleGroup !== undefined) {
    query.set('muscleGroup', filter.muscleGroup);
  }
  if (filter.type !== undefined) {
    query.set('type', filter.type);
  }
  if (page !== 1) {
    query.set('page', String(page));
  }
  const search = query.toString();
  return search === '' ? '/exercises' : `/exercises?${search}`;
}

export function typeFilterOptions(selected: ExerciseType | undefined): RawHtml {
  return html`
    <option value="" ${selected === undefined ? 'selected' : ''}>All</option>
    ${EXERCISE_TYPES.map((type) => html`<option value="${type}" ${type === selected ? 'selected' : ''}>${TYPE_LABELS[type]}</option>`)}
  `;
}
