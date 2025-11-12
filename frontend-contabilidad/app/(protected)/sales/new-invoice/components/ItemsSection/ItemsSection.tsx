'use client'

import { useRef } from 'react'
import { useInvoiceForm } from '../../context/InvoiceFormContext'
import UnitPicker from '@/components/UnitPicker'
import SearchSelect from '@/components/SearchSelect'

export default function ItemsSection() {
  const {
    // data
    itemsArr, warehousesArr, defaultWarehouseId,
    // líneas
    lines, addLine, removeLine, updateLine,
    // helpers
    getItem, isService, effectiveWarehouseId,
    refreshAvailabilityForLine, recomputeAvailabilityForGroup,
    allowedUomsForItem, familyHumanName, stepForUom,
    convertUnitPrice, fmtQty,
    // UI hints (nube de precios)
    priceHintIdx, setPriceHintIdx, priceRefs,
  } = useInvoiceForm()

  const searchInputRefs = useRef<Array<HTMLInputElement | null>>([])

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium">Ítems</h2>
        <button type="button" className="btn btn-outline" onClick={addLine}>
          Agregar línea
        </button>
      </div>

      <div className="space-y-3">
        {lines.map((ln, idx) => {
          const selected = itemsArr.find((i) => i.id === ln.itemId)
          const defaultUom = (selected?.displayUnit as any) ?? 'UN'
          const uom = (ln.uom ?? defaultUom) as any
          const hasBands =
            (selected?.priceMin ?? null) !== null ||
            (selected?.priceMid ?? null) !== null ||
            (selected?.priceMax ?? null) !== null

          // Convertir bandas a la UOM seleccionada (precio por unidad se convierte con factor inverso)
          const rawMin = Number(selected?.priceMin ?? NaN)
          const rawMid = Number(selected?.priceMid ?? NaN)
          const rawMax = Number(selected?.priceMax ?? NaN)
          const minAdj = Number.isFinite(rawMin) ? convertUnitPrice(rawMin, defaultUom, uom) : NaN
          const midAdj = Number.isFinite(rawMid) ? convertUnitPrice(rawMid, defaultUom, uom) : NaN
          const maxAdj = Number.isFinite(rawMax) ? convertUnitPrice(rawMax, defaultUom, uom) : NaN

          const serv = isService(ln)
          const showNoStock = !serv && typeof ln.available === 'number' && ln.available <= 0

          return (
            <div key={idx}>
              <div className="grid grid-cols-1 md:grid-cols-[0.9fr_1.2fr_0.55fr_0.55fr_0.6fr_0.9fr_0.9fr_auto] gap-3 items-start border rounded-xl p-3">
                {/* Bodega (línea) */}
                <div className={serv ? 'opacity-30 pointer-events-none' : ''}>
                  <label className="block text-sm font-medium mb-1">Bodega (línea)</label>
                  <select
                    className="select select-bordered w-full rounded-xl"
                    value={serv ? '' : (ln.warehouseId ?? (defaultWarehouseId || ''))}
                    onChange={async (e) => {
                      const prevWid = effectiveWarehouseId(ln)
                      const wid = e.target.value ? Number(e.target.value) : undefined
                      updateLine(idx, { warehouseId: serv ? undefined : wid, baseAvailable: undefined, available: undefined })
                      if (!serv && ln.itemId && wid) await refreshAvailabilityForLine(idx, ln.itemId, false, wid)
                      if (!serv && ln.itemId && prevWid) recomputeAvailabilityForGroup(ln.itemId, prevWid)
                      if (!serv && ln.itemId && wid) recomputeAvailabilityForGroup(ln.itemId, wid)
                    }}
                    disabled={serv}
                  >
                    <option value="">-- seleccionar --</option>
                    {warehousesArr.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                {/* Ítem (buscador) */}
                <div className="rscope">
                  <label className="block text-sm font-medium mb-1">Ítem</label>
                  <SearchSelect
                    onInputRef={(el: HTMLInputElement | null) => {
                      searchInputRefs.current[idx] = el
                    }}
                    value={ln.itemId != null ? String(ln.itemId) : ''}
                    options={itemsArr.map((it) => {
                      const rawCat = (it as any)?.category
                      const catName =
                        typeof rawCat === 'string'
                          ? rawCat
                          : (rawCat?.name ?? '')

                      return {
                        value: String(it.id),
                        label: `${it.name}${it.sku ? ` (${it.sku})` : ''}`,
                        sublabel: it.type === 'SERVICE' ? 'Servicio' : catName,
                      }
                    })}
                    placeholder="Buscar ítem por nombre o SKU…"
                    onSelect={async (opt: any) => {
                      const prevItem = ln.itemId
                      const id = opt && opt.value != null ? Number(opt.value) : undefined
                      const it = itemsArr.find((ii) => ii.id === id)
                      const nextUom = (it?.displayUnit as any) || 'UN'
                      const defPrice = Number(it?.priceMax ?? it?.price ?? 0) // en displayUnit
                      const isServNext = (it?.type || 'PRODUCT') === 'SERVICE'
                      const nextWarehouseId = isServNext
                        ? undefined
                        : (ln.warehouseId ?? (defaultWarehouseId ? Number(defaultWarehouseId) : undefined))

                      if (id) {
                        const duplicateIdx = lines.findIndex((line, lineIdx) => {
                          if (lineIdx === idx) return false
                          if (line.itemId !== id) return false
                          if (isServNext) return true
                          const targetWid = effectiveWarehouseId(line)
                          return targetWid === nextWarehouseId
                        })

                        if (duplicateIdx >= 0) {
                          const dupLine = lines[duplicateIdx]
                          const newQty = Number(dupLine.qty || 0) + 1
                          const newTotal = round2(newQty * Number(dupLine.unitPrice || 0))
                          updateLine(duplicateIdx, { qty: newQty, lineTotal: newTotal })

                          if (!isServNext) {
                            const dupWid = effectiveWarehouseId(dupLine)
                            if (dupWid) recomputeAvailabilityForGroup(id, dupWid)
                          }

                          updateLine(idx, {
                            itemId: undefined,
                            qty: 1,
                            unitPrice: 0,
                            lineTotal: 0,
                            discountPct: 0,
                            vatPct: 0,
                            uom: 'UN',
                            baseAvailable: undefined,
                            available: undefined,
                            warehouseId: nextWarehouseId,
                            uomError: undefined,
                          })

                          setTimeout(() => {
                            const input = searchInputRefs.current[idx]
                            if (input) {
                              input.focus()
                              input.select?.()
                            }
                          }, 50)

                          if (priceHintIdx === idx) setPriceHintIdx(null)
                          return
                        }
                      }

                      updateLine(idx, {
                        itemId: id,
                        qty: id ? 1 : 0,
                        unitPrice: id ? defPrice : 0,
                        lineTotal: id ? round2(1 * defPrice) : 0,
                        discountPct: id ? Number(it?.defaultDiscountPct ?? 0) : 0,
                        vatPct: id ? Number(it?.ivaPct ?? ln.vatPct ?? 0) : ln.vatPct,
                        uom: nextUom,
                        warehouseId: nextWarehouseId,
                        baseAvailable: undefined,
                        available: undefined,
                        uomError: undefined,
                      })
                      if (priceHintIdx === idx) setPriceHintIdx(null)

                      if (!isServNext) {
                        const wid = nextWarehouseId
                        if (id && wid) await refreshAvailabilityForLine(idx, id, false, wid)
                        if (prevItem) {
                          const prevWid = effectiveWarehouseId(ln)
                          if (prevWid) recomputeAvailabilityForGroup(prevItem, prevWid)
                        }
                        if (id && wid) recomputeAvailabilityForGroup(id, wid)
                      } else {
                        // Servicios: limpiar disponibilidad mostrada
                        updateLine(idx, { available: undefined, baseAvailable: undefined })
                      }

                      if (id && idx === lines.length - 1) {
                        addLine()
                        setTimeout(() => {
                          const nextInput = searchInputRefs.current[idx + 1]
                          if (nextInput) {
                            nextInput.focus()
                            nextInput.select?.()
                          }
                        }, 50)
                      }
                    }}
                  />
                  {/* Oculta el botón de limpiar del react-select dentro de este bloque */}
                  <style jsx>{`
                    .rscope :global(.react-select__clear-indicator) { display: none !important; }
                    .rscope :global([aria-label="Clear value"]) { display: none !important; }
                  `}</style>
                </div>

                {/* Unidad */}
                <div className={serv ? 'opacity-30 pointer-events-none' : ''}>
                  <label className="block text-sm font-medium mb-1">Unidad</label>
                  <UnitPicker
                    value={uom}
                    onChange={(nextU: any) => {
                      const it = getItem(ln.itemId)
                      const allowed = allowedUomsForItem(it)
                      const isOk = allowed.includes(nextU)

                      // precio: convertir de uom actual -> nueva uom (precio por unidad)
                      const prevU = (ln.uom ?? it?.displayUnit ?? 'UN') as any
                      let newUnitPrice = Number(ln.unitPrice || 0)
                      if (isOk) {
                        try {
                          newUnitPrice = convertUnitPrice(Number(ln.unitPrice || 0), prevU, nextU)
                        } catch {
                          // si fallara conversión, mantenemos valor y marcamos error
                        }
                      }

                      // Aplica selección y conversión de precio; si incompatible, marca error
                      const newLineTotal = round2(Number(ln.qty || 0) * newUnitPrice)
                      updateLine(idx, {
                        uom: nextU,
                        unitPrice: newUnitPrice,
                        lineTotal: newLineTotal,
                        uomError: isOk ? undefined : `No se permite vender ${nextU} en ${familyHumanName(it?.unitKind || undefined)}`,
                      })

                      // Recalcular disponibilidad mostrada con baseAvailable (si compatible)
                      if (isOk) {
                        const baseAvail = Number(ln.baseAvailable ?? NaN)
                        if (!Number.isNaN(baseAvail)) {
                          const wid = effectiveWarehouseId(ln)
                          const reservedOthersBase = (ln.itemId && wid)
                            ? reservedInOtherLinesBase(getItem, linesForCalc(lines), effectiveWarehouseId, isService, ln.itemId, wid, idx)
                            : 0
                          const adjBase = Math.max(0, baseAvail - reservedOthersBase)
                          try {
                            const shown = convertFromBaseSafe(adjBase, it?.baseUnit as any || 'UN', nextU)
                            updateLine(idx, { available: shown })
                          } catch {
                            updateLine(idx, { available: undefined })
                          }
                        }
                      }
                    }}
                    placeholder="Buscar unidad…"
                    label="Elige unidad…"
                    disabled={serv || !ln.itemId}
                    // ⬇️ Restringe sugerencias a la familia del ítem seleccionado (ventas)
                    family={selected?.unitKind as any}
                  />
                  {ln.uomError && (
                    <p className="text-xs text-red-600 mt-1">{ln.uomError}</p>
                  )}
                </div>

                {/* Cantidad */}
                <div className="relative">
                  <label className="block text-sm font-medium mb-1">Cantidad</label>
                  <input
                    type="number"
                    min={stepForUom(uom)}
                    step={stepForUom(uom)}
                    className={[
                      'input input-bordered w-full rounded-xl',
                      showNoStock ? 'bg-red-50 border-red-300 focus:border-red-400' : ''
                    ].join(' ')}
                    title={showNoStock ? 'En esta bodega no hay stock' : undefined}
                    value={ln.qty}
                    onChange={(e) => {
                      const step = stepForUom(uom)
                      let raw = Number(e.target.value ?? step)
                      if (!Number.isFinite(raw) || raw <= 0) raw = step
                      // Ajustar a múltiplo del step (soporta decimales)
                      const k = Math.round(raw / step)
                      raw = roundStep(k * step, step)

                      const newTotal = round2(raw * Number(ln.unitPrice || 0))
                      updateLine(idx, { qty: raw, lineTotal: newTotal })
                      const wid = effectiveWarehouseId(ln)
                      if (!serv && ln.itemId && wid) recomputeAvailabilityForGroup(ln.itemId, wid)
                    }}
                    onBlur={async () => {
                      if (ln.itemId && !serv) await refreshAvailabilityForLine(idx, ln.itemId, false)
                    }}
                  />
                  {showNoStock && (
                    <div className="absolute z-20 top-full left-0 mt-1 rounded-md bg-red-600 text-white text-xs px-2 py-1 shadow">
                      En esta bodega no hay stock
                    </div>
                  )}
                </div>

                {/* Disponible */}
                <div>
                  <label className="block text-sm font-medium mb-1">Disponible</label>
                  <div className="h-10 flex items-center px-2 border rounded-xl bg-gray-50">
                    {serv ? '—' : (ln.loadingAvail ? '…' : `${fmtQty(uom, ln.available)}${typeof ln.available === 'number' ? ` ${uom}` : ''}`)}
                  </div>
                </div>

                {/* Precio unitario + nube de bandas */}
                <div className="relative" ref={(el) => { priceRefs.current[idx] = el }}>
                  <label className="block text-sm font-medium mb-1">P. unitario</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className="input input-bordered w-full rounded-xl"
                      value={ln.unitPrice}
                      onChange={(e) => {
                        const up = Number(e.target.value)
                        const newTotal = round2(Number(ln.qty || 0) * up)
                        updateLine(idx, { unitPrice: up, lineTotal: newTotal })
                      }}
                      onClick={(e) => { e.stopPropagation(); setPriceHintIdx(idx) }}
                    />
                  </div>

                  {hasBands && priceHintIdx === idx && (
                    <div className="absolute z-20 top-full left-0 mt-1 rounded-xl border bg-white shadow px-3 py-2 text-xs whitespace-nowrap">
                      <div className="opacity-70 mb-1">Bandas de precio (por {uom})</div>
                      <div>Mínimo: <strong>{Number.isFinite(minAdj) ? money(minAdj) : '—'}</strong></div>
                      <div>Medio: <strong>{Number.isFinite(midAdj) ? money(midAdj) : '—'}</strong></div>
                      <div>Máximo: <strong>{Number.isFinite(maxAdj) ? money(maxAdj) : '—'}</strong></div>
                    </div>
                  )}
                </div>

                {/* Total línea */}
                <div>
                  <label className="block text-sm font-medium mb-1">Total</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="input input-bordered w-full rounded-xl"
                    value={ln.lineTotal ?? round2(Number(ln.qty || 0) * Number(ln.unitPrice || 0))}
                    onChange={(e) => {
                      const rawTotal = Number(e.target.value || 0)
                      const qty = Number(ln.qty || 0)
                      const newUnit = qty > 0 ? round2(rawTotal / qty) : 0
                      updateLine(idx, { lineTotal: rawTotal, unitPrice: newUnit })
                    }}
                  />
                </div>

                {/* % Descuento */}

                {/* Acciones */}
                <div className="flex justify-end items-end md:pt-6">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      if (priceHintIdx === idx) setPriceHintIdx(null)
                      removeLine(idx)
                    }}
                  >
                    Quitar
                  </button>
                </div>
              </div>

              {/* Botón “Agregar línea” debajo de la ÚLTIMA línea */}
              {idx === lines.length - 1 && (
                <div className="flex justify-end mt-2">
                  <button type="button" className="btn btn-outline btn-sm" onClick={addLine}>
                    Agregar línea
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ===================== Helpers locales ===================== */

function round2(n: number) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

/** Ajusta a precisión del step (evita 0.30000000004, etc.) */
function roundStep(value: number, step: number) {
  const decimals = (step.toString().split('.')[1] || '').length
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

function money(v: number) {
  return v.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })
}

/** Copias locales pequeñas para no importar todo el contexto aquí */
function convertFromBaseSafe(qBase: number, base: any, toUom: any) {
  // @ts-ignore: la librería real ya se usa en el contexto; aquí solo para tipo
  const { fromBase } = require('@/lib/uom')
  return fromBase(qBase, base, toUom)
}

function reservedInOtherLinesBase(
  getItem: (id?: number) => any,
  lines: any[],
  effectiveWarehouseId: (l: any) => number | undefined,
  isService: (l: any) => boolean,
  itemId: number,
  warehouseId: number,
  excludeIndex?: number
) {
  // @ts-ignore
  const { toBase } = require('@/lib/uom')
  const it = getItem(itemId)
  const base = (it?.baseUnit as any) || 'UN'
  return lines.reduce((acc, l, idx) => {
    if (idx === (excludeIndex ?? -1)) return acc
    const wid = effectiveWarehouseId(l)
    if (!isService(l) && l.itemId === itemId && wid === warehouseId) {
      const from = (l.uom ?? it?.displayUnit ?? base) as any
      try {
        const qBase = toBase(Number(l.qty || 0), from, base)
        return acc + qBase
      } catch { return acc }
    }
    return acc
  }, 0)
}

function linesForCalc(lines: any[]) {
  // Evita cerrar sobre 'lines' de React en el onChange
  return JSON.parse(JSON.stringify(lines))
}
