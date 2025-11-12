// lib/uom.ts

/**
 * Catálogo de Unidades (debe mantenerse en sync con Prisma enum `Unit`)
 */
export type Uom =
  // COUNT
  | 'UN' | 'DZ' | 'PKG' | 'BOX' | 'PR' | 'ROLL'
  // WEIGHT
  | 'MG' | 'G' | 'KG' | 'LB'
  // VOLUME
  | 'ML' | 'L' | 'M3' | 'CM3' | 'OZ_FL' | 'GAL'
  // LENGTH
  | 'MM' | 'CM' | 'M' | 'KM' | 'IN' | 'FT' | 'YD'
  // AREA
  | 'CM2' | 'M2' | 'IN2' | 'FT2' | 'YD2'

export type UomFamily = 'COUNT' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA'

/** Familias → unidades (para pickers) */
export const UOM_FAMILIES: Record<UomFamily, Uom[]> = {
  COUNT:  ['UN', 'DZ', 'PKG', 'BOX', 'PR', 'ROLL'],
  WEIGHT: ['MG', 'G', 'KG', 'LB'],
  VOLUME: ['ML', 'L', 'M3', 'CM3', 'OZ_FL', 'GAL'],
  LENGTH: ['MM', 'CM', 'M', 'KM', 'IN', 'FT', 'YD'],
  AREA:   ['CM2', 'M2', 'IN2', 'FT2', 'YD2'],
}

/** Lista plana de todas las UoM */
export const ALL_UOMS: Uom[] = [
  ...UOM_FAMILIES.COUNT,
  ...UOM_FAMILIES.WEIGHT,
  ...UOM_FAMILIES.VOLUME,
  ...UOM_FAMILIES.LENGTH,
  ...UOM_FAMILIES.AREA,
]

// Etiquetas legibles para UI
export const UOM_LABELS: Record<Uom, string> = {
  // COUNT
  UN: 'Unidad',
  DZ: 'Docena',
  PKG: 'Paquete',
  BOX: 'Caja',
  PR: 'Par',
  ROLL: 'Rollo',
  // WEIGHT
  MG: 'Miligramo',
  G:  'Gramo',
  KG: 'Kilogramo',
  LB: 'Libra',
  // VOLUME
  ML:   'Mililitro',
  L:    'Litro',
  M3:   'Metro cúbico',
  CM3:  'Centímetro cúbico',
  OZ_FL:'Onza fluida',
  GAL:  'Galón',
  // LENGTH
  MM: 'Milímetro',
  CM: 'Centímetro',
  M:  'Metro',
  KM: 'Kilómetro',
  IN: 'Pulgada',
  FT: 'Pie',
  YD: 'Yarda',
  // AREA
  CM2: 'Centímetro cuadrado',
  M2:  'Metro cuadrado',
  IN2: 'Pulgada cuadrada',
  FT2: 'Pie cuadrado',
  YD2: 'Yarda cuadrada',
}

/** Aliases para buscador (sin tildes y en minúsculas) */
export const UOM_ALIASES: Record<Uom, string[]> = {
  // COUNT
  UN:   ['unidad', 'pieza', 'u', 'und'],
  DZ:   ['docena', 'x12'],
  PKG:  ['paquete', 'paq', 'pack', 'pkg'],
  BOX:  ['caja', 'box'],
  PR:   ['par', 'pair'],
  ROLL: ['rollo', 'roll'],
  // WEIGHT
  MG: ['miligramo', 'mg'],
  G:  ['gramo', 'gr', 'g'],
  KG: ['kilogramo', 'kilo', 'kg'],
  LB: ['libra', 'lb', 'pound'],
  // VOLUME
  ML:   ['mililitro', 'ml', 'cc', 'cm3'],
  L:    ['litro', 'lt', 'l'],
  M3:   ['metro cubico', 'm3'],
  CM3:  ['centimetro cubico', 'cc', 'cm3'],
  OZ_FL:['onza fluida', 'oz', 'oz fl', 'fl oz'],
  GAL:  ['galon', 'gal'],
  // LENGTH
  MM: ['milimetro', 'mm'],
  CM: ['centimetro', 'cm'],
  M:  ['metro', 'm'],
  KM: ['kilometro', 'km'],
  IN: ['pulgada', 'inch', 'in'],
  FT: ['pie', 'ft', 'foot'],
  YD: ['yarda', 'yd'],
  // AREA
  CM2: ['centimetro cuadrado', 'cm2'],
  M2:  ['metro cuadrado', 'm2'],
  IN2: ['pulgada cuadrada', 'in2'],
  FT2: ['pie cuadrado', 'ft2'],
  YD2: ['yarda cuadrada', 'yd2'],
}

/** Orden sugerido de familias para UI */
export const FAMILY_ORDER: UomFamily[] = ['COUNT', 'WEIGHT', 'VOLUME', 'LENGTH', 'AREA']

