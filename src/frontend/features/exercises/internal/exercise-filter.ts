import type { ExerciseFilterDto } from '../../../../shared/dto/exercise.ts';
import type { ExerciseKind } from '../../../../shared/exercise-kind.ts';
import type { RawHtml } from '../../../ui/html.ts';
import { html } from '../../../ui/html.ts';
import { parseMuscleGroupFilter } from './muscle-groups.ts';

export const EXERCISE_KINDS = ['weighted', 'bodyweight', 'assisted'] as const satisfies readonly ExerciseKind[];

export const KIND_LABELS: Record<ExerciseKind, string> = { weighted: 'Weighted', bodyweight: 'Bodyweight', assisted: 'Assisted' };

export function parseExerciseKind(value: string | null | undefined): ExerciseKind | null {
  return EXERCISE_KINDS.find((kind) => kind === value) ?? null;
}

/** An unknown value of either filter reads as "All". */
export function parseExerciseFilter(search: string): ExerciseFilterDto {
  const muscleGroup = parseMuscleGroupFilter(search);
  const type = parseExerciseKind(new URLSearchParams(search).get('type'));
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

export function typeFilterOptions(selected: ExerciseKind | undefined): RawHtml {
  return html`
    <option value="" ${selected === undefined ? 'selected' : ''}>All</option>
    ${kindOptions(selected)}
  `;
}

export function kindOptions(selected: ExerciseKind | undefined): RawHtml {
  return html`${EXERCISE_KINDS.map((kind) => html`<option value="${kind}" ${kind === selected ? 'selected' : ''}>${KIND_LABELS[kind]}</option>`)}`;
}
