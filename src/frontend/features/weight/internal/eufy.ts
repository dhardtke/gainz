import type { WeighInDto } from '../../../../shared/dto/weight.ts';
import type { Iso8601Date } from '../../../../shared/flavors.ts';

export interface EufyMember {
  name: string;
  /** Oldest first, one per date: the day's last reading. */
  weighIns: WeighInDto[];
}

export class EufyFormatError extends Error {}

const BOM = String.fromCharCode(0xfeff);
const TIME = 'Time';
const MEMBER = 'Family Members';
const WEIGHT = 'WEIGHT (kg)';
const TIMESTAMP = /^(\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2}$/;

function cells(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted && char === '"' && line[i + 1] === '"') {
      value += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

export function parseEufyCsv(text: string): EufyMember[] {
  const [header = '', ...rows] = (text.startsWith(BOM) ? text.slice(BOM.length) : text).split(/\r?\n/).filter((line) => line.trim() !== '');
  const columns = cells(header).map((column) => column.trim());
  const time = columns.indexOf(TIME);
  const member = columns.indexOf(MEMBER);
  const weight = columns.indexOf(WEIGHT);
  if (time < 0 || weight < 0) {
    throw new EufyFormatError(`Not a EufyLife export: it has no "${TIME}" and "${WEIGHT}" columns.`);
  }

  const members = new Map<string, Map<Iso8601Date, { at: string; weight: number }>>();
  rows.forEach((row, index) => {
    const values = cells(row);
    const at = values[time]?.trim() ?? '';
    const date = TIMESTAMP.exec(at)?.[1];
    if (date === undefined) {
      throw new EufyFormatError(`Line ${index + 2} has no time as YYYY-MM-DD hh:mm:ss.`);
    }
    const kg = Number(values[weight]);
    if (!Number.isFinite(kg) || kg <= 0) {
      return;
    }
    const name = member < 0 ? '' : (values[member]?.trim() ?? '');
    const days = members.get(name) ?? new Map<Iso8601Date, { at: string; weight: number }>();
    members.set(name, days);
    const current = days.get(date);
    if (current === undefined || at > current.at) {
      days.set(date, { at, weight: kg });
    }
  });

  return Array.from(members, ([name, days]) => ({
    name,
    weighIns: Array.from(days, ([measuredOn, reading]) => ({ measuredOn, weight: reading.weight })).toSorted((a, b) =>
      a.measuredOn.localeCompare(b.measuredOn),
    ),
  }));
}
