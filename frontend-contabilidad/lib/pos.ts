// lib/pos.ts
// Cliente para endpoints de Punto de Venta (POS)

import { api } from '@/lib/api'

type CashSessionStatus = 'OPEN' | 'CLOSED'
type CashMovementKind = 'CASH_IN' | 'CASH_OUT' | 'REFUND'

export interface PosRegister {
  id: number
  name: string
  location: string | null
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export interface PosMovement {
  id: number
  sessionId: number
  kind: CashMovementKind
  amount: number
  createdAt?: string
  refType?: string | null
  refId?: number | null
}

export interface PosCount {
  id: number
  sessionId: number
  denom: string
  qty: number
  amount: number
  createdAt?: string
}

export interface PosUserSummary {
  id: number
  email?: string | null
  name?: string | null
}

export interface PosSession {
  id: number
  registerId: number
  userId: number
  openedAt?: string
  closedAt?: string | null
  openingAmount: number
  expectedClose: number
  countedClose: number | null
  status: CashSessionStatus
  note?: string | null
  register?: PosRegister | null
  user?: PosUserSummary | null
  movements?: PosMovement[]
  counts?: PosCount[]
}

export interface OpenSessionInput {
  registerId: number
  userId: number
  openingAmount: number
  note?: string
}

export interface CloseSessionInput {
  note?: string
  counts: Array<{ denom: string | number; qty: number }>
  countedClose?: number
}

export interface CreateRegisterInput {
  name: string
  location?: string | null
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

function bool(value: any, fallback = false): boolean {
  if (value === undefined || value === null) return fallback
  return Boolean(value)
}

function toRegister(raw: any): PosRegister {
  return {
    id: num(raw?.id),
    name: String(raw?.name ?? ''),
    location: raw?.location ?? null,
    active: bool(raw?.active, true),
    createdAt: raw?.createdAt ?? undefined,
    updatedAt: raw?.updatedAt ?? undefined,
  }
}

function toMovement(raw: any): PosMovement {
  return {
    id: num(raw?.id),
    sessionId: num(raw?.sessionId),
    kind: (raw?.kind as CashMovementKind) ?? 'CASH_IN',
    amount: num(raw?.amount),
    createdAt: raw?.createdAt ?? undefined,
    refType: raw?.refType ?? null,
    refId: raw?.refId == null ? null : num(raw?.refId),
  }
}

function toCount(raw: any): PosCount {
  return {
    id: num(raw?.id),
    sessionId: num(raw?.sessionId),
    denom: String(raw?.denom ?? '0'),
    qty: num(raw?.qty),
    amount: num(raw?.amount),
    createdAt: raw?.createdAt ?? undefined,
  }
}

function toUser(raw: any): PosUserSummary {
  return {
    id: num(raw?.id),
    email: raw?.email ?? null,
    name: raw?.name ?? null,
  }
}

function toSession(raw: any): PosSession {
  return {
    id: num(raw?.id),
    registerId: num(raw?.registerId),
    userId: num(raw?.userId),
    openedAt: raw?.openedAt ?? undefined,
    closedAt: raw?.closedAt ?? null,
    openingAmount: num(raw?.openingAmount),
    expectedClose: num(raw?.expectedClose),
    countedClose: raw?.countedClose == null ? null : num(raw?.countedClose),
    status: (raw?.status as CashSessionStatus) ?? 'OPEN',
    note: raw?.note ?? null,
    register: raw?.register ? toRegister(raw.register) : null,
    user: raw?.user ? toUser(raw.user) : null,
    movements: arr(raw?.movements).map(toMovement),
    counts: arr(raw?.counts).map(toCount),
  }
}

function sanitizeLocation(location?: string | null) {
  if (location === undefined) return undefined
  if (location === null) return null
  const trimmed = location.trim()
  return trimmed === '' ? null : trimmed
}

function normalizeCountsInput(counts: Array<{ denom: string | number; qty: number }>) {
  return counts.map((row) => ({
    denom: String(row.denom),
    qty: num(row.qty),
  }))
}

export async function listPosRegisters() {
  const { data } = await api.get('/pos/registers')
  return arr(data).map(toRegister)
}

export async function createPosRegister(input: CreateRegisterInput) {
  const name = input.name?.trim()
  if (!name) throw new Error('El nombre de la caja es obligatorio.')
  const payload = {
    name,
    location: sanitizeLocation(input.location),
  }
  const { data } = await api.post('/pos/registers', payload)
  return toRegister(data)
}

export async function openPosSession(input: OpenSessionInput) {
  const payload = {
    registerId: num(input.registerId),
    userId: num(input.userId),
    openingAmount: num(input.openingAmount),
    note: input.note?.trim() || undefined,
  }
  const { data } = await api.post('/pos/sessions/open', payload)
  return toSession(data)
}

export async function getActivePosSession(params: { registerId: number; userId: number }, signal?: AbortSignal) {
  const { data } = await api.get('/pos/sessions/active', {
    params: {
      registerId: num(params.registerId),
      userId: num(params.userId),
    },
    signal,
  })
  if (!data) return null
  return toSession(data)
}

export async function closePosSession(sessionId: number, input: CloseSessionInput) {
  const counts = normalizeCountsInput(input.counts || [])
  const counted =
    input.countedClose !== undefined
      ? num(input.countedClose)
      : counts.reduce((sum, row) => sum + Number(row.denom) * Number(row.qty || 0), 0)

  const payload = {
    note: input.note?.trim() || undefined,
    countedClose: counted,
    counts,
  }

  const { data } = await api.patch(`/pos/sessions/${sessionId}/close`, payload)
  return toSession(data)
}

export async function closePosSessionViaPost(sessionId: number, input: CloseSessionInput) {
  // Algunos clientes históricos llaman POST /pos/sessions/:id/close.
  // Si el backend solo soporta PATCH, se reutiliza closePosSession.
  return closePosSession(sessionId, input)
}
