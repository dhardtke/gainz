import type { MuscleGroup, MuscleGroupFilter } from '../../../../shared/muscle-group.ts';
import type { RawHtml } from '../../../ui/html.ts';
import { html } from '../../../ui/html.ts';

export const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full body'] as const satisfies readonly MuscleGroup[];

function isMuscleGroup(value: string | null | undefined): value is MuscleGroup {
  return (MUSCLE_GROUPS as readonly (string | null | undefined)[]).includes(value);
}

export function parseMuscleGroup(value: string | null | undefined): MuscleGroup | null {
  return isMuscleGroup(value) ? value : null;
}

/** `null` is "All", as is any value that is neither a group nor `none`. */
export function parseMuscleGroupFilter(search: string): MuscleGroupFilter | null {
  const value = new URLSearchParams(search).get('muscleGroup');
  return value === 'none' ? 'none' : parseMuscleGroup(value);
}

export function exercisesPath(filter: MuscleGroupFilter | null, page: number): string {
  const query = new URLSearchParams();
  if (filter !== null) {
    query.set('muscleGroup', filter);
  }
  if (page !== 1) {
    query.set('page', String(page));
  }
  const search = query.toString();
  return search === '' ? '/exercises' : `/exercises?${search}`;
}

export function muscleGroupFilterOptions(selected: MuscleGroupFilter | null): RawHtml {
  return html`
    <option value="" ${selected === null ? 'selected' : ''}>All</option>
    ${MUSCLE_GROUPS.map((group) => html`<option value="${group}" ${group === selected ? 'selected' : ''}>${group}</option>`)}
    <option value="none" ${selected === 'none' ? 'selected' : ''}>No muscle group</option>
  `;
}

export function muscleGroupOptions(selected: MuscleGroup | null): RawHtml {
  return html`
    <option value="" ${selected === null ? 'selected' : ''}>None</option>
    ${MUSCLE_GROUPS.map((group) => html`<option value="${group}" ${group === selected ? 'selected' : ''}>${group}</option>`)}
  `;
}