/** Helpers de familia/etiquetas/búsqueda */
export function familyOf(u: Uom): UomFamily {
  if (UOM_FAMILIES.WEIGHT.includes(u)) return 'WEIGHT'
  if (UOM_FAMILIES.VOLUME.includes(u)) return 'VOLUME'
  if (UOM_FAMILIES.LENGTH.includes(u)) return 'LENGTH'
  if (UOM_FAMILIES.AREA.includes(u)) return 'AREA'
  return 'COUNT'
}
export function sameFamily(a: Uom, b: Uom): boolean {
  return familyOf(a) === familyOf(b)
}
export function labelOf(u: Uom): string {
  return `${UOM_LABELS[u]} (${u})`
}
export function filterUoms(query: string, family?: UomFamily): Uom[] {
  const pool = family ? UOM_FAMILIES[family] : ALL_UOMS
  const q = normalize(query)
  if (!q) return pool
  return pool.filter((u) => {
    const code = normalize(u)
    const label = normalize(UOM_LABELS[u])
    const aliases = UOM_ALIASES[u]?.map(normalize) ?? []
    return code.includes(q) || label.includes(q) || aliases.some((a) => a.includes(q))
  })
}
export function normalize(s?: string): string {
  if (!s) return ''
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

/* =====================================================================
 * CONVERSIONES (a “base canónica” por familia y entre unidades)
 *  - COUNT base canónica: UN
 *  - WEIGHT base canónica: KG
 *  - VOLUME base canónica: L
 *  - LENGTH base canónica: M
 *  - AREA base canónica: M2
 * ===================================================================== */

/** factor para pasar desde `u` → base canónica de la familia */
function factorToCanonical(u: Uom): number {
  switch (familyOf(u)) {
    case 'COUNT': {
      // Asumimos 1 UN = 1; PR = 2 UN; DZ = 12 UN; otros genéricos ≈ 1
      const map: Record<Uom, number> = { UN: 1, PR: 2, DZ: 12, PKG: 1, BOX: 1, ROLL: 1 } as any
      return map[u] ?? 1
    }
    case 'WEIGHT': {
      // canónica: KG
      const map: Record<Uom, number> = {
        KG: 1,
        G: 0.001,
        MG: 0.000001,
        LB: 0.45359237,
      } as any
      return map[u] ?? 1
    }
    case 'VOLUME': {
      // canónica: L
      const map: Record<Uom, number> = {
        L: 1,
        ML: 0.001,
        M3: 1000,
        CM3: 0.001, // 1 cm3 = 1 ml
        OZ_FL: 0.0295735295625,
        GAL: 3.785411784,
      } as any
      return map[u] ?? 1
    }
    case 'LENGTH': {
      // canónica: M
      const map: Record<Uom, number> = {
        M: 1,
        MM: 0.001,
        CM: 0.01,
        KM: 1000,
        IN: 0.0254,
        FT: 0.3048,
        YD: 0.9144,
      } as any
      return map[u] ?? 1
    }
    case 'AREA': {
      // canónica: M2
      const map: Record<Uom, number> = {
        M2: 1,
        CM2: 0.0001,
        IN2: 0.00064516,
        FT2: 0.09290304,
        YD2: 0.83612736,
      } as any
      return map[u] ?? 1
    }
  }
}

/**
 * Convierte una cantidad de `from` a `base` (dentro de la misma familia)
 * Ej: 500 G → KG = 0.5
 */
export function toBase(qty: number, from: Uom, base: Uom): number {
  if (from === base) return qty
  if (!sameFamily(from, base)) throw new Error(`Unidades incompatibles: ${from} ↔ ${base}`)
  // qty → canónica → base
  const fFrom = factorToCanonical(from)
  const fBase = factorToCanonical(base)
  const qtyCanonical = qty * fFrom
  return qtyCanonical / fBase
}

/** Inversa de toBase: convierte desde `base` a `to` */
export function fromBase(qtyBase: number, base: Uom, to: Uom): number {
  if (base === to) return qtyBase
  if (!sameFamily(base, to)) throw new Error(`Unidades incompatibles: ${base} ↔ ${to}`)
  // base → canónica → to
  const fBase = factorToCanonical(base)
  const fTo = factorToCanonical(to)
  const qtyCanonical = qtyBase * fBase
  return qtyCanonical / fTo
}

/**
 * Conversión de precio unitario entre UOM de la misma familia.
 * Nota: el precio cambia en la razón inversa a la cantidad.
 * Ej: $/KG → $/G  == dividir por 1000
 */
export function convertUnitPrice(price: number, from: Uom, to: Uom): number {
  if (!Number.isFinite(price)) return price
  if (from === to) return price
  if (!sameFamily(from, to)) throw new Error(`Unidades incompatibles: ${from} ↔ ${to}`)
  const fFrom = factorToCanonical(from)
  const fTo = factorToCanonical(to)
  // price_to = price_from * (fTo / fFrom)
  return price * (fTo / fFrom)
}

/** Paso mínimo sugerido para inputs numéricos por unidad */
export function stepFor(u: Uom): number {
  switch (familyOf(u)) {
    case 'WEIGHT':
      return u === 'MG' ? 1 : 0.001
    case 'VOLUME':
      return (u === 'L' || u === 'GAL' || u === 'M3') ? 0.001 : 1
    case 'LENGTH':
      return (u === 'M' || u === 'KM') ? 0.001 : 1
    case 'AREA':
      return 0.001
    default: // COUNT
      return 1
  }
}

/** Formateo breve de cantidades según unidad */
export function fmtQty(u: Uom, n: number | undefined): string {
  if (n == null) return '—'
  const needsDecimals = stepFor(u) < 1
  const decs =
    needsDecimals ? 3 :
    (familyOf(u) === 'AREA' ? 2 : 0)
  const str = Number(n).toFixed(decs)
  return str.replace(/\.?0+$/, '')
}
