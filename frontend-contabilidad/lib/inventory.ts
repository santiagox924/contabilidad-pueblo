// frontend-contabilidad/lib/inventory.ts
import { api } from '@/lib/api'
import { type Uom } from '@/lib/uom'
import type { TaxProfile } from '@/lib/categories'

export type OrderDir = 'asc' | 'desc'

function arr<T = any>(x: any): T[] {
  if (Array.isArray(x)) return x as T[]
  if (Array.isArray((x as any)?.items)) return (x as any).items as T[]
  return []
}
function num(x: any, fallback = 0): number {
  const n = typeof x === 'number' ? x : Number(x)
  return Number.isFinite(n) ? n : fallback
}

/** ====================== Bodegas ====================== */
export async function listWarehouses() {
  const { data } = await api.get('/inventory/warehouses')
  return arr<{ id:number; name:string }>(data)
}
export async function createWarehouse(name: string) {
  const { data } = await api.post('/inventory/warehouses', { name })
  return data as { id:number; name:string }
}

/** ====================== Ítems ====================== */
/** Buscar ítems por nombre / SKU (para selectores y tablas) */
export async function searchItems(q: string) {
  const { data } = await api.get('/items', { params: { q } })
  return arr<{
    id:number
    sku?:string
    name:string
    baseUnit:string
    displayUnit:string
    ivaPct?: number
    active?: boolean
    type?: 'PRODUCT'|'SERVICE'
    // nuevos:
    priceMin?: number|null
    priceMid?: number|null
    priceMax?: number|null
    defaultDiscountPct?: number|null
    // compat:
    price?: number|null
  }>(data)
}

/** Obtener un ítem por ID (para el modal de edición) */
export async function getItem(id: number) {
  const { data } = await api.get(`/items/${id}`)
  return {
    id: num((data as any)?.id ?? id),
    sku: (data as any)?.sku ?? '',
    name: (data as any)?.name ?? '',
    type: (data as any)?.type ?? 'PRODUCT',
    unitKind: (data as any)?.unitKind ?? 'COUNT',
    baseUnit: (data as any)?.baseUnit ?? (data as any)?.unit ?? 'UN',
    displayUnit: (data as any)?.displayUnit ?? (data as any)?.unit ?? 'UN',
    ivaPct: num((data as any)?.ivaPct),
    // nuevos:
    priceMin: (data as any)?.priceMin != null ? Number((data as any).priceMin) : null,
    priceMid: (data as any)?.priceMid != null ? Number((data as any).priceMid) : null,
    priceMax: (data as any)?.priceMax != null ? Number((data as any).priceMax) : null,
    defaultDiscountPct: (data as any)?.defaultDiscountPct != null ? Number((data as any).defaultDiscountPct) : null,
    // compat:
    price: (data as any)?.price != null ? Number((data as any).price) : null,
    active: Boolean((data as any)?.active ?? true),
  }
}

