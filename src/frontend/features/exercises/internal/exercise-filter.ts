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

const MAX_SEARCH_LENGTH = 120;

/** An unknown value of any filter reads as "All"; an empty or over-long search as none. */
export function parseExerciseFilter(query: string): ExerciseFilterDto {
  const params = new URLSearchParams(query);
  const muscleGroup = parseMuscleGroupFilter(query);
  const type = parseExerciseKind(params.get('type'));
  const search = params.get('search')?.trim() ?? '';
  return {
    ...(muscleGroup === null ? {} : { muscleGroup }),
    ...(type === null ? {} : { type }),
    ...(search === '' || search.length > MAX_SEARCH_LENGTH ? {} : { search }),
  };
}

export function isFiltered(filter: ExerciseFilterDto): boolean {
  return filter.muscleGroup !== undefined || filter.type !== undefined || filter.search !== undefined;
}

export function exercisesPath(filter: ExerciseFilterDto, page: number): string {
  const query = new URLSearchParams();
  if (filter.muscleGroup !== undefined) {
    query.set('muscleGroup', filter.muscleGroup);
  }
  if (filter.type !== undefined) {
    query.set('type', filter.type);
  }
  if (filter.search !== undefined) {
    query.set('search', filter.search);
  }
  if (page !== 1) {
    query.set('page', String(page));
  }
  const queryString = query.toString();
  return queryString === '' ? '/exercises' : `/exercises?${queryString}`;
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
