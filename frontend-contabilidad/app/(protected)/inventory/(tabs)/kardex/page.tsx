// app/(protected)/inventory/(tabs)/kardex/page.tsx
'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { WarehousePicker } from '@/components/WarehousePicker'
import { getKardex, searchItems } from '@/lib/inventory'

export default function KardexPage() {
  const [itemId, setItemId] = useState<number | undefined>()
  const [warehouseId, setWarehouseId] = useState<number | undefined>()
  const [from, setFrom] = useState<string | undefined>()
  const [to, setTo] = useState<string | undefined>()

  const q = useQuery({
    queryKey: ['kardex', { itemId, warehouseId, from, to }],
    queryFn: () =>
      getKardex({
        itemId: itemId!, // habilitado solo cuando hay itemId
        warehouseId,
        from,
        to,
      }),
    enabled: !!itemId,
  })

  return (
    <section className="space-y-4">
      <div className="grid md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label className="label">Ítem (buscar)</label>
          <ItemInlinePicker value={itemId} onChange={setItemId} />
        </div>

        <WarehousePicker value={warehouseId} onChange={setWarehouseId} />

        <div>
          <label className="label">Desde</label>
          <input
            type="date"
            className="input w-full"
            value={from ?? ''}
            onChange={(e) => setFrom(e.target.value || undefined)}
          />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input
            type="date"
            className="input w-full"
            value={to ?? ''}
            onChange={(e) => setTo(e.target.value || undefined)}
          />
        </div>
      </div>

      {!itemId && <p className="text-gray-600">Selecciona un ítem para ver su kardex.</p>}
      {q.isFetching && <p className="text-gray-600">Cargando…</p>}

      {!!itemId && !q.isFetching && (
        <div className="overflow-auto rounded-lg border">
          <table className="table">
            <thead>
              <tr>
                <th className="th">Fecha</th>
                <th className="th">Tipo</th>
                <th className="th">Cantidad</th>
                <th className="th">Saldo</th>
                <th className="th">Bodega</th>
                <th className="th">Ref</th>
                <th className="th">Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(q.data ?? []).map((m: any) => (
                <tr key={m.id ?? `${m.date}-${m.type}-${m.refId ?? ''}`}>
                  <td className="td">{new Date(m.date).toLocaleString()}</td>
                  <td className="td">{m.type}</td>
                  <td className="td whitespace-nowrap">
                    {m.qtyDisplay} {m.displayUnit}
                  </td>
                  <td className="td whitespace-nowrap">
                    {m.balanceDisplay} {m.displayUnit}
                  </td>
                  <td className="td">{m.warehouse?.name ?? '—'}</td>
                  <td className="td">
                    {m.refType}
                    {m.refId ? ` #${m.refId}` : ''}
                  </td>
                  <td className="td">{m.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!q.data?.length && (
            <p className="text-gray-600 mt-2 px-3 pb-3">Sin movimientos en el rango seleccionado.</p>
          )}
        </div>
      )}
    </section>
  )
}

/** Picker simple en línea para ítems (busca por texto y permite seleccionar uno) */
function ItemInlinePicker({
  value,
  onChange,
}: {
  value?: number
  onChange: (id?: number) => void
}) {
  const [q, setQ] = useState('')
  const { data, isFetching } = useQuery({
    queryKey: ['items:kardex', q],
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