/** Crear ítem */
export async function createItem(dto: {
  sku: string
  name: string
  type: 'PRODUCT' | 'SERVICE'
  unit?: string
  unitKind?: 'COUNT'|'WEIGHT'|'VOLUME'|'LENGTH'|'AREA'
  baseUnit?: string | Uom
  displayUnit?: string | Uom
  ivaPct?: number
  // nuevos:
  priceMin?: number|null
  priceMid?: number|null
  priceMax?: number|null
  // compat:
  price?: number|null
  active?: boolean
  categoryId?: number | null
  taxProfile?: TaxProfile
  defaultTaxId?: number | null
  incomeAccountCode?: string | null
  expenseAccountCode?: string | null
  inventoryAccountCode?: string | null
  taxAccountCode?: string | null
  defaultDiscountPct?: number | null
}) {
  // ❗️No forzar COUNT/UN por defecto: dejar que el backend infiera si no se envía
  const payload: any = {
    sku: dto.sku,
    name: dto.name,
    type: dto.type,
    ivaPct: dto.ivaPct ?? 0,
    // nuevos:
    priceMin: dto.priceMin ?? null,
    priceMid: dto.priceMid ?? null,
    priceMax: dto.priceMax ?? null,
    // compat:
    price: dto.price ?? null,
    active: dto.active ?? true,
  }

  // Solo incluir los campos de unidad si vienen definidos:
  if (dto.unit != null) payload.unit = dto.unit
  if (dto.unitKind != null) payload.unitKind = dto.unitKind
  if (dto.baseUnit != null) payload.baseUnit = dto.baseUnit
  if (dto.displayUnit != null) payload.displayUnit = dto.displayUnit

  if (dto.categoryId !== undefined) payload.categoryId = dto.categoryId == null ? null : Number(dto.categoryId)
  if (dto.taxProfile !== undefined) payload.taxProfile = dto.taxProfile
  if (dto.defaultTaxId !== undefined) payload.defaultTaxId = dto.defaultTaxId == null ? null : Number(dto.defaultTaxId)
  if (dto.incomeAccountCode !== undefined) payload.incomeAccountCode = dto.incomeAccountCode ?? null
  if (dto.expenseAccountCode !== undefined) payload.expenseAccountCode = dto.expenseAccountCode ?? null
  if (dto.inventoryAccountCode !== undefined) payload.inventoryAccountCode = dto.inventoryAccountCode ?? null
  if (dto.taxAccountCode !== undefined) payload.taxAccountCode = dto.taxAccountCode ?? null
  if ((dto as any).purchaseTaxAccountCode !== undefined) payload.purchaseTaxAccountCode = (dto as any).purchaseTaxAccountCode ?? null
  if (dto.defaultDiscountPct !== undefined) payload.defaultDiscountPct = dto.defaultDiscountPct == null ? null : Number(dto.defaultDiscountPct)

  const { data } = await api.post('/items', payload)
  return data
}

/** Actualizar ítem */
export async function updateItem(
  id: number,
  payload: {
    sku?: string
    name?: string
    type?: 'PRODUCT'|'SERVICE'
    unitKind?: 'COUNT'|'WEIGHT'|'VOLUME'|'LENGTH'|'AREA'
    baseUnit?: Uom | string
    displayUnit?: Uom | string
    ivaPct?: number
    // nuevos:
    priceMin?: number|null
    priceMid?: number|null
    priceMax?: number|null
    // compat:
    price?: number|null
    active?: boolean
    categoryId?: number | null
    taxProfile?: TaxProfile
    defaultTaxId?: number | null
    incomeAccountCode?: string | null
    expenseAccountCode?: string | null
    inventoryAccountCode?: string | null
    taxAccountCode?: string | null
    defaultDiscountPct?: number | null
  }
) {
  const body: Record<string, unknown> = { ...payload }

  if (payload.categoryId !== undefined) body.categoryId = payload.categoryId == null ? null : Number(payload.categoryId)
  if (payload.defaultTaxId !== undefined) body.defaultTaxId = payload.defaultTaxId == null ? null : Number(payload.defaultTaxId)
  if (payload.defaultDiscountPct !== undefined) body.defaultDiscountPct = payload.defaultDiscountPct == null ? null : Number(payload.defaultDiscountPct)
  if ((payload as any).purchaseTaxAccountCode !== undefined) body.purchaseTaxAccountCode = (payload as any).purchaseTaxAccountCode ?? null

  const { data } = await api.put(`/items/${id}`, body)
  return data
}

/** Eliminar un ítem */
export async function deleteItem(id: number) {
  const { data } = await api.delete(`/items/${id}`)
  return data
}

