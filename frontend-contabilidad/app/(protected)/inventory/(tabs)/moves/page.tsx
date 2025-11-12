// app/(protected)/inventory/(tabs)/moves/page.tsx
'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { WarehousePicker } from '@/components/WarehousePicker'
import { listMoves, searchItems } from '@/lib/inventory'

export default function MovesPage() {
  const [itemId, setItemId] = useState<number | undefined>()
  const [warehouseId, setWarehouseId] = useState<number | undefined>()
  const [take, setTake] = useState(20)
  const [page, setPage] = useState(1)
  const skip = (page - 1) * take

  const q = useQuery({
    queryKey: ['moves', { itemId, warehouseId, take, skip }],
    queryFn: () =>
      listMoves({
        itemId,
        warehouseId,
        take,
        skip,
        orderDir: 'desc',
      }),
  })

  const total = q.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / take))

  return (
    <section className="space-y-4">
      <div className="grid md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label className="label">Ítem (buscar)</label>
          <ItemInlinePicker
            value={itemId}
            onChange={(v) => {
              setItemId(v)
              setPage(1)
            }}
          />
        </div>

        <WarehousePicker
          value={warehouseId}
          onChange={(v) => {
            setWarehouseId(v)
            setPage(1)
          }}
        />

        <div>
          <label className="label">Por página</label>
          <select
            className="input"
            value={take}
            onChange={(e) => {
              setTake(Number(e.target.value))
              setPage(1)
            }}
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-4 flex items-end justify-end">
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
      </div>

      <div className="overflow-auto rounded-lg border">
        <table className="table">
          <thead>
            <tr>
              <th className="th">Fecha</th>
              <th className="th">Ítem</th>
              <th className="th">Bodega</th>
              <th className="th">Tipo</th>
              <th className="th">Cantidad</th>
              <th className="th">Ref</th>
              <th className="th">Nota</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {q.data?.items?.map((m: any) => (
              <tr key={m.id}>
                <td className="td">
                  {new Date(m.ts ?? m.createdAt ?? m.date).toLocaleString()}
                </td>
                <td className="td">{m.item?.name ?? '—'}</td>
                <td className="td">{m.warehouse?.name ?? '—'}</td>
                <td className="td">{m.type}</td>
                <td className="td whitespace-nowrap">
                  {m.qtyDisplay} {m.displayUnit}
                </td>
                <td className="td">
                  {m.refType}
                  {m.refId ? ` #${m.refId}` : ''}
                </td>
                <td className="td">{m.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {q.isFetching && (
          <p className="text-gray-600 mt-2 px-3 pb-3">Cargando…</p>
        )}
        {!q.isFetching && !q.data?.items?.length && (
          <p className="text-gray-600 mt-2 px-3 pb-3">Sin resultados.</p>
        )}
      </div>
    </section>
  )
}

/** Picker simple en línea para ítems (reutilizable) */
function ItemInlinePicker({
  value,
  onChange,
}: {
  value?: number
  onChange: (id?: number) => void
}) {
  const [q, setQ] = useState('')
  const { data, isFetching } = useQuery({
    queryKey: ['items:moves', q],
    queryFn: () => searchItems(q),
    staleTime: 60_000,
  })

  const items = Array.isArray(data) ? data : []

  return (
    <div className="space-y-2">
      <input
        className="input w-full"
        placeholder="Buscar por nombre o SKU…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <select
        className="input w-full"
        value={value ?? ''}
        onChange={(e) =>
          onChange(e.target.value ? Number(e.target.value) : undefined)
        }
      >
        <option value="">— Selecciona un ítem —</option>
        {items.map((it: any) => (
          <option key={it.id} value={it.id}>
            {it.sku ? `${it.sku} · ` : ''}{it.name} ({it.displayUnit ?? it.unit ?? 'UN'})
          </option>
        ))}
      </select>
      {isFetching && (
        <p className="text-xs text-gray-500 mt-1">Cargando…</p>
      )}
    </div>
  )
}
