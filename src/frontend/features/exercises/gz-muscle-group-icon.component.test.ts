import { beforeAll, expect, test } from 'bun:test';
import { find, mount, shadow, testId, useDom } from '../../testing.ts';
import { MUSCLE_GROUPS } from './internal/muscle-groups.ts';

useDom();

beforeAll(async () => {
  await import('./gz-muscle-group-icon.component.ts');
});

const icon = (host: HTMLElement): SVGSVGElement => find<SVGSVGElement>(shadow(host), testId('icon'));

test.each([...MUSCLE_GROUPS])('draws %s', (group) => {
  const host = mount('gz-muscle-group-icon', { group });
  expect(icon(host).dataset.group).toBe(group);
  expect(host.hidden).toBe(false);
});

test('draws each group differently', () => {
  const drawings = MUSCLE_GROUPS.map((group) => icon(mount('gz-muscle-group-icon', { group })).innerHTML);
  expect(new Set(drawings).size).toBe(MUSCLE_GROUPS.length);
});

test('is decorative without a label', () => {
  const svg = icon(mount('gz-muscle-group-icon', { group: 'Legs' }));
  expect(svg.getAttribute('aria-hidden')).toBe('true');
  expect(svg.hasAttribute('role')).toBe(false);
  expect(svg.querySelector('title')).toBeNull();
});

test('is announced with a label, which is also its tooltip', () => {
  const svg = icon(mount('gz-muscle-group-icon', { group: 'Legs', label: 'Legs' }));
  expect(svg.getAttribute('role')).toBe('img');
  expect(svg.getAttribute('aria-label')).toBe('Legs');
  expect(svg.querySelector('title')?.textContent).toBe('Legs');
  expect(svg.hasAttribute('aria-hidden')).toBe(false);
});

test.each<Record<string, string>>([{}, { group: '' }, { group: 'Neck' }])('hides itself without a known group (%o)', (attributes) => {
  const host = mount('gz-muscle-group-icon', attributes);
  expect(shadow(host).querySelector('svg')).toBeNull();
  expect(host.hidden).toBe(true);
});

test('shows itself once given a known group', () => {
  const host = mount('gz-muscle-group-icon', { group: 'Neck' });
  host.setAttribute('group', 'Core');
  expect(icon(host).dataset.group).toBe('Core');
  expect(host.hidden).toBe(false);
});