/** Buscar ítem por código de barras */
export async function getItemByBarcode(barcode: string) {
  const trimmed = barcode.trim()
  if (!trimmed) {
    throw new Error('El código de barras es obligatorio.')
  }
  const { data } = await api.get(`/items/by-barcode/${encodeURIComponent(trimmed)}`)
  return {
    id: num((data as any)?.id),
    sku: (data as any)?.sku ?? '',
    barcode: (data as any)?.barcode ?? trimmed,
    name: (data as any)?.name ?? '',
    type: (data as any)?.type ?? 'PRODUCT',
    unitKind: (data as any)?.unitKind ?? 'COUNT',
    baseUnit: (data as any)?.baseUnit ?? (data as any)?.unit ?? 'UN',
    displayUnit: (data as any)?.displayUnit ?? (data as any)?.unit ?? 'UN',
    ivaPct: num((data as any)?.ivaPct),
    priceMin: (data as any)?.priceMin != null ? Number((data as any).priceMin) : null,
    priceMid: (data as any)?.priceMid != null ? Number((data as any).priceMid) : null,
    priceMax: (data as any)?.priceMax != null ? Number((data as any).priceMax) : null,
  defaultDiscountPct: (data as any)?.defaultDiscountPct != null ? Number((data as any).defaultDiscountPct) : null,
    price: (data as any)?.price != null ? Number((data as any).price) : null,
    active: Boolean((data as any)?.active ?? true),
  }
}

/** ====================== Stock ====================== */
export async function getStockByItem(itemId: number) {
  const { data } = await api.get(`/inventory/stock/${itemId}`)
  return {
    itemId: num((data as any)?.itemId ?? itemId),
    totalQtyBase: num((data as any)?.totalQtyBase ?? (data as any)?.totalQty ?? (data as any)?.qtyBase),
    totalQtyDisplay: num((data as any)?.totalQtyDisplay ?? (data as any)?.totalQty ?? (data as any)?.qtyDisplay),
    displayUnit: (data as any)?.displayUnit ?? (data as any)?.unit ?? '',
  }
}
export async function getStockOf(itemId: number, warehouseId: number) {
  const { data } = await api.get(`/inventory/stock/${itemId}/${warehouseId}`)
  return {
    itemId: num((data as any)?.itemId ?? itemId),
    warehouseId: num((data as any)?.warehouseId ?? warehouseId),
    qtyBase: num((data as any)?.qtyBase ?? (data as any)?.totalQtyBase),
    qtyDisplay: num((data as any)?.qtyDisplay ?? (data as any)?.totalQtyDisplay),
    displayUnit: (data as any)?.displayUnit ?? (data as any)?.unit ?? '',
    nextExpiry: (data as any)?.nextExpiry ?? null,
  }
}

/** ====================== Kardex ====================== */
export async function getKardex(params: { itemId:number; warehouseId?:number; from?:string; to?:string }) {
  const { data } = await api.get('/inventory/kardex', { params })
  return arr<{
    id:number
    date:string
    type:string
    qtyDisplay:number
    balanceDisplay:number
    displayUnit:string
    refType?:string
    refId?:number
    note?:string
  }>(data)
}

/** ====================== Movimientos ====================== */
export async function listMoves(params: { itemId?:number; warehouseId?:number; take?:number; skip?:number; orderDir?:OrderDir }) {
  const { data } = await api.get('/inventory/moves', { params })
  if (Array.isArray(data)) {
    return { total: data.length, items: data }
  }
  return {
    total: num((data as any)?.total),
    items: arr<{
      id:number
      createdAt:string
      type:string
      qtyDisplay:number
      displayUnit:string
      warehouse:{ id:number; name:string }
      item:{ id:number; name:string; displayUnit:string }
      refType?:string
      refId?:number
      note?:string
    }>(data),
  }
}

/** ====================== Capas (batches) ====================== */
export async function listLayers(itemId:number, warehouseId:number) {
  const { data } = await api.get(`/inventory/layers/${itemId}/${warehouseId}`)
  return arr<{
    id:number
    itemId:number
    warehouseId:number
    remainingQtyBase:number
    remainingQtyDisplay:number
    displayUnit:string
    unitCost:number
    createdAt:string
    expiryDate?: string | null
    lotCode?: string | null
    productionDate?: string | null
    moveInId?:number
  }>(data)
}

/** ====================== Ajuste manual (IN/OUT) ====================== */
export async function adjustStock(payload: {
  itemId: number
  warehouseId: number
  direction: 'IN' | 'OUT'
  qty: number
  uom?: Uom
  unitCost?: number
  note?: string
  refType?: string
  refId?: number
  expiryDate?: string
  lotCode?: string
  productionDate?: string
  reason?: 'ACCOUNTING' | 'DONATION' | 'PRODUCTION' | 'CUSTOMER_RETURN'
}) {
  const { data } = await api.post('/inventory/adjust', payload)
  return data as { ok: boolean; moveId?: number }
}

