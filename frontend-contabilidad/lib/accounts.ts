// lib/accounts.ts
// Cliente ligero para Plan de Cuentas (CoA)

import { api } from '@/lib/api'

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
export type AccountClass = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'
export type AccountNature = 'D' | 'C'
export type FlowType = 'NONE' | 'AR' | 'AP'
export type TaxProfile = 'NA' | 'IVA_RESPONSABLE' | 'EXENTO' | 'EXCLUIDO'

export interface Account {
  id: number
  code: string
  name: string
  type: AccountType
  parentCode: string | null
  level: number
  nature: AccountNature
  class: AccountClass
  current: boolean
  reconcilable: boolean
  isBank: boolean
  isCash: boolean
  isDetailed: boolean
  requiresThirdParty: boolean
  requiresCostCenter: boolean
  flowType: FlowType
  taxProfile: TaxProfile
  vatRate: number | null
  isActive?: boolean
}

export interface CreateAccountInput {
  code: string
  name: string
  type: AccountType
  parentCode?: string | null
  nature?: AccountNature
  class?: AccountClass
  current?: boolean
  reconcilable?: boolean
  isBank?: boolean
  isCash?: boolean
  isDetailed?: boolean
  requiresThirdParty?: boolean
  requiresCostCenter?: boolean
  flowType?: FlowType
  taxProfile?: TaxProfile
  vatRate?: number | null
}

export interface UpdateAccountInput extends Partial<CreateAccountInput> {
  code?: string
  name?: string
}

type ApiEnvelope<T> = T | { data: T }

function unwrap<T>(payload: ApiEnvelope<T>): T {
  if (payload && typeof payload === 'object' && 'data' in payload && (payload as any).data !== undefined) {
    return (payload as any).data as T
  }
  return payload as T
}

function assignIfDefined(target: Record<string, unknown>, key: string, value: unknown) {
  if (value !== undefined) {
    target[key] = value
  }
}

function mapClassToType(cls: AccountClass | undefined): AccountType {
  switch (cls) {
    case 'ASSET':
      return 'ASSET'
    case 'LIABILITY':
      return 'LIABILITY'
    case 'EQUITY':
      return 'EQUITY'
    case 'INCOME':
      return 'REVENUE'
    case 'EXPENSE':
      return 'EXPENSE'
    default:
      return 'ASSET'
  }
}

function mapTypeToClass(type: AccountType): AccountClass {
  switch (type) {
    case 'ASSET':
      return 'ASSET'
    case 'LIABILITY':
      return 'LIABILITY'
    case 'EQUITY':
      return 'EQUITY'
    case 'REVENUE':
      return 'INCOME'
    case 'EXPENSE':
      return 'EXPENSE'
  }
}

function inferNatureFromType(type: AccountType): AccountNature {
  return type === 'ASSET' || type === 'EXPENSE' ? 'D' : 'C'
}

function normalizeAccount(raw: any): Account {
  const inferredType = (raw.type as AccountType) || 'ASSET'
  const accountClass: AccountClass = (raw.class as AccountClass) || mapTypeToClass(inferredType)
  const type = mapClassToType(accountClass)
  const nature = (raw.nature as AccountNature) || inferNatureFromType(type)

  return {
    id: Number(raw.id ?? 0),
    code: String(raw.code ?? ''),
    name: String(raw.name ?? ''),
    type,
    parentCode: raw.parentCode ?? null,
    level: inferLevelFromCode(String(raw.code ?? '')),
    nature,
    class: accountClass,
  isActive: raw.isActive === undefined ? true : Boolean(raw.isActive),
    current: Boolean(raw.current ?? false),
    reconcilable: Boolean(raw.reconcilable ?? false),
    isBank: Boolean(raw.isBank ?? false),
    isCash: Boolean(raw.isCash ?? false),
    isDetailed: raw.isDetailed === undefined ? true : Boolean(raw.isDetailed),
    requiresThirdParty: Boolean(raw.requiresThirdParty ?? false),
    requiresCostCenter: Boolean(raw.requiresCostCenter ?? false),
    flowType: (raw.flowType as FlowType) || 'NONE',
    taxProfile: (raw.taxProfile as TaxProfile) || 'NA',
    vatRate: raw.vatRate === null || raw.vatRate === undefined ? null : Number(raw.vatRate),
  }
}

