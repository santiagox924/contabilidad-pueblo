// lib/purchases.ts
// Cliente para facturas de compra

import { api } from '@/lib/api'
import { type Uom } from '@/lib/uom'

export type PurchaseStatus = 'DRAFT' | 'POSTED' | 'VOID'

export interface PurchaseLineInput {
  itemId: number
  qty: number
  unitCost: number
  warehouseId?: number
  uom?: Uom | string
  vatPct?: number
  priceIncludesTax?: boolean
  discountPct?: number
  note?: string | null
  withholdings?: Array<{ type: 'RTF' | 'RIVA' | 'RICA'; rate?: number; amount?: number }>
}

export interface CreatePurchaseInput {
  thirdPartyId: number
  issueDate?: string
  dueDate?: string | null
  paymentType: 'CASH' | 'CREDIT'
  creditPlan?: {
    installments: number
    frequency: 'MONTHLY' | 'BIWEEKLY'
    firstDueDate?: string
  }
  number?: number
  note?: string | null
  lines: PurchaseLineInput[]
}

export interface PurchaseInvoiceSummary {
  id: number
  number: number
  issueDate: string
  dueDate?: string | null
  thirdParty?: {
    id: number
    name: string
    document: string | null
  }
  subtotal: number
  tax: number
  total: number
  status?: PurchaseStatus
}

export interface PurchaseInvoiceDetail extends PurchaseInvoiceSummary {
  paymentType?: 'CASH' | 'CREDIT'
  note?: string | null
  lines: Array<{
    id: number
    itemId: number
    qty: number
    unitCost: number
    vatPct: number
    lineSubtotal: number
    lineVat: number
    lineTotal: number
    item?: {
      id: number
      name: string
      sku?: string
      displayUnit?: string
    }
  }>
  withholdings?: Array<{
    id: number
    type: 'RTF' | 'RIVA' | 'RICA'
    base: number
    amount: number
    lineId?: number | null
  }>
}

export interface AllowedPurchaseUomsResponse {
  itemId: number
  unitKind: string
  units: string[]
}

function arr<T = any>(value: any): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value && Array.isArray(value.items)) return value.items as T[]
  if (value && Array.isArray(value.data)) return value.data as T[]
  return []
}

function num(value: any, fallback = 0): number {
  if (value == null || value === '') return fallback
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toSummary(raw: any): PurchaseInvoiceSummary {
  return {
    id: num(raw?.id),
    number: num(raw?.number),
    issueDate: raw?.issueDate ?? '',
    dueDate: raw?.dueDate ?? null,
    thirdParty: raw?.thirdParty
      ? {
          id: num(raw.thirdParty.id),
          name: String(raw.thirdParty.name ?? ''),
          document: raw.thirdParty.document ?? null,
        }
      : undefined,
    subtotal: num(raw?.subtotal),
    tax: num(raw?.tax),
    total: num(raw?.total),
    status: raw?.status,
  }
}

function toDetail(raw: any): PurchaseInvoiceDetail {
  return {
    ...toSummary(raw),
    paymentType: raw?.paymentType,
    note: raw?.note ?? null,
    lines: arr(raw?.lines).map((line) => ({
      id: num(line?.id),
      itemId: num(line?.itemId),
      qty: num(line?.qty),
      unitCost: num(line?.unitCost),
      vatPct: num(line?.vatPct),
      lineSubtotal: num(line?.lineSubtotal),
      lineVat: num(line?.lineVat),
      lineTotal: num(line?.lineTotal),
      item: line?.item
        ? {
            id: num(line.item.id),
            name: String(line.item.name ?? ''),
            sku: line.item.sku ?? null,
            displayUnit: line.item.displayUnit ?? line.item.unit ?? undefined,
          }
        : undefined,
    })),
    withholdings: arr(raw?.withholdings).map((row) => ({
      id: num(row?.id),
      type: row?.type,
      base: num(row?.base),
      amount: num(row?.amount),
      lineId: row?.lineId == null ? null : num(row?.lineId),
    })),
  }
}

export async function listPurchases(params?: { q?: string; from?: string; to?: string }, signal?: AbortSignal) {
  const { data } = await api.get('/purchases', {
    params: {
      q: params?.q,
      from: params?.from,
      to: params?.to,
    },
    signal,
  })
  return arr(data).map(toSummary)
}

export async function getPurchase(id: number, signal?: AbortSignal) {
  const { data } = await api.get(`/purchases/${id}`, { signal })
  return toDetail(data)
}

export async function getAllowedPurchaseUoms(itemId: number) {
  const { data } = await api.get(`/purchases/uoms/allowed/${itemId}`)
  const units = Array.isArray(data?.units) ? data.units : arr(data)
  return {
    itemId: num(data?.itemId ?? itemId),
    unitKind: data?.unitKind ?? '',
    units: units.map((u: any) => String(u)),
  } as AllowedPurchaseUomsResponse
}

export async function createPurchase(payload: CreatePurchaseInput) {
  const body = {
    thirdPartyId: payload.thirdPartyId,
    issueDate: payload.issueDate,
    dueDate: payload.dueDate ?? null,
    paymentType: payload.paymentType,
    creditPlan: payload.creditPlan,
    number: payload.number,
    note: payload.note ?? undefined,
    lines: (payload.lines || []).map((line) => ({
      itemId: line.itemId,
      qty: line.qty,
      unitCost: line.unitCost,
      warehouseId: line.warehouseId,
      uom: line.uom,
      vatPct: line.vatPct,
      priceIncludesTax: line.priceIncludesTax,
      discountPct: line.discountPct,
      note: line.note ?? undefined,
      withholdings: line.withholdings,
    })),
  }
  const { data } = await api.post('/purchases', body)
  return toDetail(data)
}

export async function postPurchase(id: number) {
  const { data } = await api.post(`/purchases/${id}/post`, {})
  return toDetail(data)
}