/** ====================== Transferencias ====================== */
export async function transferStock(payload: {
  itemId: number
  fromWarehouseId: number
  toWarehouseId: number
  qty: number
  uom?: Uom
  note?: string
}) {
  const { data } = await api.post('/inventory/transfer', payload)
  return data as { ok:boolean; outMoveId:number; inMoveId:number; avgCost:number }
}

/** ====================== Producción (BOM → capa del terminado) ====================== */
export async function produceItem(payload: {
  /** Ítem terminado a producir */
  itemId: number
  /** Bodega donde entrará la capa del terminado y de donde saldrán los insumos */
  warehouseId: number
  /** Cantidad del terminado (en UOM visible del ítem, salvo que envíes uom explícita) */
  qty: number
  /** (Opcional) UOM en la que viene qty. Si no se envía, el backend usará displayUnit del ítem */
  uom?: Uom
  /** (Opcional) Nota / observación */
  note?: string
  /** (Opcional) Permitir consumir hojas aún si no alcanza el stock (generará saldos negativos vía movimientos) */
  allowNegative?: boolean
  /** (Opcional) Metadatos para la capa producida */
  expiryDate?: string
  lotCode?: string
  productionDate?: string
}) {
  const { data } = await api.post('/inventory/produce', payload)
  // El backend típicamente devolverá algo como { ok:true, moveInId, layerId, costAvg }
  return data as { ok:boolean; moveInId?: number; layerId?: number; costAvg?: number }
}

/** ====================== Recetas / BOM ====================== */
/** Obtener la receta (BOM) de un producto terminado */
export async function getBom(itemId: number) {
  const { data } = await api.get(`/bom/${itemId}`)

  // Normalización: backend usa otras claves (output*, componentId, qtyBasePerOut, etc.)
  const d = (data as any) ?? {}
  const componentsRaw = Array.isArray(d.components) ? d.components : []

  return {
    // outputItemId (backend) → itemId (frontend)
    itemId: Number(d.itemId ?? d.outputItemId ?? itemId),

    // outputQtyBase (backend) → yieldQty (frontend)
    yieldQty: d.yieldQty != null
      ? Number(d.yieldQty)
      : (d.outputQtyBase != null ? Number(d.outputQtyBase) : 1),

    // Unidad preferida de rendimiento; si backend no envía, default 'UN'
    yieldUom: (d.yieldUom ?? 'UN') as Uom,

    // El backend no envía merma total de la receta → default 0
    wastagePct: d.wastagePct != null ? Number(d.wastagePct) : 0,

    // Componentes
    components: componentsRaw.map((c: any) => ({
      // componentId (backend) / itemId → itemId (frontend)
      itemId: Number(c.itemId ?? c.componentId ?? 0),

      // qtyBasePerOut (backend) → qty (frontend)
      qty: Number(c.qty ?? c.qtyBasePerOut ?? 0),

      // backend puede/no mandar uom por componente; default 'UN'
      uom: (c.uom ?? 'UN') as Uom,
    })),
  }
}

/** Crear/actualizar (upsert) la receta (BOM) de un producto terminado */
export async function saveBom(payload: {
  itemId: number
  yieldQty: number
  yieldUom: Uom
  wastagePct?: number
  components: { itemId:number; qty:number; uom:Uom }[]
}) {
  const body = {
    itemId: payload.itemId,
    yieldQty: Number(payload.yieldQty),
    yieldUom: payload.yieldUom,
    wastagePct: Number(payload.wastagePct ?? 0),
    components: (payload.components || []).map(c => ({
      itemId: Number(c.itemId),
      qty: Number(c.qty),
      uom: c.uom,
    })),
  }
  const { data } = await api.post('/bom', body)
  return data as { ok: boolean }
}

/** Eliminar (soft) la receta activa de un ítem (DELETE /bom/:itemId) */
export async function deleteBom(itemId: number) {
  const { data } = await api.delete(`/bom/${itemId}`)
  return data as { ok: boolean; deactivated?: number }
}
