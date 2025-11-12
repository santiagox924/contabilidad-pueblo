// app/(protected)/inventory/(tabs)/recipes/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { searchItems, getBom, saveBom, deleteBom } from '@/lib/inventory'
import UnitPicker from '@/components/UnitPicker'
import { type Uom, familyOf } from '@/lib/uom'

type BomComponentRow = { itemId?: number; qty: number; uom?: Uom }

// Conversión simple (supone base = KG para peso, base = L para volumen, UN para conteo)
// Nota: si agregas LENGTH/AREA al BOM en backend, adapta estas reglas o usa un helper compartido.
function convertFromBaseGuess(qtyBase: number, to: Uom): number {
  switch (to) {
    case 'G':  return qtyBase * 1000
    case 'KG': return qtyBase
    case 'ML': return qtyBase * 1000
    case 'L':  return qtyBase
    case 'UN': return qtyBase
    default:   return qtyBase
  }
}

// ===== Preferencia local de "Unidad de rendimiento" por ítem =====
const LS_KEY = 'bomYieldUom'
function loadYieldPref(itemId?: number): Uom | undefined {
  if (typeof window === 'undefined' || !itemId) return undefined
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return undefined
    const map = JSON.parse(raw) as Record<string, Uom>
    return map?.[String(itemId)]
  } catch { return undefined }
}
function saveYieldPref(itemId?: number, u?: Uom) {
  if (typeof window === 'undefined' || !itemId || !u) return
  try {
    const raw = localStorage.getItem(LS_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, Uom>) : {}
    map[String(itemId)] = u
    localStorage.setItem(LS_KEY, JSON.stringify(map))
  } catch {}
}

