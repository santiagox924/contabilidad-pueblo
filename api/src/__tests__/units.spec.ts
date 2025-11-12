import {
  convertToBase,
  convertFromBase,
  unitFamily,
  FAMILY_BASE,
} from '../common/units';
import { Unit } from '@prisma/client';

describe('Unit conversions across families', () => {
  test('COUNT family: DZ <-> UN', () => {
    expect(convertToBase(1, Unit.DZ, Unit.UN)).toBe(12);
    expect(convertFromBase(12, Unit.UN, Unit.DZ)).toBe(1);
    expect(unitFamily(Unit.DZ)).toBe('COUNT');
    expect(FAMILY_BASE['COUNT']).toBe(Unit.UN);
  });

  test('WEIGHT family: KG <-> G and MG <-> G and LB approx', () => {
    expect(convertToBase(1, Unit.KG, Unit.G)).toBe(1000);
    expect(convertFromBase(1000, Unit.G, Unit.KG)).toBe(1);
    expect(convertToBase(500, Unit.MG, Unit.G)).toBeCloseTo(0.5, 6);
    expect(unitFamily(Unit.KG)).toBe('WEIGHT');
    expect(convertToBase(1, Unit.LB, Unit.G)).toBeCloseTo(453.59237, 5);
  });

  test('VOLUME family: L <-> ML and M3', () => {
    expect(convertToBase(1, Unit.L, Unit.ML)).toBe(1000);
    expect(convertFromBase(1000, Unit.ML, Unit.L)).toBe(1);
    expect(convertToBase(0.002, Unit.M3, Unit.ML)).toBe(2000);
    expect(unitFamily(Unit.L)).toBe('VOLUME');
    expect(FAMILY_BASE['VOLUME']).toBe(Unit.ML);
  });

  test('LENGTH family: M <-> MM and IN <-> MM', () => {
    expect(convertToBase(1, Unit.M, Unit.MM)).toBe(1000);
    expect(convertFromBase(1000, Unit.MM, Unit.M)).toBe(1);
    expect(convertToBase(2, Unit.IN, Unit.MM)).toBeCloseTo(50.8, 4);
    expect(unitFamily(Unit.M)).toBe('LENGTH');
    expect(FAMILY_BASE['LENGTH']).toBe(Unit.MM);
  });

  test('AREA family: M2 <-> CM2 and IN2', () => {
    expect(convertToBase(1, Unit.M2, Unit.CM2)).toBe(10000);
    expect(convertFromBase(10000, Unit.CM2, Unit.M2)).toBe(1);
    expect(convertToBase(2, Unit.IN2, Unit.CM2)).toBeCloseTo(12.9032, 4);
    expect(unitFamily(Unit.M2)).toBe('AREA');
    expect(FAMILY_BASE['AREA']).toBe(Unit.CM2);
  });

  test('roundtrip conversions maintain value within tolerance', () => {
    const samples: Array<[number, Unit, Unit]> = [
      [1, Unit.KG, Unit.G],
      [2500, Unit.MG, Unit.G],
      [3.5, Unit.L, Unit.ML],
      [0.25, Unit.M, Unit.MM],
      [2, Unit.DZ, Unit.UN],
    ];
    for (const [val, from, to] of samples) {
      const base = convertToBase(val, from, FAMILY_BASE[unitFamily(from)]);
      const back = convertFromBase(base, FAMILY_BASE[unitFamily(from)], from);
      expect(back).toBeCloseTo(val, 6);
    }
  });
});
