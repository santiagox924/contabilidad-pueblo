// lib/withholdings.ts
// Cliente para reglas y cálculos de retenciones (RTF, RIVA, RICA)

import { api } from '@/lib/api'

export type WithholdingType = 'RTF' | 'RIVA' | 'RICA'
export type RuleScope = 'SALES' | 'PURCHASES' | 'BOTH'

export interface WithholdingRule {
  id: number
  type: WithholdingType
  scope: RuleScope
  ratePct: number
  minBase: number | null
  fixedAmount: number | null
  ciiuCode: string | null
  municipalityCode: string | null
  onlyForAgents: boolean
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export interface WithholdingRuleFilters {
  active?: boolean
  scope?: RuleScope
  type?: WithholdingType
}

export interface CreateWithholdingRuleInput {
  type: WithholdingType
  scope?: RuleScope
  ratePct?: number | null
  minBase?: number | null
  fixedAmount?: number | null
  ciiuCode?: string | null
  municipalityCode?: string | null
  onlyForAgents?: boolean
  active?: boolean
}

export interface UpdateWithholdingRuleInput {
  type?: WithholdingType
  scope?: RuleScope
  ratePct?: number | null
  minBase?: number | null
  fixedAmount?: number | null
  ciiuCode?: string | null
  municipalityCode?: string | null
  onlyForAgents?: boolean
  active?: boolean
}

export interface WithholdingThirdPartyRef {
  id?: number
  isWithholdingAgent?: boolean
  ciiuCode?: string | null
  municipalityCode?: string | null
}

export interface WithholdingCalcLineInput {
  base: number
  vatAmount?: number
  type?: WithholdingType
  scope: RuleScope
  thirdParty?: WithholdingThirdPartyRef
}

export interface WithholdingCalcInvoiceLineInput extends Omit<WithholdingCalcLineInput, 'scope'> {
  scope?: RuleScope
}

export interface WithholdingCalcLineResult {
  type: WithholdingType
  ruleId: number | null
  base: number
  ratePct: number | null
  amount: number
}

export interface WithholdingCalcInvoiceInput {
  scope: RuleScope
  thirdParty?: WithholdingThirdPartyRef
  lines: WithholdingCalcInvoiceLineInput[]
}

export interface WithholdingCalcInvoiceResult {
  lines: WithholdingCalcLineResult[][]
  totalsByType: Record<WithholdingType, number>
  total: number
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

function asNumber(value: any, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`El valor de ${field} es inválido.`)
  }
  return parsed
}

function normalizeStringOrNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function toRule(raw: any): WithholdingRule {
  return {
    id: num(raw?.id),
    type: (raw?.type as WithholdingType) ?? 'RTF',
    scope: (raw?.scope as RuleScope) ?? 'BOTH',
    ratePct: num(raw?.ratePct),
    minBase: raw?.minBase == null ? null : num(raw?.minBase),
    fixedAmount: raw?.fixedAmount == null ? null : num(raw?.fixedAmount),
    ciiuCode: raw?.ciiuCode ?? null,
    municipalityCode: raw?.municipalityCode ?? null,
    onlyForAgents: Boolean(raw?.onlyForAgents),
    active: Boolean(raw?.active ?? true),
    createdAt: raw?.createdAt ?? undefined,
    updatedAt: raw?.updatedAt ?? undefined,
  }
}

function toCalcLineResult(raw: any): WithholdingCalcLineResult {
  return {
    type: (raw?.type as WithholdingType) ?? 'RTF',
    ruleId: raw?.ruleId == null ? null : num(raw?.ruleId),
    base: num(raw?.base),
    ratePct: raw?.ratePct == null ? null : num(raw?.ratePct),
    amount: num(raw?.amount),
  }
}

function toThirdPartyPayload(thirdParty?: WithholdingThirdPartyRef) {
  if (!thirdParty) return undefined
  const payload: Record<string, unknown> = {}
  if (thirdParty.id !== undefined) payload.id = thirdParty.id
  if (thirdParty.isWithholdingAgent !== undefined) payload.isWithholdingAgent = thirdParty.isWithholdingAgent
  const ciiu = normalizeStringOrNull(thirdParty.ciiuCode)
  if (ciiu !== undefined) payload.ciiuCode = ciiu
  const municipality = normalizeStringOrNull(thirdParty.municipalityCode)
  if (municipality !== undefined) payload.municipalityCode = municipality
  return Object.keys(payload).length ? payload : undefined
}

