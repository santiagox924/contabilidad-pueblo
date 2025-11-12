// app/(protected)/inventory/(tabs)/produce/page.tsx
'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { WarehousePicker } from '@/components/WarehousePicker'
import { searchItems, produceItem } from '@/lib/inventory'
import { useInventory } from '../../InventoryProvider'

export default function ProducePage() {
  const qc = useQueryClient()
  const { invalidateAll } = useInventory()

  const [warehouseId, setWarehouseId] = useState<number | undefined>()
  const [itemId, setItemId] = useState<number | undefined>()
  const [qty, setQty] = useState<string>('')          // cantidad del terminado (unidad visible)
  const [note, setNote] = useState<string>('')        // observación
  const [allowNegative, setAllowNegative] = useState(false) // permitir negativos en insumos

  const mut = useMutation({
    mutationFn: async () => {
      if (!warehouseId || !itemId || Number(qty) <= 0) return
      await produceItem({
        itemId,
        warehouseId,
        qty: Number(qty),
        note: note || undefined,
        allowNegative,
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

  const canProduce = !!warehouseId && !!itemId && Number(qty) > 0 && !mut.isPending

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Producción</h2>
      <p className="text-sm text-gray-600">
        Produce terminados a partir de su receta (BOM). Se consumen insumos base y se crea una capa del producto terminado con costo promedio.
      </p>

      <div className="grid md:grid-cols-3 gap-4">
        <WarehousePicker value={warehouseId} onChange={setWarehouseId} />
        <div className="md:col-span-2">
          <label className="label">Producto a producir (terminado)</label>
          <ItemInlinePicker value={itemId} onChange={setItemId} />
        </div>

        <div>
          <label className="label">Cantidad a producir</label>
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
            placeholder="Ej: Lote del día…"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="neg-ok"
            type="checkbox"
            className="toggle toggle-primary"
            checked={allowNegative}
            onChange={(e) => setAllowNegative(e.target.checked)}
          />
          <label htmlFor="neg-ok" className="text-sm cursor-pointer">
            Permitir negativos en insumos si no alcanzan
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          className="btn btn-primary"
          disabled={!canProduce}
          onClick={() => mut.mutate()}
          title={canProduce ? 'Producir' : 'Completa los campos requeridos'}
        >
          {mut.isPending ? 'Procesando…' : 'Producir'}
        </button>
      </div>
    </section>
  )
}

/** Picker simple en línea para ítems (terminados o insumos) */
function ItemInlinePicker({
  value,
  onChange,
}: {
  value?: number
  onChange: (id?: number) => void
}) {
  const [q, setQ] = useState('')
  const { data, isFetching } = useQuery({
    queryKey: ['items:produce', q],
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
