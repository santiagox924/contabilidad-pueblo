// app/(protected)/inventory/(tabs)/transfer/page.tsx
'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { WarehousePicker } from '@/components/WarehousePicker'
import { searchItems, transferStock } from '@/lib/inventory'
import { useInventory } from '../../InventoryProvider'

export default function TransferPage() {
  const qc = useQueryClient()
  const { invalidateAll } = useInventory()

  const [itemId, setItemId] = useState<number | undefined>()
  const [fromWh, setFromWh] = useState<number | undefined>()
  const [toWh, setToWh] = useState<number | undefined>()
  const [qty, setQty] = useState<string>('')      // en unidad visible del ítem
  const [note, setNote] = useState<string>('')

  const sameWarehouse = !!fromWh && !!toWh && fromWh === toWh
  const canTransfer = !!itemId && !!fromWh && !!toWh && !sameWarehouse && Number(qty) > 0

  const mut = useMutation({
    mutationFn: async () => {
      if (!canTransfer) return
      await transferStock({
        itemId,
        fromWarehouseId: fromWh,
        toWarehouseId: toWh,
        qty: Number(qty),
        note: note || undefined,
      } as any)
    },
    onSuccess: async () => {
      setQty(''); setNote('')
      await qc.invalidateQueries({ queryKey: ['layers'] })
      await qc.invalidateQueries({ queryKey: ['stock:cell'] })
      await qc.invalidateQueries({ queryKey: ['moves'] })
      invalidateAll()
    },
  })

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Transferencias entre bodegas</h2>
      <p className="text-sm text-gray-600">
        Mueve stock preservando capas (FEFO/FIFO). Se registra un OUT en origen y un IN espejo en destino.
      </p>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-3">
          <label className="label">Ítem</label>
          <ItemInlinePicker value={itemId} onChange={setItemId} />
        </div>

        <WarehousePicker label="Desde bodega" value={fromWh} onChange={setFromWh} />
        <WarehousePicker label="Hacia bodega" value={toWh} onChange={setToWh} />

        <div>
          <label className="label">Cantidad</label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.0001"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>

        <div className="md:col-span-2">
          <label className="label">Nota (opcional)</label>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej: traslado a bodega de ventas…"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          className="btn btn-primary"
          disabled={!canTransfer || mut.isPending}
          onClick={() => mut.mutate()}
          title={
            sameWarehouse
              ? 'La bodega origen y destino no pueden ser la misma'
              : canTransfer
                ? 'Procesar transferencia'
                : 'Completa los campos requeridos'
          }
        >
          {mut.isPending ? 'Transfiriendo…' : 'Transferir'}
        </button>
      </div>
    </section>
  )
}

/** Picker simple en línea para ítems */
function ItemInlinePicker({
  value,
  onChange,
}: {
  value?: number
  onChange: (id?: number) => void
}) {
  const [q, setQ] = useState('')
  const { data, isFetching } = useQuery({
    queryKey: ['items:transfer', q],
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
      {isFetching && <p className="text-xs text-gray-500 mt-1">Cargando…</p>}
    </div>
  )
}
