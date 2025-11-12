// app/(protected)/inventory/(tabs)/layers/page.tsx
'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { WarehousePicker } from '@/components/WarehousePicker'
import { searchItems, listLayers } from '@/lib/inventory'
import { money } from '@/lib/format'

export default function LayersPage() {
  const [warehouseId, setWarehouseId] = useState<number | undefined>()
  const [q, setQ] = useState('')

  const layersQ = useQuery({
    queryKey: ['layers:wh', { warehouseId, q }],
    enabled: !!warehouseId,
    queryFn: async () => {
      // 1) Buscar ítems por texto (vacío = todos visibles)
      const items = await searchItems(q ?? '')
      const all = Array.isArray(items) ? items : []

      // 2) Limitar por rendimiento (ajusta si lo necesitas)
      const LIMITED = all.slice(0, 200)

      // 3) Traer capas por ítem para la bodega seleccionada
      const results = await Promise.all(
        LIMITED.map(async (it: any) => {
          const layers = await listLayers(it.id, warehouseId!)
          return (layers || []).map((l: any) => ({
            ...l,
            itemId: it.id,
            itemName: it.name,
            itemSku: it.sku,
            displayUnit: it.displayUnit ?? it.unit ?? 'UN',
          }))
        })
      )

      // 4) Unificar + ordenar por fecha de vencimiento (FEFO), luego por creación
      let merged = results.flat()

      const term = (q ?? '').trim().toLowerCase()
      if (term) {
        merged = merged.filter((l: any) =>
          (l.itemName ?? '').toLowerCase().includes(term) ||
          (l.itemSku ?? '').toLowerCase().includes(term) ||
          String((l as any).lotCode ?? '').toLowerCase().includes(term)
        )
      }

      merged.sort((a: any, b: any) => {
        const ax = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity
        const bx = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity
        if (ax !== bx) return ax - bx
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })

      return merged
    },
  })

  const nfQty = useMemo(
    () => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }),
    []
  )

  return (
    <section className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <WarehousePicker value={warehouseId} onChange={setWarehouseId} />
        {!!warehouseId && (
          <div className="md:col-span-2">
            <label className="label">Buscar (nombre/SKU/lote)</label>
            <input
              className="input w-full"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ej: leche, 123-A, LOTE-ABC…"
            />
          </div>
        )}
      </div>

      {!warehouseId ? (
        <p className="text-gray-600">Selecciona una bodega para ver sus capas activas.</p>
      ) : layersQ.isFetching ? (
        <p className="text-gray-600">Cargando capas…</p>
      ) : (
        <div className="overflow-auto rounded-lg border">
          <table className="table">
            <thead>
              <tr>
                <th className="th">Ítem</th>
                <th className="th">SKU</th>
                <th className="th">Vence</th>
                <th className="th">Creada</th>
                <th className="th">Lote</th>
                <th className="th">F. fab.</th>
                <th className="th">Remanente</th>
                <th className="th">Costo unitario</th>
                <th className="th">Valor capa</th>
                <th className="th">Movimiento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(layersQ.data ?? []).map((l: any) => {
                const exp = l.expiryDate ? new Date(l.expiryDate) : null
                const days = exp ? Math.ceil((+exp - Date.now()) / (1000 * 60 * 60 * 24)) : undefined
                const expBadge = exp ? (
                  <span className={`badge ${days! < 0 ? 'badge-error' : days! <= 30 ? 'badge-warning' : ''}`}>
                    {exp.toLocaleDateString()}
                  </span>
                ) : (
                  <span className="badge">—</span>
                )

                const rem = Number(
                  l.remainingQtyDisplay ?? l.remainingQtyBase ?? 0
                )
                const value = Number(l.unitCost ?? 0) * rem

                return (
                  <tr key={l.id}>
                    <td className="td">{l.itemName}</td>
                    <td className="td">{l.itemSku ?? '—'}</td>
                    <td className="td">{expBadge}</td>
                    <td className="td">{new Date(l.createdAt).toLocaleString()}</td>
                    <td className="td">{(l as any).lotCode ?? '—'}</td>
                    <td className="td">
                      {(l as any).productionDate
                        ? new Date((l as any).productionDate).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="td whitespace-nowrap">
                      {nfQty.format(rem)} {l.displayUnit}
                    </td>
                    <td className="td whitespace-nowrap">{money(l.unitCost)}</td>
                    <td className="td whitespace-nowrap">{money(value)}</td>
                    <td className="td">#{l.moveInId ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {!layersQ.data?.length && (
            <p className="text-gray-600 mt-2 px-3 pb-3">
              Sin capas activas con el criterio actual.
            </p>
          )}
          {(layersQ.data && layersQ.data.length >= 200) && (
            <p className="text-[11px] text-gray-500 mt-2 px-3 pb-3">
              Se muestran capas de los primeros 200 ítems coincidentes. Ajusta el buscador para afinar.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
