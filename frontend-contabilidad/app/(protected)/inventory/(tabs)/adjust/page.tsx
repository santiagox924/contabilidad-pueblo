// app/(protected)/inventory/(tabs)/adjust/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import SearchSelect from '@/components/SearchSelect'
import { WarehousePicker } from '@/components/WarehousePicker'
import UnitPicker from '@/components/UnitPicker'
import { useInventory } from '../../InventoryProvider'
import {
  adjustStock,
  getItem,
  getStockOf,
  listLayers,
  searchItems,
} from '@/lib/inventory'
import { money } from '@/lib/format'
import { labelOf, type Uom, familyOf, stepFor } from '@/lib/uom'
import type { Option } from '@/components/SearchSelect'

const MIN_SEARCH_LEN = 2
const REASONS = [
  { value: 'ACCOUNTING', label: 'Ajuste contable' },
  { value: 'DONATION', label: 'Donación / salida no facturada' },
  { value: 'PRODUCTION', label: 'Consumo producción' },
  { value: 'CUSTOMER_RETURN', label: 'Devolución cliente' },
] as const

type ReasonValue = (typeof REASONS)[number]['value']

type ItemLight = {
  id: number
  name: string
  sku?: string | null
  displayUnit?: Uom
  type?: 'PRODUCT' | 'SERVICE'
}