function sanitizeParentCode(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function prepareCreatePayload(input: CreateAccountInput) {
  const trimmedCode = input.code?.trim()
  const trimmedName = input.name?.trim()
  if (!trimmedCode) throw new Error('El código es obligatorio.')
  if (!trimmedName) throw new Error('El nombre es obligatorio.')

  const accountClass = input.class ?? mapTypeToClass(input.type)
  const nature = input.nature ?? inferNatureFromType(input.type)

  const payload: Record<string, unknown> = {
    code: trimmedCode,
    name: trimmedName,
    class: accountClass,
    nature,
    parentCode: sanitizeParentCode(input.parentCode ?? null),
  }

  assignIfDefined(payload, 'current', input.current)
  assignIfDefined(payload, 'reconcilable', input.isBank ? true : input.reconcilable)
  assignIfDefined(payload, 'isBank', input.isBank)
  assignIfDefined(payload, 'isCash', input.isBank ? false : input.isCash)
  assignIfDefined(payload, 'isDetailed', input.isDetailed)
  assignIfDefined(payload, 'requiresThirdParty', input.requiresThirdParty)
  assignIfDefined(payload, 'requiresCostCenter', input.requiresCostCenter)
  assignIfDefined(payload, 'flowType', input.flowType)
  assignIfDefined(payload, 'taxProfile', input.taxProfile)
  const vatCreate = input.vatRate === undefined ? undefined : input.vatRate ?? null
  assignIfDefined(payload, 'vatRate', vatCreate)

  return payload
}

function prepareUpdatePayload(input: UpdateAccountInput) {
  const payload: Record<string, unknown> = {}

  if (input.code !== undefined) payload.code = input.code.trim()
  if (input.name !== undefined) payload.name = input.name.trim()

  if (input.type) {
    payload.class = mapTypeToClass(input.type)
    payload.nature = input.nature ?? inferNatureFromType(input.type)
  } else {
    assignIfDefined(payload, 'class', input.class)
    assignIfDefined(payload, 'nature', input.nature)
  }

  if (input.parentCode !== undefined) {
    assignIfDefined(payload, 'parentCode', sanitizeParentCode(input.parentCode))
  }
  assignIfDefined(payload, 'current', input.current)
  assignIfDefined(payload, 'reconcilable', input.reconcilable)
  assignIfDefined(payload, 'isBank', input.isBank)
  assignIfDefined(payload, 'isCash', input.isCash)
  assignIfDefined(payload, 'isDetailed', input.isDetailed)
  assignIfDefined(payload, 'requiresThirdParty', input.requiresThirdParty)
  assignIfDefined(payload, 'requiresCostCenter', input.requiresCostCenter)
  assignIfDefined(payload, 'flowType', input.flowType)
  assignIfDefined(payload, 'taxProfile', input.taxProfile)
  const vatUpdate = input.vatRate === undefined ? undefined : input.vatRate ?? null
  assignIfDefined(payload, 'vatRate', vatUpdate)

  return payload
}

function sortAccountsByCode<T extends { code: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
}

export async function listAccounts(signal?: AbortSignal): Promise<Account[]> {
  const { data } = await api.get<ApiEnvelope<any[]>>('/accounts', { signal })
  const rows = unwrap(data)
  return sortAccountsByCode(rows.map(normalizeAccount))
}

export async function getAccount(id: number | string): Promise<Account> {
  const { data } = await api.get<ApiEnvelope<any>>(`/accounts/${id}`)
  return normalizeAccount(unwrap(data))
}

export async function createAccount(input: CreateAccountInput): Promise<Account> {
  const body = prepareCreatePayload(input)
  const { data } = await api.post<ApiEnvelope<any>>('/accounts', body)
  return normalizeAccount(unwrap(data))
}

export async function updateAccount(id: number | string, input: UpdateAccountInput): Promise<Account> {
  const body = prepareUpdatePayload(input)
  if (Object.keys(body).length === 0) {
    throw new Error('No hay cambios para actualizar.')
  }
  const { data } = await api.patch<ApiEnvelope<any>>(`/accounts/${id}`, body)
  return normalizeAccount(unwrap(data))
}

export async function deleteAccount(id: number | string): Promise<Account> {
  const { data } = await api.delete<ApiEnvelope<any>>(`/accounts/${id}`)
  return normalizeAccount(unwrap(data))
}

export function inferLevelFromCode(code: string): number {
  if (!code) return 0
  return code.split('.').filter(Boolean).length
}

export function inferParentFromCode(code: string): string | null {
  if (!code) return null
  const parts = code.split('.').filter(Boolean)
  if (parts.length <= 1) return null
  return parts.slice(0, -1).join('.')
}
