// app/(protected)/inventory/(tabs)/stock/page.tsx
'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useInventory } from '../../InventoryProvider'
import { WarehousePicker } from '@/components/WarehousePicker'
import { money } from '@/lib/format'
import { searchItems, getStockOf, listLayers } from '@/lib/inventory'

export default function StockPage() {
  const { openEditItem, openQuickCreate } = useInventory()

  const [warehouseId, setWarehouseId] = useState<number | undefined>()
  const [q, setQ] = useState('')               // filtro por nombre/SKU
  const [pageSize, setPageSize] = useState(10) // 10 / 50 / 100
  const [page, setPage] = useState(1)

  // Lista base de ítems (filtrable)
  const itemsQ = useQuery({
    queryKey: ['items:search', q],
    queryFn: () => searchItems(q),
    staleTime: 60_000,
    enabled: !!warehouseId, // esperamos a que elijan bodega
  })
  const allItems = useMemo(
    () => (Array.isArray(itemsQ.data) ? itemsQ.data : []),
    [itemsQ.data]
  )

  // Filtrado local por nombre / SKU
  const filteredItems = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return allItems
    return allItems.filter((it: any) =>
      (it.name ?? '').toLowerCase().includes(term) ||
      (it.sku ?? '').toLowerCase().includes(term)
    )
  }, [allItems, q])

  const pages = useMemo(
    () => Math.max(1, Math.ceil(filteredItems.length / pageSize)),
    [filteredItems.length, pageSize]
  )
  const pagedItems = useMemo(
    () => filteredItems.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    [filteredItems, page, pageSize]
  )

  function onSearchChange(v: string) {
    setQ(v); setPage(1)
  }
  function onPageSizeChange(n: number) {
    setPageSize(n); setPage(1)
  }

  return (
    <section className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <div className="flex flex-col gap-2">
          <WarehousePicker
            value={warehouseId}
            onChange={(v) => { setWarehouseId(v); setPage(1) }}
          />
          {!!warehouseId && (
            <button
              className="btn btn-primary btn-sm w-fit"
              onClick={() => openQuickCreate(warehouseId)}
            >
              Nuevo ítem en esta bodega
            </button>
          )}
        </div>

        {!!warehouseId && (
          <>
            <div className="md:col-span-1">
              <label className="label">Buscar ítems</label>
              <input
                className="input w-full"
                placeholder="Nombre o SKU…"
                value={q}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
            <div className="md:col-span-1">
              <label className="label">Por página</label>
              <select
                className="input"
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
              >
                {[10, 50, 100].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-1 flex items-end">
              <div className="flex gap-2">
                <button
                  className="btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Prev
                </button>
                <span className="badge">Página {page} / {pages}</span>
                <button
                  className="btn"
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {!warehouseId ? (
        <p className="text-gray-600">Selecciona una bodega para ver su stock.</p>
      ) : (
        <StockTableForWarehouse
          warehouseId={warehouseId}
          items={pagedItems}
          loading={itemsQ.isFetching}
          page={page}
          pages={pages}
          onEditItem={(id, whId) => openEditItem(id, whId)}  // ⬅️ reenvía bodega
        />
      )}
    </section>
  )
}

/* ====== Celdas dinámicas ====== */

function StockCell({ itemId, warehouseId }: { itemId: number; warehouseId: number }) {
  const q = useQuery({
    queryKey: ['stock:cell', itemId, warehouseId],
    queryFn: () => getStockOf(itemId, warehouseId),
    staleTime: 30_000,
  })

  if (q.isFetching) return <span className="text-gray-500">…</span>
  if (!q.data) return <span>—</span>

  const qty = (q.data as any).qtyDisplay ?? (q.data as any).totalQtyDisplay
  const unit = (q.data as any).displayUnit
  return <span className="font-medium">{qty} {unit}</span>
}

function CostCell({ itemId, warehouseId }: { itemId: number; warehouseId: number }) {
  const q = useQuery({
    queryKey: ['cost:cell', itemId, warehouseId],
    queryFn: async () => {
      const layers = await listLayers(itemId, warehouseId)
      if (!Array.isArray(layers) || layers.length === 0) return null
      const totals = layers.reduce(
        (acc, l: any) => {
          const qty = Number(l.remainingQtyDisplay ?? l.remainingQtyBase ?? 0)
          const cost = Number(l.unitCost ?? 0)
          return { q: acc.q + qty, v: acc.v + qty * cost }
        },
        { q: 0, v: 0 }
      )
      if (totals.q <= 0) return null
      return totals.v / totals.q
    },
    staleTime: 30_000,
  })

  if (q.isFetching) return <span className="text-gray-500">…</span>
  if (!q.data) return <span>—</span>
  return <span>{money(q.data)}</span>
}

/* ====== Tabla principal ====== */

function StockTableForWarehouse({
  warehouseId,
  items,
  loading,
  page,
  pages,
  onEditItem,
}: {
  warehouseId: number
  items: any[]
  loading: boolean
  page: number
  pages: number
  onEditItem: (id: number, warehouseId: number) => void  // ⬅️ acepta bodega
}) {
  return (
    <div className="mt-2 overflow-x-auto">
      {loading && <p className="text-gray-600">Cargando ítems…</p>}
      {!loading && items.length === 0 && (
        <p className="text-gray-600">No hay ítems para mostrar.</p>
      )}
      {!loading && items.length > 0 && (
        <>
          <table className="table table-fixed text-sm">
            <colgroup>
              <col className="w-24" />
              <col className="w-64" />
              <col className="w-24" />
              <col className="w-36" />
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-20" />
              <col className="w-28" />
            </colgroup>
            <thead>
              <tr className="whitespace-nowrap">
                <th className="th">SKU</th>
                <th className="th">Ítem</th>
                <th className="th">Unidad</th>
                <th className="th">Stock</th>
                <th className="th">Costo</th>
                <th className="th">Precio (máx)</th>
                <th className="th">IVA %</th>
                <th className="th">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((it: any) => {
                const visiblePrice =
                  it.priceMax ?? it.salePriceMax ?? it.price ??
                  it.priceMid ?? it.salePriceMid ?? it.priceMin ?? it.salePriceMin ?? null

                return (
                  <tr key={it.id} className="align-top">
                    <td className="td whitespace-nowrap">{it.sku || '—'}</td>
                    <td className="td">
                      <div className="truncate" title={it.name}>{it.name}</div>
                    </td>
                    <td className="td whitespace-nowrap">
                      {it.displayUnit || it.unit || 'UN'}
                    </td>
                    <td className="td whitespace-nowrap">
                      <StockCell itemId={it.id} warehouseId={warehouseId} />
                    </td>
                    <td className="td whitespace-nowrap">
                      <CostCell itemId={it.id} warehouseId={warehouseId} />
                    </td>
                    <td className="td whitespace-nowrap">
                      {visiblePrice != null ? money(visiblePrice) : '—'}
                    </td>
                    <td className="td whitespace-nowrap">
                      {typeof it.ivaPct === 'number' ? it.ivaPct : '—'}
                    </td>
                    <td className="td">
                      <button
                        className="btn btn-sm"
                        onClick={() => onEditItem(it.id, warehouseId)} // ⬅️ pasa la bodega actual
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="flex items-center justify-end gap-2 mt-3">
            <span className="text-xs text-gray-500">
              Página {page} de {pages}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
