// api/src/common/units.ts
import { Unit } from '@prisma/client';

/** Familias de unidades soportadas. */
export type UnitFamily = 'COUNT' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA';

/** Devuelve la familia de una unidad para validar compatibilidad. */
export function unitFamily(u: Unit): UnitFamily {
  // WEIGHT
  if (u === Unit.MG || u === Unit.G || u === Unit.KG || u === Unit.LB)
    return 'WEIGHT';
  // VOLUME
  if (
    u === Unit.ML ||
    u === Unit.L ||
    u === Unit.M3 ||
    u === Unit.CM3 ||
    u === Unit.OZ_FL ||
    u === Unit.GAL
  )
    return 'VOLUME';
  // LENGTH
  if (
    u === Unit.MM ||
    u === Unit.CM ||
    u === Unit.M ||
    u === Unit.KM ||
    u === Unit.IN ||
    u === Unit.FT ||
    u === Unit.YD
  )
    return 'LENGTH';
  // AREA
  if (
    u === Unit.CM2 ||
    u === Unit.M2 ||
    u === Unit.IN2 ||
    u === Unit.FT2 ||
    u === Unit.YD2
  )
    return 'AREA';
  // COUNT
  return 'COUNT';
}

/** Lanza error si las unidades no pertenecen a la misma familia. */
export function assertSameFamily(a: Unit, b: Unit) {
  const fa = unitFamily(a);
  const fb = unitFamily(b);
  if (fa !== fb) {
    throw new Error(`Unidades incompatibles: ${a} ↔ ${b}`);
  }
}

/** Unidad base por familia (para normalizar cantidades en stock). */
export const FAMILY_BASE: Record<UnitFamily, Unit> = {
  COUNT: Unit.UN,
  WEIGHT: Unit.G,
  VOLUME: Unit.ML,
  LENGTH: Unit.MM,
  AREA: Unit.CM2,
};

/** Factores de conversión: 1 unidad → base de su familia */
const TO_BASE: Record<Unit, number> = {
  // COUNT
  [Unit.UN]: 1,
  [Unit.DZ]: 12, // 1 docena = 12 unidades
  [Unit.PKG]: 1, // paquete (genérico, por defecto = 1 UN)
  [Unit.BOX]: 1, // caja (genérico, por defecto = 1 UN)
  [Unit.PR]: 2, // par = 2 unidades
  [Unit.ROLL]: 1, // rollo (genérico, se puede parametrizar)

  // WEIGHT (base = G)
  [Unit.MG]: 0.001,
  [Unit.G]: 1,
  [Unit.KG]: 1000,
  [Unit.LB]: 453.59237,

  // VOLUME (base = ML)
  [Unit.ML]: 1,
  [Unit.L]: 1000,
  [Unit.M3]: 1_000_000,
  [Unit.CM3]: 1, // 1 cm³ = 1 mL
  [Unit.OZ_FL]: 29.5735295625,
  [Unit.GAL]: 3785.411784,

  // LENGTH (base = MM)
  [Unit.MM]: 1,
  [Unit.CM]: 10,
  [Unit.M]: 1000,
  [Unit.KM]: 1_000_000,
  [Unit.IN]: 25.4,
  [Unit.FT]: 304.8,
  [Unit.YD]: 914.4,

  // AREA (base = CM²)
  [Unit.CM2]: 1,
  [Unit.M2]: 10000, // 1 m² = 10,000 cm²
  [Unit.IN2]: 6.4516, // (2.54 cm)²
  [Unit.FT2]: 929.0304, // (30.48 cm)²
  [Unit.YD2]: 8361.2736, // (91.44 cm)²
};

/**
 * Convierte una cantidad desde una unidad arbitraria a la unidad base del ítem.
 */
export function convertToBase(qty: number, from: Unit, base: Unit): number {
  if (from === base) return qty;
  assertSameFamily(from, base);

  const fam = unitFamily(from);
  const famBase = FAMILY_BASE[fam];

  if (base !== famBase) {
    // convertir via la unidad base de la familia
    const inFamBase = qty * TO_BASE[from];
    const factor = 1 / TO_BASE[base];
    return inFamBase * factor;
  }
  return qty * TO_BASE[from];
}

/**
 * Convierte una cantidad desde la unidad base a una unidad de visualización.
 */
export function convertFromBase(qtyBase: number, base: Unit, to: Unit): number {
  if (base === to) return qtyBase;
  assertSameFamily(base, to);

  const fam = unitFamily(to);
  const famBase = FAMILY_BASE[fam];
  const qtyInFamBase =
    base === famBase ? qtyBase : convertToBase(qtyBase, base, famBase);
  const factor = 1 / TO_BASE[to];
  return qtyInFamBase * factor;
}
