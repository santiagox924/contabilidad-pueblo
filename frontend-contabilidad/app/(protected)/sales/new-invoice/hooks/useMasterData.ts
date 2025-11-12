'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'

/** Tipos mínimos para este hook (evita dependencias circulares). */
type Uom = string
export type Item = {
  id: number
  name: string
  sku?: string | null
  type?: 'PRODUCT' | 'SERVICE' | 'CONSUMABLE' | null
  unitKind?: 'COUNT' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA' | null
  baseUnit?: Uom | null
  displayUnit?: Uom | null
  /** compat legado: el backend también expone `unit` como alias del displayUnit */
  unit?: Uom | null
  ivaPct?: number | null
  priceMin?: number | null
  priceMid?: number | null
  priceMax?: number | null
  price?: number | null
}
export type Party = {
  id: number
  name: string
  personKind?: 'NATURAL' | 'JURIDICAL'
  idType?: 'NIT' | 'CC' | 'PASSPORT' | 'OTHER'
  legalRepName?: string | null
  document?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
}
export type Warehouse = { id: number; name: string }

/** Normaliza respuestas comunes del backend ({data}, {items}, etc.). */
function normalizeArray(res: any): any[] {
  const x = res && typeof res === 'object' && 'data' in res ? (res as any).data : res
  if (Array.isArray(x)) return x
  if (!x || typeof x !== 'object') return []
  if (Array.isArray((x as any).items)) return (x as any).items
  if (Array.isArray((x as any).data)) return (x as any).data
  if (Array.isArray((x as any).results)) return (x as any).results
  return []
}

/** Coerciones/fallbacks útiles para UOM y números. */
function coerceItem(raw: any): Item {
  const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : null)
  const displayUnit = (raw?.displayUnit ?? raw?.unit ?? null) as Uom | null
  return {
    id: Number(raw?.id),
    name: String(raw?.name ?? ''),
    sku: raw?.sku ?? null,
    type: (raw?.type ?? null) as Item['type'],
    unitKind: (raw?.unitKind ?? null) as Item['unitKind'],
    baseUnit: (raw?.baseUnit ?? null) as Uom | null,
    displayUnit,
    unit: displayUnit,
    ivaPct: num(raw?.ivaPct),
    priceMin: num(raw?.priceMin),
    priceMid: num(raw?.priceMid),
    priceMax: num(raw?.priceMax),
    price: num(raw?.price),
  }
}

/**
 * Hook para cargar datos maestros: items, terceros y bodegas.
 * Devuelve setters y un refresco manual por si necesitas recargar.
 */
export function useMasterData() {
  const [items, setItems] = useState<Item[]>([])
  const [parties, setParties] = useState<Party[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const applyAll = (itemsRes: any, partiesRes: any, whRes: any) => {
    const itemsNorm = normalizeArray(itemsRes).map(coerceItem) as Item[]
    itemsNorm.sort((a, b) => a.name.localeCompare(b.name, 'es'))
    setItems(itemsNorm)

    const partiesNorm = normalizeArray(partiesRes) as Party[]
    partiesNorm.sort((a, b) => a.name.localeCompare(b.name, 'es'))
    setParties(partiesNorm)

    const whNorm = normalizeArray(whRes) as Warehouse[]
    whNorm.sort((a, b) => a.name.localeCompare(b.name, 'es'))
    setWarehouses(whNorm)
  }

  const refreshAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    let cancelled = false
    try {
      const [itemsRes, partiesRes, whRes] = await Promise.all([
        api.get('/items'),
        api.get('/parties'),
        api.get('/inventory/warehouses'),
      ])
      if (!cancelled) applyAll(itemsRes, partiesRes, whRes)
    } catch (e: any) {
      if (!cancelled) setError(e?.message ?? 'Error cargando datos maestros')
    } finally {
      if (!cancelled) setLoading(false)
    }
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [itemsRes, partiesRes, whRes] = await Promise.all([
          api.get('/items'),
          api.get('/parties'),
          api.get('/inventory/warehouses'),
        ])
        if (!alive) return
        applyAll(itemsRes, partiesRes, whRes)
      } catch (e: any) {
        if (!alive) return
        setError(e?.message ?? 'Error cargando datos maestros')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  return {
    items,
    parties,
    warehouses,
    setItems,
    setParties,
    setWarehouses,
    loading,
    error,
    refreshAll,
  }
}

export default useMasterData