export default function AdjustInventoryPage() {
  const { invalidateAll } = useInventory()

  const [warehouseId, setWarehouseId] = useState<number | undefined>()
  const [itemSearch, setItemSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState<ItemLight | null>(null)
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN')
  const [qty, setQty] = useState('')
  const [adjustUnit, setAdjustUnit] = useState<Uom | ''>('')
  const [unitCost, setUnitCost] = useState('')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState<ReasonValue>('ACCOUNTING')
  const [lotCode, setLotCode] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [productionDate, setProductionDate] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const lastDirectionRef = useRef<'IN' | 'OUT'>(direction)
  const lastQtyRef = useRef<number | null>(null)
  const lastUnitRef = useRef<Uom | ''>('')

  const itemsQ = useQuery({
    queryKey: ['items:search', itemSearch],
    queryFn: () => searchItems(itemSearch),
    enabled: itemSearch.trim().length >= MIN_SEARCH_LEN,
    staleTime: 60_000,
  })

  const itemDetailsQ = useQuery({
    queryKey: ['item:detail', selectedItem?.id],
    queryFn: () => getItem(selectedItem!.id),
    enabled: !!selectedItem,
    staleTime: 60_000,
  })

  const stockQ = useQuery({
    queryKey: ['stock:summary', selectedItem?.id, warehouseId],
    queryFn: () => getStockOf(selectedItem!.id, warehouseId!),
    enabled: !!selectedItem && !!warehouseId,
    staleTime: 30_000,
  })

  const avgCostQ = useQuery({
    queryKey: ['stock:avg-cost', selectedItem?.id, warehouseId],
    enabled: !!selectedItem && !!warehouseId,
    queryFn: async () => {
      const layers = await listLayers(selectedItem!.id, warehouseId!)
      if (!Array.isArray(layers) || layers.length === 0) return null
      const totals = layers.reduce(
        (acc, layer: any) => {
          const qtyLeft = Number(layer.remainingQtyDisplay ?? layer.remainingQtyBase ?? 0)
          const unit = Number(layer.unitCost ?? 0)
          return { qty: acc.qty + qtyLeft, value: acc.value + qtyLeft * unit }
        },
        { qty: 0, value: 0 },
      )
      if (totals.qty <= 0) return null
      return totals.value / totals.qty
    },
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!selectedItem) return
    if (itemDetailsQ.data?.displayUnit) {
      setAdjustUnit(itemDetailsQ.data.displayUnit as Uom)
    } else if (selectedItem.displayUnit) {
      setAdjustUnit(selectedItem.displayUnit)
    }
  }, [itemDetailsQ.data?.displayUnit, selectedItem])

  const itemOptions: Option[] = useMemo(() => {
    const results = Array.isArray(itemsQ.data) ? itemsQ.data : []
    const mapped = results.map((it: any) => ({
      value: it.id,
      label: it.name,
      sublabel: [it.sku, it.displayUnit].filter(Boolean).join(' · '),
    }))
    if (selectedItem) {
      const exists = mapped.some((opt) => Number(opt.value) === selectedItem.id)
      if (!exists) {
        mapped.unshift({
          value: selectedItem.id,
          label: selectedItem.name,
          sublabel: [selectedItem.sku, selectedItem.displayUnit].filter(Boolean).join(' · '),
        })
      }
    }
    return mapped
  }, [itemsQ.data, selectedItem])

  const qtyStep = useMemo(() => {
    const unit = adjustUnit || selectedItem?.displayUnit
    return unit ? stepFor(unit) : 0.01
  }, [adjustUnit, selectedItem?.displayUnit])

  const mutation = useMutation({
    mutationFn: adjustStock,
    onSuccess: (res) => {
      invalidateAll()
      const qtyText = lastQtyRef.current != null
        ? lastQtyRef.current.toLocaleString('es-CO', { maximumFractionDigits: 6 }).replace(/\u00A0/g, ' ')
        : '—'
      setFeedback(
        `Movimiento registrado (ID ${res?.moveId ?? '—'}). Se ${lastDirectionRef.current === 'IN' ? 'sumó' : 'restó'} ${qtyText} ${lastUnitRef.current || ''}.`
      )
      setErrorMsg(null)
      setQty('')
      if (lastDirectionRef.current === 'IN') setUnitCost('')
      setNote('')
      setLotCode('')
      setExpiryDate('')
      setProductionDate('')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? err?.message ?? 'No se pudo registrar el ajuste'
      setErrorMsg(Array.isArray(msg) ? msg.join(', ') : String(msg))
      setFeedback(null)
    },
  })

  function handleSelectItem(opt: Option | null) {
    if (!opt) {
      setSelectedItem(null)
      setAdjustUnit('')
      return
    }
    const results = Array.isArray(itemsQ.data) ? itemsQ.data : []
    const found = results.find((it: any) => Number(it.id) === Number(opt.value))
    setSelectedItem({
      id: Number(opt.value),
      name: opt.label,
      sku: found?.sku ?? null,
      displayUnit: (found?.displayUnit as Uom | undefined) ?? selectedItem?.displayUnit,
      type: found?.type,
    })
    setFeedback(null)
    setErrorMsg(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    setErrorMsg(null)

    if (!selectedItem) {
      setErrorMsg('Selecciona un ítem para ajustar.')
      return
    }
    if (!warehouseId) {
      setErrorMsg('Selecciona la bodega donde se hará el ajuste.')
      return
    }
    let qtyNum = Number(qty)
    if (!Number.isFinite(qtyNum) || qtyNum === 0) {
      setErrorMsg('La cantidad debe ser un número mayor a cero.')
      return
    }
    let finalDirection = direction
    if (qtyNum < 0) {
      qtyNum = Math.abs(qtyNum)
      if (direction === 'IN') {
        finalDirection = 'OUT'
        setDirection('OUT')
      }
    }
    if (qtyNum <= 0) {
      setErrorMsg('La cantidad debe ser un número mayor a cero.')
      return
    }
    if (finalDirection === 'IN' && unitCost) {
      const costNum = Number(unitCost)
      if (!Number.isFinite(costNum) || costNum < 0) {
        setErrorMsg('El costo unitario debe ser un número positivo.')
        return
      }
    }
    lastDirectionRef.current = finalDirection
    lastQtyRef.current = qtyNum
    lastUnitRef.current = (adjustUnit || selectedItem.displayUnit || '') as Uom | ''

    mutation.mutate({
      itemId: selectedItem.id,
      warehouseId,
      direction: finalDirection,
      qty: qtyNum,
      uom: (adjustUnit || undefined) as Uom | undefined,
      unitCost: finalDirection === 'IN' && unitCost ? Number(unitCost) : undefined,
      note: note || undefined,
      refType: undefined,
      refId: undefined,
      lotCode: lotCode || undefined,
      expiryDate: expiryDate || undefined,
      productionDate: productionDate || undefined,
      reason,
    })
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Ajuste manual de inventario</h1>
        <p className="text-sm text-gray-600">
          Registra entradas o salidas extraordinarias. Estos movimientos no generan facturas.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4 rounded-2xl border p-4 shadow-sm bg-white">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-1">
              <WarehousePicker value={warehouseId} onChange={setWarehouseId} />
            </div>
            <div className="md:col-span-1">
              <label className="label">Ítem</label>
              <SearchSelect
                value={selectedItem?.id ?? ''}
                options={itemOptions}
                onSelect={handleSelectItem}
                onInputChange={setItemSearch}
                placeholder="Buscar por nombre o SKU"
              />
            </div>
            <div className="md:col-span-1">
              <label className="label">Dirección</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`btn flex-1 ${direction === 'IN' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setDirection('IN')}
                >
                  Entrada (+)
                </button>
                <button
                  type="button"
                  className={`btn flex-1 ${direction === 'OUT' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setDirection('OUT')}
                >
                  Salida (-)
                </button>
              </div>
            </div>
            <div className="grid gap-2">
              <label className="label">Cantidad</label>
              <input
                className="input"
                type="number"
                step={qtyStep}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="grid gap-2">
              <label className="label">Unidad</label>
              <UnitPicker
                value={(adjustUnit || selectedItem?.displayUnit) as Uom | undefined}
                onChange={(u) => setAdjustUnit((u ?? '') as Uom | '')}
                family={selectedItem?.displayUnit ? familyOf(selectedItem.displayUnit) : undefined}
                disabled={!selectedItem}
              />
            </div>
            <div className="grid gap-2">
              <label className="label">Costo unitario</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                disabled={direction === 'OUT'}
                placeholder={direction === 'OUT' ? 'Solo para entradas' : '0.00'}
              />
            </div>
            <div className="grid gap-2">
              <label className="label">Motivo</label>
              <select
                className="input"
                value={reason}
                onChange={(e) => setReason(e.target.value as ReasonValue)}
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2 md:col-span-2">
              <label className="label">Nota interna</label>
              <textarea
                className="input min-h-[3.5rem]"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Observaciones sobre el ajuste"
              />
            </div>
            <div className="grid gap-2">
              <label className="label">Lote / referencia</label>
              <input
                className="input"
                value={lotCode}
                onChange={(e) => setLotCode(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="grid gap-2">
              <label className="label">Vencimiento</label>
              <input
                className="input"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label className="label">Fecha producción</label>
              <input
                className="input"
                type="date"
                value={productionDate}
                onChange={(e) => setProductionDate(e.target.value)}
              />
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}
          {feedback && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">
              {feedback}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Registrando…' : 'Registrar movimiento'}
            </button>
          </div>
        </div>

        <aside className="space-y-4 rounded-2xl border p-4 shadow-sm bg-white">
          <h2 className="text-lg font-semibold">Resumen</h2>
          {!selectedItem ? (
            <p className="text-sm text-gray-500">Selecciona un ítem para ver su información.</p>
          ) : (
            <div className="space-y-3 text-sm text-gray-700">
              <div>
                <span className="font-medium">Ítem:</span>{' '}
                <span>{selectedItem.name}</span>
                {selectedItem.sku && <span className="text-gray-500"> · {selectedItem.sku}</span>}
              </div>
              <div>
                <span className="font-medium">Unidad sugerida:</span>{' '}
                <span>{labelOf((adjustUnit || selectedItem.displayUnit || 'UN') as Uom)}</span>
              </div>
              <div>
                <span className="font-medium">Bodega:</span>{' '}
                {warehouseId ? `#${warehouseId}` : '—'}
              </div>
              <div>
                <span className="font-medium">Stock actual:</span>{' '}
                {stockQ.isFetching
                  ? '…'
                  : stockQ.data
                    ? `${stockQ.data.qtyDisplay} ${stockQ.data.displayUnit}`
                    : '—'}
              </div>
              <div>
                <span className="font-medium">Costo promedio:</span>{' '}
                {avgCostQ.isFetching
                  ? '…'
                  : avgCostQ.data != null
                    ? money(avgCostQ.data)
                    : '—'}
              </div>
            </div>
          )}
        </aside>
      </form>
    </section>
  )
}
