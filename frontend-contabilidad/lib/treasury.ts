// frontend-contabilidad/lib/treasury.ts
// Helpers de Tesorería (métodos de pago y utilidades)
// Requiere que tengas un cliente HTTP exportado como `api` (axios o similar)
import { api } from './api'

/** ===== Tipos ===== */
type ApiEnvelope<T> = { data: T } | T

export type PaymentMethod = {
  id: number
  name: string
  active: boolean
  accountName?: string | null
  accountNumber?: string | null
  cashAccountCode?: string | null
  bankAccountCode?: string | null
  createdAt?: string
  updatedAt?: string
}

export type PaymentMethodBalance = {
  methodId: number
  methodName: string
  accountCode: string
  from: string
  to: string
  debit: number
  credit: number
  balance: number
}

export type TransferResponse = {
  ok: boolean
  moveOutId?: number
  moveInId?: number
}

export interface PaymentMethodPayload {
  name: string
  accountName?: string | null
  accountNumber?: string | null
  cashAccountCode?: string | null
  bankAccountCode?: string | null
  active?: boolean
}

export interface TransferPayload {
  fromMethodId: number
  toMethodId: number
  amount: number
  note?: string
  date?: string
}

function unwrap<T>(res: ApiEnvelope<T>): T {
  return (res as any)?.data ?? (res as T)
}

function num(value: any, fallback = 0): number {
  if (value == null || value === '') return fallback
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeMethod(raw: any): PaymentMethod {
  return {
    id: num(raw?.id),
    name: String(raw?.name ?? ''),
    active: Boolean(raw?.active ?? true),
    accountName: raw?.accountName ?? null,
    accountNumber: raw?.accountNumber ?? null,
    cashAccountCode: raw?.cashAccountCode ?? null,
    bankAccountCode: raw?.bankAccountCode ?? null,
    createdAt: raw?.createdAt ?? undefined,
    updatedAt: raw?.updatedAt ?? undefined,
  }
}

function sanitizeNullable(value?: string | null) {
  if (value === undefined) return undefined
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function buildMethodPayload(payload: PaymentMethodPayload) {
  return {
    name: payload.name?.trim(),
    accountName: sanitizeNullable(payload.accountName ?? null),
    accountNumber: sanitizeNullable(payload.accountNumber ?? null),
    cashAccountCode: sanitizeNullable(payload.cashAccountCode ?? null),
    bankAccountCode: sanitizeNullable(payload.bankAccountCode ?? null),
    active: payload.active ?? true,
  }
}

export async function listPaymentMethods(params?: { active?: boolean }, signal?: AbortSignal) {
  const { data } = await api.get<ApiEnvelope<any[]>>('/treasury/methods', {
    params: params?.active === undefined ? undefined : { active: params.active ? '1' : '0' },
    signal,
  })
  const rows = unwrap(data)
  return Array.isArray(rows) ? rows.map(normalizeMethod) : []
}

export async function createPaymentMethod(payload: PaymentMethodPayload) {
  const body = buildMethodPayload(payload)
  if (!body.name) throw new Error('El nombre del método de pago es obligatorio.')
  const { data } = await api.post<ApiEnvelope<any>>('/treasury/methods', body)
  return normalizeMethod(unwrap(data))
}

export async function getPaymentMethod(id: number, signal?: AbortSignal) {
  const { data } = await api.get<ApiEnvelope<any>>(`/treasury/methods/${id}`, { signal })
  return normalizeMethod(unwrap(data))
}

export async function updatePaymentMethod(id: number, patch: Partial<PaymentMethodPayload>) {
  const base = buildMethodPayload({ name: patch.name ?? '', ...patch })
  const body: Record<string, unknown> = {}
  if (patch.name !== undefined) body.name = base.name
  if (patch.accountName !== undefined) body.accountName = base.accountName
  if (patch.accountNumber !== undefined) body.accountNumber = base.accountNumber
  if (patch.cashAccountCode !== undefined) body.cashAccountCode = base.cashAccountCode
  if (patch.bankAccountCode !== undefined) body.bankAccountCode = base.bankAccountCode
  if (patch.active !== undefined) body.active = base.active

  if (Object.keys(body).length === 0) throw new Error('No hay cambios para actualizar.')

  const { data } = await api.patch<ApiEnvelope<any>>(`/treasury/methods/${id}`, body)
  return normalizeMethod(unwrap(data))
}

export async function setPaymentMethodActive(id: number, active: boolean) {
  const { data } = await api.patch<ApiEnvelope<any>>(`/treasury/methods/${id}`, { active })
  return normalizeMethod(unwrap(data))
}

export async function deletePaymentMethod(id: number) {
  await api.delete(`/treasury/methods/${id}`)
}

export async function getPaymentMethodBalance(id: number, options?: { from?: string; to?: string }, signal?: AbortSignal) {
  const { data } = await api.get<ApiEnvelope<any>>(`/treasury/methods/${id}/balance`, {
    params: { from: options?.from, to: options?.to },
    signal,
  })
  const payload = unwrap(data)
  return {
    methodId: num(payload?.methodId ?? id),
    methodName: payload?.methodName ?? '',
    accountCode: payload?.accountCode ?? '',
    from: payload?.from ?? '',
    to: payload?.to ?? '',
    debit: num(payload?.debit),
    credit: num(payload?.credit),
    balance: num(payload?.balance),
  } as PaymentMethodBalance
}

export async function postPaymentMethodMovement(id: number, payload: { amount: number; note?: string; direction: 'IN' | 'OUT'; date?: string }) {
  const body = {
    amount: Number(payload.amount),
    note: payload.note?.trim() || undefined,
    direction: payload.direction,
    date: payload.date,
  }
  const { data } = await api.post<ApiEnvelope<any>>(`/treasury/methods/${id}`, body)
  return unwrap(data)
}

export async function transferBetweenMethods(payload: TransferPayload) {
  const body = {
    fromMethodId: Number(payload.fromMethodId),
    toMethodId: Number(payload.toMethodId),
    amount: Number(payload.amount),
    note: payload.note?.trim() || undefined,
    date: payload.date,
  }
  const { data } = await api.post<ApiEnvelope<any>>('/treasury/transfer', body)
  const res = unwrap(data)
  return {
    ok: Boolean(res?.ok ?? true),
    moveOutId: res?.moveOutId != null ? num(res.moveOutId) : undefined,
    moveInId: res?.moveInId != null ? num(res.moveInId) : undefined,
  } as TransferResponse
}

export function toSelectOptions(methods: PaymentMethod[]) {
  return methods.map((m) => ({ value: String(m.id), label: m.name, active: m.active }))
}

export function findMethod(methods: PaymentMethod[], id?: number) {
  return typeof id === 'number' ? methods.find((m) => m.id === id) : undefined
}

export function formatCOP(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value || 0)
}