export default function RecipesPage() {
  const qc = useQueryClient()
  const topRef = useRef<HTMLDivElement>(null)

  // Producto terminado y metadatos de receta (UI)
  const [productId, setProductId] = useState<number | undefined>()
  const [yieldQty, setYieldQty] = useState<string>('1')      // cantidad de rendimiento visible
  const [yieldUom, setYieldUom] = useState<Uom>('UN')        // unidad de rendimiento visible
  const [wastagePct, setWastagePct] = useState<string>('0')  // merma global referencial para edición rápida

  // Filas de componentes
  const [rows, setRows] = useState<BomComponentRow[]>([{ itemId: undefined, qty: 1, uom: 'UN' }])

  // Estados UI
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  /** ---------- Helper: aplica un BOM al formulario (prefill inmediato) ----------
   * Soporta dos formatos:
   *  A) Backend nuevo (/bom): { outputItemId, outputQtyBase, outputUom, yieldQty, yieldUom, components:[{ componentId, qtyBasePerOut, componentUom? }] }
   *  B) Formato legado del front: { itemId, yieldQty, yieldUom, wastagePct, components:[{ itemId, qty, uom }] }
   *
   * Cambios clave:
   *  - Usamos yieldQty/yieldUom cuando vienen del backend.
   *  - Convertimos qty desde base ⇒ a la uom visible del componente.
   *  - Mostramos merma global si todas las líneas tienen el mismo wastePct.
   */
  function prefillFromBom(bom: any | null | undefined) {
    if (!bom) {
      setYieldQty('1')
      setYieldUom('UN')
      setWastagePct('0')
      setRows([{ itemId: undefined, qty: 1, uom: 'UN' }])
      return
    }

    const isNew = bom && typeof bom === 'object' && 'outputItemId' in bom && Array.isArray(bom.components)
    const isLegacy = bom && typeof bom === 'object' && 'itemId' in bom && Array.isArray(bom.components)

    if (isNew) {
      // Rinde
      const uiUom = (bom.yieldUom as Uom) ?? (bom.outputUom as Uom) ?? 'UN'
      setYieldUom(uiUom)
      if (typeof bom.yieldQty === 'number') {
        setYieldQty(String(bom.yieldQty))
      } else {
        // fallback si el backend antiguo no brinda yieldQty
        const outBase = Number(bom.outputQtyBase ?? 1)
        setYieldQty(String(convertFromBaseGuess(outBase, uiUom)))
      }
      if (productId) saveYieldPref(productId, uiUom)

      // Componentes
      const comps = (bom.components as any[]).map(c => {
        const uom: Uom = (c.componentUom as Uom) ?? 'UN'
        const qtyBase = Number(c.qtyBasePerOut ?? 0) // SIEMPRE en base (KG/L/UN)
        const qtyShown = convertFromBaseGuess(qtyBase, uom)
        return { itemId: c.componentId, qty: qtyShown, uom }
      })
      setRows(comps.length ? comps : [{ itemId: undefined, qty: 1, uom: 'UN' }])

      // Merma global si es uniforme
      const wastes = (bom.components as any[]).map(c => Number(c.wastePct ?? 0))
      if (wastes.length && wastes.every(w => w === wastes[0])) setWastagePct(String(wastes[0]))
      else setWastagePct('')

      return
    }

    if (isLegacy) {
      // Rinde
      const u = (bom.yieldUom as Uom) ?? 'UN'
      setYieldUom(u)
      setYieldQty(String(bom.yieldQty ?? 1))
      if (productId) saveYieldPref(productId, u)

      // Merma global (si venía)
      setWastagePct(
        typeof bom.wastagePct === 'number' || typeof bom.wastagePct === 'string'
          ? String(bom.wastagePct)
          : '0'
      )

      // Componentes (suelen venir en base; si la uom visible es G/ML y q<1, lo mostramos convertido a 1000x)
      const comps = (bom.components as any[]).map(c => {
        const uom: Uom = (c.uom as Uom) ?? 'UN'
        const q = Number(c.qty ?? 0)
        const qty =
          (uom === 'G'  && q < 1) ? q * 1000 :
          (uom === 'ML' && q < 1) ? q * 1000 :
          q
        return { itemId: c.itemId, qty, uom }
      })
      setRows(comps.length ? comps : [{ itemId: undefined, qty: 1, uom: 'UN' }])
      return
    }

    // Fallback
    setYieldQty('1'); setYieldUom('UN'); setWastagePct('0')
    setRows([{ itemId: undefined, qty: 1, uom: 'UN' }])
  }

  /** ---------- Efecto: cuando cambia productId, refresca desde API ---------- */
  useEffect(() => {
    if (!productId) return
    setLoading(true); setError(null); setOkMsg(null)
    ;(async () => {
      try {
        const data: any = await getBom(productId) // nuevo o legado
        prefillFromBom(data)

        // Preferir SIEMPRE lo que venga del backend; si no, usar preferencia local; si no, default al displayUnit del item
        if (data?.yieldUom) {
          setYieldUom(data.yieldUom as Uom)
          saveYieldPref(productId, data.yieldUom as Uom)
        } else {
          const saved = loadYieldPref(productId)
          if (saved) {
            setYieldUom(saved)
          } else {
            const cachedAll = qc.getQueryData<any[]>(['items:recipes', ''])
            let it = cachedAll?.find(i => i?.id === productId)
            if (!it) {
              const list = await searchItems('') as any
              if (Array.isArray(list)) it = list.find((x:any) => x?.id === productId)
            }
            if (it) {
              const u = (it.displayUnit ?? it.unit ?? 'UN') as Uom
              setYieldUom(u)
            }
          }
        }

        if (typeof data?.yieldQty === 'number') {
          setYieldQty(String(data.yieldQty))
        }
      } catch (e:any) {
        setError(e?.response?.data?.message ?? e?.message ?? 'No se pudo cargar la receta')
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  function addRow(){ setRows(prev => [...prev, { itemId: undefined, qty: 1, uom: 'UN' }]) }
  function removeRow(i:number){ setRows(prev => prev.length<=1 ? prev : prev.filter((_,idx)=>idx!==i)) }
  function patchRow(i:number, patch:Partial<BomComponentRow>){
    setRows(prev => prev.map((r,idx)=> idx===i ? { ...r, ...patch } : r))
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error('Selecciona el producto terminado')
      const comps = rows
        .filter(r => r.itemId && Number(r.qty) > 0)
        .map(r => ({
          itemId: Number(r.itemId),
          qty: Number(r.qty),
          // enviamos en ambos alias por compatibilidad (el backend acepta unit|uom)
          unit: (r.uom ?? 'UN') as Uom,
          uom:  (r.uom ?? 'UN') as Uom,
        }))
      if (!comps.length) throw new Error('Agrega al menos un componente')

      const payload = {
        itemId: productId,
        // rinde persistente
        yieldQty: Number(yieldQty || 1),
        yieldUom: yieldUom as Uom,
        // merma global referencial (se aplicará a los componentes que no envíen wastePct)
        wastagePct: wastagePct === '' ? undefined : Number(wastagePct || 0),
        components: comps,
      }
      await saveBom(payload as any)

      // Guardar preferencia actual de yieldUom para este ítem (UX)
      saveYieldPref(productId, yieldUom)
    },
    onSuccess: async () => {
      setOkMsg('Receta guardada.')
      setError(null)
      await qc.invalidateQueries({ queryKey:['items:search'] })
      await qc.invalidateQueries({ queryKey:['recipes:list'] })
    },
    onError: (e:any) => {
      setOkMsg(null)
      setError(e?.response?.data?.message ?? e?.message ?? 'No se pudo guardar la receta')
    }
  })

  /** ---------- Handler: viene desde la lista al pulsar "Modificar" ---------- */
  function handleEditFromList(item:any, bom?: any) {
    setProductId(item?.id)
    // Pre-selección rápida de unidad visible mientras llega el BOM (se reemplazará si el backend trae yieldUom)
    const saved = loadYieldPref(item?.id)
    const u = (saved ?? (item?.displayUnit ?? item?.unit ?? 'UN')) as Uom
    setYieldUom(u)

    setOkMsg(null); setError(null)
    if (bom) prefillFromBom(bom)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section className="space-y-4">
      <div ref={topRef} />
      <h2 className="text-lg font-semibold">Recetas (BOM)</h2>
      <p className="text-sm text-gray-600">
        Define la receta del producto terminado. El “Rinde” se guarda y se usa para explotar requerimientos/stock.
      </p>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-3">
          <label className="label">Producto terminado</label>
          <ItemInlinePicker
            value={productId}
            onChange={(id:number|undefined)=>{ setProductId(id); setOkMsg(null); setError(null) }}
            // UX: si conocemos la unidad visible del ítem, úsala temporalmente como "unidad de rendimiento" informativa
            onPicked={(it?:any)=> {
              const saved = loadYieldPref(it?.id)
              setYieldUom((saved ?? (it?.displayUnit ?? it?.unit ?? 'UN')) as Uom)
            }}
          />
        </div>

        <div>
          <label className="label">Rinde (cantidad)</label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.0001"
            value={yieldQty}
            onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setYieldQty(e.target.value)}
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Esta cantidad se guarda junto con su unidad y afecta la explosión de insumos.
          </p>
        </div>
        <div>
          <label className="label">Unidad de rendimiento</label>
          <UnitPicker
            value={yieldUom}
            onChange={(u?: Uom) => {
              if (!u) return
              setYieldUom(u)
              if (productId) saveYieldPref(productId, u) // persistir preferencia del usuario
            }}
            placeholder="Buscar unidad..."
            // Sugerimos familia según la unidad actual (no limita, solo UX)
            family={familyOf(yieldUom)}
            label="Elige unidad…"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Se guarda como preferencia para este producto (además de usarse en cálculos).
          </p>
        </div>
        <div>
          <label className="label">Merma (%)</label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            value={wastagePct}
            onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setWastagePct(e.target.value)}
            placeholder="—"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Si todas las líneas comparten la misma merma, se muestra aquí. Al guardar, se aplica a componentes sin merma.
          </p>
        </div>
      </div>

      {/* ===== Componentes ===== */}
      <div className="rounded-xl border">
        <div className="flex items-center justify-between px-3 py-2">
          <h3 className="font-medium">Componentes</h3>
          <button className="btn btn-outline btn-sm" onClick={addRow}>Agregar componente</button>
        </div>

        {/* Encabezados (solo md+) */}
        <div className="hidden md:grid md:grid-cols-[45%_25%_20%_minmax(110px,1fr)] gap-3 px-3 pb-2 text-xs font-medium text-gray-600">
          <div>Ítem / Insumo</div>
          <div>Cantidad</div>
          <div>Unidad</div>
          <div>Acciones</div>
        </div>

        <div className="px-3 pb-3 space-y-3">
          {rows.map((r, i)=>(
            <div key={i} className="grid md:grid-cols-[45%_25%_20%_minmax(110px,1fr)] gap-3 items-start rounded-lg border border-gray-100 p-3">
              {/* Ítem */}
              <div className="space-y-2">
                <label className="label md:hidden">Ítem / Insumo</label>
                <ItemInlinePicker value={r.itemId} onChange={(id?:number)=>patchRow(i,{ itemId:id })} />
              </div>

              {/* Cantidad */}
              <div className="space-y-2">
                <label className="label md:hidden">Cantidad</label>
                <input
                  className="input w-full"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={r.qty}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>)=>patchRow(i,{ qty: Number(e.target.value || 0) })}
                />
              </div>

              {/* Unidad (persistida como componentUom) */}
              <div className="space-y-2">
                <label className="label md:hidden">Unidad</label>
                <UnitPicker
                  value={r.uom ?? 'UN'}
                  onChange={(u?: Uom) => { if (u) patchRow(i, { uom: u }) }}
                  placeholder="Buscar unidad..."
                  family={familyOf(r.uom ?? 'UN')}
                  label="Elige unidad…"
                />
              </div>

              {/* Acciones */}
              <div className="flex items-start md:justify-end justify-self-end">
                <button className="btn btn-ghost btn-sm" onClick={()=>removeRow(i)} disabled={rows.length<=1}>Quitar</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-gray-600">Cargando receta…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {okMsg && <p className="text-sm text-green-700">{okMsg}</p>}

      <div className="flex justify-end">
        <button className="btn btn-primary" disabled={!productId || saveMut.isPending} onClick={()=>saveMut.mutate()}>
          {saveMut.isPending ? 'Guardando…' : 'Guardar receta'}
        </button>
      </div>

      {/* ===== Lista inferior: Ítems que tienen BOM ===== */}
      <ItemsConRecetaList
        onEdit={handleEditFromList}   // ⬅️ pasa también el BOM y el ítem
        onDeleted={async (deletedId:number)=>{
          await qc.invalidateQueries({ queryKey:['recipes:list'] })
          if (productId === deletedId) {
            setProductId(undefined)
            setOkMsg('Receta eliminada.')
            setYieldQty('1'); /* no tocar yieldUom */ setWastagePct('0')
            setRows([{ itemId: undefined, qty: 1, uom: 'UN' }])
          }
        }}
      />
    </section>
  )
}

/* ========= Picker de ítems reutilizable ========= */
function ItemInlinePicker({
  value,
  onChange,
  onPicked,
}: {
  value?: number
  onChange: (id?: number) => void
  /** opcional: devuelve el objeto del ítem elegido (para UX como setear yieldUom) */
  onPicked?: (item: any | undefined) => void
}) {
  const [q, setQ] = useState('')
  const { data, isFetching } = useQuery({
    queryKey: ['items:recipes', q],
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
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
      />
      <select
        className="input w-full"
        value={value ?? ''}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
          const v = e.target.value ? Number(e.target.value) : undefined
          onChange(v)
          if (onPicked) {
            const it = items.find((i:any) => i.id === v)
            onPicked(it)
          }
        }}
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

/* ========= Lista de ítems que tienen BOM ========= */
function ItemsConRecetaList({
  onEdit,
  onDeleted,
}:{
  onEdit: (item:any, bom?: any)=>void
  onDeleted: (deletedItemId:number) => void
}) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  const listQ = useQuery({
    queryKey: ['recipes:list', q],
    queryFn: async () => {
      // 1) Buscar ítems coincidentes
      const items = await searchItems(q)
      const all = Array.isArray(items) ? items : []

      // 2) Limitar por performance
      const LIMITED = all.slice(0, 300)

      // 3) Traer BOM de cada uno y quedarnos con los que sí tienen
      const results = await Promise.all(
        LIMITED.map(async (it:any) => {
          try {
            const bom:any = await getBom(it.id) // puede venir formato nuevo o legado
            const comps = Array.isArray(bom?.components) ? bom.components : []
            const count =
              comps.length > 0
                ? comps.filter((c:any)=> (c.componentId ?? c.itemId) != null).length
                : 0
            if (count > 0) return { item: it, bom, compCount: count }
          } catch(_e){}
          return null
        })
      )
      return results.filter(Boolean) as { item:any; bom:any; compCount:number }[]
    },
    staleTime: 30_000,
  })

  const data = listQ.data ?? []
  const pages = Math.max(1, Math.ceil(data.length / pageSize))
  const paged = data.slice((page-1)*pageSize, (page-1)*pageSize + pageSize)

  useEffect(()=>{ setPage(1) }, [q, pageSize])

  const delMut = useMutation({
    mutationFn: async (itemId:number) => {
      // ✅ usar DELETE real (elimina solo la receta activa del ítem)
      await deleteBom(itemId)
    },
    onSuccess: async (_data, deletedItemId) => {
      await qc.invalidateQueries({ queryKey:['recipes:list'] })
      onDeleted(deletedItemId)
    }
  })

  return (
    <section className="mt-6 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-base font-semibold">Ítems con receta</h3>
        <div className="flex items-center gap-2">
          <input
            className="input"
            placeholder="Buscar por nombre o SKU…"
            value={q}
            onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setQ(e.target.value)}
          />
          <label className="label">Por página</label>
          <select
            className="input"
            value={pageSize}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>)=>setPageSize(Number(e.target.value))}
          >
            {[10,20,50,100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-auto rounded-lg border">
        <table className="table text-sm">
          <thead>
            <tr>
              <th className="th">SKU</th>
              <th className="th">Ítem</th>
              <th className="th">Unidad</th>
              <th className="th">Componentes</th>
              <th className="th">Acciones</th>
            </tr>
          </thead>
        <tbody className="divide-y divide-gray-100">
            {paged.map((r)=>(
              <tr key={r.item.id}>
                <td className="td whitespace-nowrap">{r.item.sku ?? '—'}</td>
                <td className="td">
                  <div className="truncate" title={r.item.name}>{r.item.name}</div>
                </td>
                <td className="td whitespace-nowrap">{r.item.displayUnit || r.item.unit || 'UN'}</td>
                <td className="td whitespace-nowrap"><span className="badge">{r.compCount} comp.</span></td>
                <td className="td">
                  <div className="flex gap-2">
                    <button
                      className="btn btn-sm"
                      onClick={()=>onEdit(r.item, r.bom)}  // ⬅️ enviamos el ÍTEM completo y el BOM
                    >
                      Modificar
                    </button>
                    <button
                      className="btn btn-outline btn-sm btn-error"
                      onClick={()=> {
                        if (window.confirm('¿Eliminar la receta de este ítem? Esta acción no se puede deshacer.')) {
                          delMut.mutate(r.item.id)
                        }
                      }}
                      disabled={delMut.isPending}
                      title="Eliminar receta de este ítem"
                    >
                      {delMut.isPending ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {listQ.isFetching && <p className="text-gray-600 mt-2 px-3 pb-3">Cargando lista…</p>}
        {!listQ.isFetching && !data.length && <p className="text-gray-600 mt-2 px-3 pb-3">No se encontraron ítems con receta.</p>}
      </div>

      <div className="flex items-center justify-end gap-2">
        <div className="badge">Página {page} / {pages}</div>
        <button className="btn" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}>Prev</button>
        <button className="btn" onClick={()=>setPage(p=>Math.min(pages,p+1))} disabled={page>=pages}>Next</button>
      </div>

      <p className="text-[11px] text-gray-500">Nota: por rendimiento, la búsqueda evalúa hasta 300 ítems coincidentes.</p>
    </section>
  )
}