function normalizeInvoiceResult(raw: any): WithholdingCalcInvoiceResult {
  const lineGroups = Array.isArray(raw?.lines) ? raw.lines : arr(raw?.lines)
  const normalizedLines = lineGroups.map((group: any) => arr(group).map(toCalcLineResult))
  const totals = raw?.totalsByType ?? {}
  return {
    lines: normalizedLines,
    totalsByType: {
      RTF: num(totals.RTF),
      RIVA: num(totals.RIVA),
      RICA: num(totals.RICA),
    },
    total: num(raw?.total),
  }
}

function prepareRulePayload(input: CreateWithholdingRuleInput | UpdateWithholdingRuleInput, includeDefaults = false) {
  const body: Record<string, unknown> = {}
  if (includeDefaults || input.type !== undefined) body.type = input.type
  if (includeDefaults || input.scope !== undefined) body.scope = input.scope ?? 'BOTH'

  if (input.ratePct !== undefined) {
    body.ratePct = input.ratePct === null ? null : asNumber(input.ratePct, 'ratePct')
  }
  if (input.minBase !== undefined) {
    body.minBase = input.minBase === null ? null : asNumber(input.minBase, 'minBase')
  }
  if (input.fixedAmount !== undefined) {
    body.fixedAmount = input.fixedAmount === null ? null : asNumber(input.fixedAmount, 'fixedAmount')
  }

  const ciiu = normalizeStringOrNull(input.ciiuCode)
  if (ciiu !== undefined) body.ciiuCode = ciiu
  const municipality = normalizeStringOrNull(input.municipalityCode)
  if (municipality !== undefined) body.municipalityCode = municipality

  if (input.onlyForAgents !== undefined) body.onlyForAgents = Boolean(input.onlyForAgents)
  if (input.active !== undefined) body.active = Boolean(input.active)

  return body
}

export async function listWithholdingRules(filters?: WithholdingRuleFilters, signal?: AbortSignal) {
  const { data } = await api.get('/withholdings/rules', {
    params: {
      active: filters?.active,
      scope: filters?.scope,
      type: filters?.type,
    },
    signal,
  })
  return arr(data).map(toRule)
}

export async function getWithholdingRule(id: number, signal?: AbortSignal) {
  const { data } = await api.get(`/withholdings/rules/${id}`, { signal })
  return toRule(data)
}

export async function createWithholdingRule(input: CreateWithholdingRuleInput) {
  if (!input?.type) throw new Error('El tipo de retención es obligatorio.')
  const hasRate = input.ratePct != null && input.ratePct !== undefined
  const hasFixed = input.fixedAmount != null && input.fixedAmount !== undefined
  if (!hasRate && !hasFixed) {
    throw new Error('Debes enviar una tasa porcentual o un valor fijo para la retención.')
  }

  const body = prepareRulePayload(input, true)
  const { data } = await api.post('/withholdings/rules', body)
  return toRule(data)
}

export async function updateWithholdingRule(id: number, input: UpdateWithholdingRuleInput) {
  const body = prepareRulePayload(input, false)
  if (Object.keys(body).length === 0) {
    throw new Error('No hay cambios para actualizar.')
  }
  const { data } = await api.patch(`/withholdings/rules/${id}`, body)
  return toRule(data)
}

export async function deleteWithholdingRule(id: number) {
  await api.delete(`/withholdings/rules/${id}`)
}

export async function calcWithholdingLine(input: WithholdingCalcLineInput) {
  const { data } = await api.post('/withholdings/calc-line', {
    base: input.base,
    vatAmount: input.vatAmount ?? undefined,
    type: input.type ?? undefined,
    scope: input.scope,
    thirdParty: toThirdPartyPayload(input.thirdParty),
  })
  return arr(data).map(toCalcLineResult)
}

export async function calcWithholdingInvoice(input: WithholdingCalcInvoiceInput) {
  const { data } = await api.post('/withholdings/calc-invoice', {
    scope: input.scope,
    thirdParty: toThirdPartyPayload(input.thirdParty),
    lines: (input.lines || []).map((line) => ({
      base: line.base,
      vatAmount: line.vatAmount ?? undefined,
      type: line.type ?? undefined,
      scope: line.scope ?? undefined,
      thirdParty: toThirdPartyPayload(line.thirdParty),
    })),
  })
  return normalizeInvoiceResult(data)
}
