'use client'

import { useCallback } from 'react'
import { api } from '@/lib/api'
import {
  fromBase as convertFromBase,
  toBase as convertToBase,
  type Uom,
} from '@/lib/uom'

// Tipos mínimos para evitar dependencias circulares.
// Ajusta si ya tienes un archivo de tipos central.
type Item = {
  id: number
  type?: 'PRODUCT' | 'SERVICE' | null
  baseUnit?: Uom | null
  displayUnit?: Uom | null
}
export type Line = {
  itemId?: number
  warehouseId?: number
  qty: number
  unitPrice: number
  lineTotal?: number
  uom?: Uom
  priceIncludesTax?: boolean
  baseAvailable?: number
  available?: number
  loadingAvail?: boolean
}

/** Redondeo a 2 decimales con corrección de EPSILON */
const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

/**
 * Hook de disponibilidad/stock por línea con reservas cruzadas en el front.
 *
 * @param getItem              función para obtener el item por id
 * @param lines                arreglo de líneas actual
 * @param setLines             setState de líneas (acepta updater)
 * @param effectiveWarehouseId función que devuelve la bodega efectiva (línea o default)
 * @param isService            función que indica si la línea es de servicio
 */
export function useAvailability(
  getItem: (id?: number) => Item | undefined,
  lines: Line[],
  setLines: (updater: (prev: Line[]) => Line[]) => void,
  effectiveWarehouseId: (l: Line) => number | undefined,
  isService: (l: Line) => boolean
) {
  /** Cantidad reservada en otras líneas del mismo ítem+bodega (en unidad base). */
  const reservedInOtherLinesBase = useCallback(
    (itemId: number, warehouseId: number, excludeIndex?: number) => {
      const it = getItem(itemId)
      const base = (it?.baseUnit as Uom) || 'UN'
      return lines.reduce((acc, l, idx) => {
        if (idx === (excludeIndex ?? -1)) return acc
        const wid = effectiveWarehouseId(l)
        if (!isService(l) && l.itemId === itemId && wid === warehouseId) {
          const from = (l.uom ?? it?.displayUnit ?? base) as Uom
          try {
            const qBase = convertToBase(Number(l.qty || 0), from, base)
            return acc + qBase
          } catch {
            // Incompatible: ignora esta contribución
            return acc
          }
        }
        return acc
      }, 0)
    },
    [effectiveWarehouseId, getItem, isService, lines]
  )

  /** Recalcula la disponibilidad mostrada (en la UOM de cada línea) para todas las líneas del grupo ítem+bodega. */
  const recomputeAvailabilityForGroup = useCallback(
    (itemId?: number, warehouseId?: number) => {
      if (!itemId || !warehouseId) return
      const it = getItem(itemId)
      const base = (it?.baseUnit as Uom) || 'UN'

      setLines(prev =>
        prev.map((l, i) => {
          const wid = effectiveWarehouseId(l)
          if (!isService(l) && l.itemId === itemId && wid === warehouseId) {
            const baseAvail = Number(l.baseAvailable ?? NaN)
            if (Number.isNaN(baseAvail)) return { ...l, available: undefined }
            const reservedOthersBase = reservedInOtherLinesBase(itemId, warehouseId, i)
            const adjBase = Math.max(0, baseAvail - reservedOthersBase)
            const toUom = (l.uom ?? it?.displayUnit ?? base) as Uom
            try {
              const shown = convertFromBase(adjBase, base, toUom)
              return { ...l, available: shown }
            } catch {
              return { ...l, available: undefined }
            }
          }
          return l
        })
      )
    },
    [effectiveWarehouseId, getItem, isService, reservedInOtherLinesBase, setLines]
  )

  /**
   * Refresca la disponibilidad de una línea pidiendo stock al backend.
   * Opcionalmente fuerza la cantidad (qty) a la disponibilidad mostrada.
   */
  async function refreshAvailabilityForLine(
    idx: number,
    itemId?: number,
    forceQtyToAvail: boolean = false,
    overrideWarehouseId?: number
  ) {
    const ln = lines[idx]
    if (isService(ln)) {
      setLines(prev => prev.map((l, i) =>
        i === idx ? { ...l, baseAvailable: undefined, available: undefined, loadingAvail: false } : l
      ))
      return
    }

    const wid = overrideWarehouseId ?? effectiveWarehouseId(ln)
    if (!wid || !itemId) {
      setLines(prev => prev.map((l, i) =>
        i === idx ? { ...l, baseAvailable: undefined, available: undefined, loadingAvail: false } : l
      ))
      return
    }

    try {
      setLines(prev => prev.map((l, i) => (i === idx ? { ...l, loadingAvail: true } : l)))

      const res = await api.get(`/inventory/stock/${itemId}/${wid}`)
      const data = ('data' in (res as any)) ? (res as any).data : res
      const base = Number(data?.qtyBase ?? 0)

      const it = getItem(itemId)
      const baseUnit = (it?.baseUnit as Uom) || 'UN'
      const toUom: Uom = (ln.uom ?? it?.displayUnit ?? baseUnit) as Uom

      const reservedOthersBase = reservedInOtherLinesBase(itemId, wid, idx)
      const adjBase = Math.max(0, base - reservedOthersBase)

      let shown: number | undefined
      try {
        shown = convertFromBase(adjBase, baseUnit, toUom)
      } catch {
        shown = undefined
      }

      setLines(prev =>
        prev.map((l, i) =>
          i === idx
            ? {
                ...l,
                baseAvailable: base,
                available: shown,
                ...(forceQtyToAvail && typeof shown === 'number'
                  ? {
                      qty: shown,
                      lineTotal: r2(shown * Number(l.unitPrice || 0)),
                    }
                  : {}),
              }
            : l
        )
      )

      if (!forceQtyToAvail) {
        // Da tiempo a React de aplicar el setState anterior antes de recalcular el grupo
        setTimeout(() => recomputeAvailabilityForGroup(itemId, wid), 0)
      }
    } finally {
      setLines(prev => prev.map((l, i) => (i === idx ? { ...l, loadingAvail: false } : l)))
    }
  }

  return { refreshAvailabilityForLine, recomputeAvailabilityForGroup }
}

export default useAvailability
