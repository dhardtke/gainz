import { describe, expect, test } from 'bun:test';
import { EufyFormatError, parseEufyCsv } from './eufy.ts';

const HEADER =
  'Time,Family Members,WEIGHT (kg),BMI,BODY FAT %,HEART RATE (bpm),MUSCLE MASS (kg),MUSCLE MASS %,BMR,WATER,BODY FAT MASS (kg),LEAN BODY MASS (kg),BONE MASS (kg),BONE MASS %,VISCERAL FAT,PROTEIN %,SKELETAL MUSCLE MASS (kg),SUBCUTANEOUS FAT %,BODY AGE,BODY TYPE,HEAD SIZE (cm)';

const EXPORT = [
  HEADER,
  '2026-10-14 09:18:18,eufy,73,23.300000,21.000000,0.000000,54.8,75.000000,1550.000000,54.100000,15.3,57.7,2.9,4.000000,10.000000,16.500000,30,18.700000,33.000000,Average,0.000000',
  '2026-10-13 09:06:07,eufy,72.85,23.200000,21.200000,0.000000,54.5,74.800000,1547.000000,53.900000,15.4,57.44,2.9,4.000000,10.000000,16.600000,29.8,18.900000,33.000000,Average,0.000000',
  '2026-06-04 16:02:51,eufy,67.85,0.000000,0.000000,0.000000,0,0.000000,0.000000,0.000000,0,0,0,0.000000,0.000000,0.000000,0,0.000000,0.000000,,0.000000',
  '2026-06-04 12:13:39,eufy,66.3,21.100000,11.600000,0.000000,55.7,84.000000,1533.000000,60.600000,7.6,58.69,3,4.500000,5.000000,18.400000,30.6,8.300000,31.000000,Average,0.000000',
  '2026-06-04 00:34:15,eufy,68.2,21.700000,12.400000,0.000000,56.8,83.200000,1566.000000,60.100000,8.4,59.8,3,4.400000,6.000000,18.200000,31.2,8.900000,32.000000,Average,0.000000',
  '2026-06-04 16:02:04,luki,4.05,0.000000,0.000000,0.000000,0,0.000000,0.000000,0.000000,0,0,0,0.000000,0.000000,0.000000,0,0.000000,0.000000,,0.000000',
  '',
].join('\r\n');

describe('parseEufyCsv()', () => {
  test("splits by family member, keeping each day's last reading, oldest first", () => {
    expect(parseEufyCsv(EXPORT)).toEqual([
      {
        name: 'eufy',
        weighIns: [
          { measuredOn: '2026-06-04', weight: 67.85 },
          { measuredOn: '2026-10-13', weight: 72.85 },
          { measuredOn: '2026-10-14', weight: 73 },
        ],
      },
      { name: 'luki', weighIns: [{ measuredOn: '2026-06-04', weight: 4.05 }] },
    ]);
  });

  test('skips a reading without a weight and reads a byte order mark and quotes', () => {
    const csv = `${String.fromCharCode(0xfeff)}Time,Family Members,WEIGHT (kg)\n2026-10-13 09:00:00,"Doe, J",0\n2026-10-12 09:00:00,"Doe, J",82.4\n`;
    expect(parseEufyCsv(csv)).toEqual([{ name: 'Doe, J', weighIns: [{ measuredOn: '2026-10-12', weight: 82.4 }] }]);
  });

  test('reads an export without a member column as one unnamed member', () => {
    expect(parseEufyCsv('Time,WEIGHT (kg)\n2026-10-12 09:00:00,82.4')).toEqual([{ name: '', weighIns: [{ measuredOn: '2026-10-12', weight: 82.4 }] }]);
  });

  test('answers no members for a header alone', () => {
    expect(parseEufyCsv(HEADER)).toEqual([]);
  });

  test('refuses a file without the time and weight columns', () => {
    expect(() => parseEufyCsv('Date,Weight\n2026-10-12,82.4')).toThrow(
      new EufyFormatError('Not a EufyLife export: it has no "Time" and "WEIGHT (kg)" columns.'),
    );
  });

  test('refuses a row whose time it cannot read', () => {
    expect(() => parseEufyCsv('Time,WEIGHT (kg)\n2026-10-12 09:00:00,82.4\n14/10/2026 09:00,82')).toThrow(
      new EufyFormatError('Line 3 has no time as YYYY-MM-DD hh:mm:ss.'),
    );
  });
});
