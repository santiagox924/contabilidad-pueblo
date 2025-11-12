// lib/taxes.ts
// Cliente para impuestos (IVA, retenciones, etc.)

import { api } from '@/lib/api'

export type TaxKind = 'VAT' | 'OTHER'

export interface Tax {
  id: number
  code: string
  name: string
  kind: TaxKind
  ratePct: number
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export interface CreateTaxInput {
  code: string
  name: string
  ratePct: number
  kind?: TaxKind
  active?: boolean
}

export interface UpdateTaxInput {
  code?: string
  name?: string
  ratePct?: number
  kind?: TaxKind
  active?: boolean
}

export interface CalcLineInput {
  taxId?: number | null
  ratePct?: number | null
  lineSubtotal: number
  included?: boolean
}

export interface CalcLineOutput {
  taxId?: number | null
  base: number
  ratePct: number
  amount: number
  included: boolean
}

export interface CalcInvoiceInput {
  lines: CalcLineInput[]
}

export interface CalcInvoiceOutput {
  taxes: CalcLineOutput[]
  baseTotal: number
  amountTotal: number
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

function toTax(raw: any): Tax {
  return {
    id: num(raw?.id),
    code: String(raw?.code ?? ''),
    name: String(raw?.name ?? ''),
    kind: (raw?.kind as TaxKind) ?? 'VAT',
    ratePct: num(raw?.ratePct),
    active: Boolean(raw?.active ?? true),
    createdAt: raw?.createdAt ?? undefined,
    updatedAt: raw?.updatedAt ?? undefined,
  }
}

export async function listTaxes(params?: { active?: boolean; kind?: TaxKind }, signal?: AbortSignal) {
  const { data } = await api.get('/taxes', {
    params: {
      active: params?.active,
      kind: params?.kind,
    },
    signal,
  })
  return arr(data).map(toTax)
}

export async function getTax(id: number, signal?: AbortSignal) {
  const { data } = await api.get(`/taxes/${id}`, { signal })
  return toTax(data)
}

export async function createTax(input: CreateTaxInput) {
  const payload = {
    code: input.code?.trim(),
    name: input.name?.trim(),
    ratePct: input.ratePct,
    kind: input.kind ?? 'VAT',
    active: input.active ?? true,
  }
  if (!payload.code) throw new Error('El código del impuesto es obligatorio.')
  if (!payload.name) throw new Error('El nombre del impuesto es obligatorio.')

  const { data } = await api.post('/taxes', payload)
  return toTax(data)
}

export async function updateTax(id: number, input: UpdateTaxInput) {
  const payload: Record<string, unknown> = {}
  if (input.code !== undefined) payload.code = input.code.trim()
  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.ratePct !== undefined) payload.ratePct = input.ratePct
  if (input.kind !== undefined) payload.kind = input.kind
  if (input.active !== undefined) payload.active = input.active

  if (Object.keys(payload).length === 0) throw new Error('No hay cambios para actualizar.')

  const { data } = await api.patch(`/taxes/${id}`, payload)
  return toTax(data)
}

export async function deleteTax(id: number) {
  await api.delete(`/taxes/${id}`)
}

export async function calcTaxLine(input: CalcLineInput) {
  const { data } = await api.post('/taxes/calc-line', {
    taxId: input.taxId ?? undefined,
    ratePct: input.ratePct ?? undefined,
    lineSubtotal: input.lineSubtotal,
    included: input.included,
  })
  return normalizeCalcLine(data)
}

export async function calcTaxInvoice(input: CalcInvoiceInput) {
  const { data } = await api.post('/taxes/calc-invoice', {
    lines: input.lines.map((line) => ({
      taxId: line.taxId ?? undefined,
      ratePct: line.ratePct ?? undefined,
      lineSubtotal: line.lineSubtotal,
      included: line.included,
    })),
  })
  return normalizeCalcInvoice(data)
}

function normalizeCalcLine(raw: any): CalcLineOutput {
  return {
    taxId: raw?.taxId ?? null,
    base: num(raw?.base),
    ratePct: num(raw?.ratePct),
    amount: num(raw?.amount),
    included: Boolean(raw?.included),
  }
}

function normalizeCalcInvoice(raw: any): CalcInvoiceOutput {
  return {
    taxes: arr(raw?.taxes).map(normalizeCalcLine),
    baseTotal: num(raw?.baseTotal),
    amountTotal: num(raw?.amountTotal),
  }
}
