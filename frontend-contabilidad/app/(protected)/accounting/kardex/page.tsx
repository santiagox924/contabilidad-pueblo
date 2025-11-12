'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import SearchSelect, { type Option as SearchOption } from '@/components/SearchSelect'
import {
  fetchKardex,
  buildKardexExportUrl,
  KardexResponse,
} from '@/lib/accounting-reports'
import { money } from '@/lib/format'
import { searchItems } from '@/lib/inventory'

interface ItemOption {
  id: number
  name: string
  sku?: string | null
}

type KardexRow = KardexResponse['rows'][number]

function firstDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function lastDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}
function fmtQty(n: number) {
  return Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

export default function KardexPage() {
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const searchRequestRef = useRef(0)

  const [itemId, setItemId] = useState<number | ''>('')
  const [from, setFrom] = useState(firstDayOfMonth())
  const [to, setTo] = useState(lastDayOfMonth())

  const [data, setData] = useState<KardexResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedItem, setSelectedItem] = useState<ItemOption | null>(null)

  useEffect(() => {
    void runItemSearch('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!itemId || selectedItem) return
    const found = itemOptions.find((it) => it.id === itemId)
    if (found) setSelectedItem(found)
  }, [itemId, itemOptions, selectedItem])

  async function runItemSearch(term: string) {
    const requestId = ++searchRequestRef.current
    setLoadingItems(true)
    try {
      const results = await searchItems(term)
      if (searchRequestRef.current !== requestId) return
      const mapped: ItemOption[] = results.map((it) => ({
        id: Number(it.id),
        name: it.name,
        sku: it.sku ?? null,
      }))
      setItemOptions(mapped)
    } catch (err) {
      if (searchRequestRef.current !== requestId) return
      setItemOptions([])
    } finally {
      if (searchRequestRef.current !== requestId) return
      setLoadingItems(false)
    }
  }

  async function loadKardex() {
    if (!itemId) {
      setError('Selecciona un producto para consultar el kárdex.')
      setData(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetchKardex({ itemId: Number(itemId), from, to })
      setData(response)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Error cargando el kárdex')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    loadKardex()
  }

  const exportUrl = useMemo(() => buildKardexExportUrl({ itemId, from, to }), [itemId, from, to])

  const totals = data?.totals ?? { inQty: 0, inAmt: 0, outQty: 0, outAmt: 0 }
  const totalNet = totals.inAmt - totals.outAmt

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Kárdex</h1>
            <p className="text-sm text-gray-500">
              Consulta movimientos de inventario por ítem y descarga el detalle en CSV.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={exportUrl}
              className={`btn btn-outline ${!itemId ? 'btn-disabled pointer-events-none opacity-50' : ''}`}
              title={!itemId ? 'Selecciona un producto para exportar' : 'Exportar CSV'}
            >
              Exportar CSV
            </a>
            <Link href="/accounting" className="btn btn-ghost">
              Volver
            </Link>
          </div>
        </div>

        <form onSubmit={onSubmit} className="mb-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Producto</label>
              <SearchSelect
                value={itemId || ''}
                options={itemOptions.map((it) => ({
                  value: it.id,
                  label: it.name,
                  sublabel: it.sku ? `SKU: ${it.sku}` : undefined,
                }))}
                placeholder={loadingItems ? 'Cargando ítems…' : 'Buscar por nombre o SKU…'}
                onSelect={(opt: SearchOption | null) => {
                  if (!opt) {
                    setItemId('')
                    setData(null)
                    setSelectedItem(null)
                    return
                  }
                  const chosen = itemOptions.find((it) => String(it.id) === String(opt.value))
                  const fallbackSku = opt.sublabel?.replace(/^SKU:\s*/i, '') ?? null
                  setSelectedItem(
                    chosen ?? {
                      id: Number(opt.value),
                      name: opt.label,
                      sku: fallbackSku,
                    },
                  )
                  setItemId(Number(opt.value))
                }}
                onInputChange={(text) => {
                  void runItemSearch(text)
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Desde</label>
              <input
                type="date"
                className="input input-bordered w-full rounded-xl"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Hasta</label>
              <input
                type="date"
                className="input input-bordered w-full rounded-xl"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button type="submit" className="btn btn-primary" disabled={loading || !itemId}>
              {loading ? 'Cargando…' : 'Consultar'}
            </button>
            {!!selectedItem && (
              <span className="text-sm text-gray-500">
                {selectedItem.name} {selectedItem.sku ? `· SKU ${selectedItem.sku}` : ''}
              </span>
            )}
          </div>

          {error && (
            <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
              {error}
            </div>
          )}
        </form>

        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Fecha / Hora</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Tipo</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Bodega</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Cantidad</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Costo unitario</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Costo total</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-center text-gray-500">
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && data?.rows?.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 text-sm">{new Date(row.ts).toLocaleString('es-CO')}</td>
                  <td className="px-4 py-2 text-sm">{row.type}</td>
                  <td className="px-4 py-2 text-sm">{row.warehouseId ?? '-'}</td>
                  <td className="px-4 py-2 text-sm text-right">{fmtQty(row.qty)}</td>
                  <td className="px-4 py-2 text-sm text-right">{money(row.unitCost, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</td>
                  <td className="px-4 py-2 text-sm text-right">{money(row.amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-sm">{row.note || '-'}</td>
                </tr>
              ))}
              {!loading && (!data || data.rows.length === 0) && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-center text-gray-500">
                    Selecciona un producto y rango de fechas para ver movimientos.
                  </td>
                </tr>
              )}
            </tbody>
            {!loading && data && data.rows.length > 0 && (
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-4 py-2 text-sm font-medium" colSpan={3}>Totales</td>
                  <td className="px-4 py-2 text-sm text-right font-semibold">
                    Entrada: {fmtQty(totals.inQty)} · Salida: {fmtQty(totals.outQty)}
                  </td>
                  <td className="px-4 py-2 text-sm text-right font-semibold">
                    —
                  </td>
                  <td className="px-4 py-2 text-sm text-right font-semibold" colSpan={2}>
                    Entrada: {money(totals.inAmt, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Salida: {money(totals.outAmt, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Neto: {money(totalNet, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </main>
    </Protected>
  )
}
