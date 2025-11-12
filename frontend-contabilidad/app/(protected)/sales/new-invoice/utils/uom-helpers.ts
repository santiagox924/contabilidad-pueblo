// app/(protected)/sales/new-invoice/utils/uom-helpers.ts

'use client'

import {
  type Uom,
  familyOf,
  toBase,
  fromBase,
  stepFor as stepForUomLib,
} from '@/lib/uom'

export type UnitKind = 'COUNT' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA'

/**
 * Traduce UnitKind a un nombre humano (para errores o mensajes).
 */
export function familyHumanName(kind?: UnitKind): string {
  switch (kind) {
    case 'WEIGHT': return 'Kilos'
    case 'VOLUME': return 'Litros'
    case 'LENGTH': return 'Metros'
    case 'AREA':   return 'Metros cuadrados'
    default:       return 'Unidades'
  }
}

/**
 * Devuelve las UOMs permitidas para un ítem según su familia.
 * Mantiene el mismo catálogo que el backend (ItemsService.allowedDisplay).
 */
export function allowedUomsForItem(it?: { unitKind?: UnitKind | null; displayUnit?: Uom | null }): Uom[] {
  const kind = it?.unitKind ?? (it?.displayUnit ? familyOf(it.displayUnit as Uom) : 'COUNT')

  if (kind === 'WEIGHT') {
    // MG, G, KG, LB
    return ['MG', 'G', 'KG', 'LB']
  }
  if (kind === 'VOLUME') {
    // ML, L, M3, CM3, OZ_FL, GAL
    return ['ML', 'L', 'M3', 'CM3', 'OZ_FL', 'GAL']
  }
  if (kind === 'LENGTH') {
    // MM, CM, M, KM, IN, FT, YD
    return ['MM', 'CM', 'M', 'KM', 'IN', 'FT', 'YD']
  }
  if (kind === 'AREA') {
    // CM2, M2, IN2, FT2, YD2
    return ['CM2', 'M2', 'IN2', 'FT2', 'YD2']
  }
  // COUNT: UN, DZ, PKG, BOX, PR, ROLL
  return ['UN', 'DZ', 'PKG', 'BOX', 'PR', 'ROLL']
}

/**
 * ¿Pertenecen a la misma familia?
 */
export function sameFamily(a: Uom, b: Uom): boolean {
  return familyOf(a) === familyOf(b)
}

/**
 * Conversión segura de cantidades a base.
 */
export function toBaseSafe(qty: number, from: Uom, base: Uom) {
  try {
    return toBase(qty, from, base)
  } catch {
    return NaN
  }
}

/**
 * Conversión segura desde base.
 */
export function fromBaseSafe(qtyBase: number, base: Uom, to: Uom) {
  try {
    return fromBase(qtyBase, base, to)
  } catch {
    return NaN
  }
}

/**
 * Paso (step) sugerido para un UOM.
 * (delegado a la librería compartida)
 */
export function stepForUom(uom: Uom) {
  return stepForUomLib(uom)
}

/* ===================== Extras útiles (opcionales) ===================== */

/**
 * Factor de conversión entre unidades (para CANTIDAD), usando una base conocida.
 * Ej.: factor(KG → G, base=G) = 1000; factor(G → KG, base=G) = 0.001
 */
export function unitFactor(fromUom: Uom, toUom: Uom, baseUom: Uom) {
  const oneFromInBase = toBase(1, fromUom, baseUom)
  const oneToInBase   = toBase(1, toUom,   baseUom)
  return oneFromInBase / oneToInBase
}

/**
 * Conversión de PRECIO por unidad (nota: usa el INVERSO del factor de cantidades).
 * Ej.: $5/KG → $0.005/G si base = G
 */
export function convertUnitPrice(price: number, fromUom: Uom, toUom: Uom, baseUom: Uom) {
  if (!Number.isFinite(Number(price))) return NaN
  try {
    return round2(price / unitFactor(fromUom, toUom, baseUom))
  } catch {
    return price
  }
}

function round2(n: number) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}
