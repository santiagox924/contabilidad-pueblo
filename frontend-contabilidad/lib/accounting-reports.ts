// frontend-contabilidad/lib/accounting-reports.ts
// Clientes ligeros para reportes contables (aging, kardex, etc.)
import { api } from '@/lib/api'

type ApiEnvelope<T> = { data: T } | T

function unwrap<T>(payload: ApiEnvelope<T>): T {
  return (payload as any)?.data ?? (payload as T)
}

function cleanParams(params: Record<string, unknown>) {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string' && value.trim() === '') continue
    next[key] = Array.isArray(value) ? value.filter((v) => v !== undefined && v !== null) : value
  }
  return next
}

type AgingTotals = {
  current: number
  d30: number
  d60: number
  d90: number
  d90p: number
}

export type AgingRow = {
  thirdPartyId: number
  thirdPartyName: string
  current: number
  d30: number
  d60: number
  d90: number
  d90p: number
}

export type AgingResponse = {
  asOf: string
  scope: 'AR' | 'AP'
  totals: AgingTotals
  rows: AgingRow[]
}

export type NiifStatementNode = {
  id: string
  label: string
  amount: number
  previousAmount?: number | null
  children?: NiifStatementNode[]
  notes?: string
}

type UnmappedBucket = { code: string; name: string; balance: number }

export type NiifStatementMeta = {
  unmapped?: {
    current: UnmappedBucket[]
    previous: UnmappedBucket[]
  }
  checks?: Record<string, number>
}

export type NiifBalanceStatement = {
  asOf: string
  previousAsOf?: string | null
  currency: string
  sections: NiifStatementNode[]
  totals: {
    assets: number
    liabilities: number
    equity: number
  }
  meta?: NiifStatementMeta
}

export type NiifIncomeStatement = {
  from: string
  to: string
  previousFrom?: string | null
  previousTo?: string | null
  currency: string
  sections: NiifStatementNode[]
  totals: {
    netIncome: number
  }
  meta?: NiifStatementMeta
}

export type NiifCashFlowStatement = {
  from: string
  to: string
  previousFrom?: string | null
  previousTo?: string | null
  currency: string
  sections: NiifStatementNode[]
  totals: {
    netChange: number
  }
  meta?: NiifStatementMeta
}

export async function fetchAging(params: { asOf: string; scope: 'AR' | 'AP' }) {
  const res = await api.get<ApiEnvelope<AgingResponse>>('/accounting/aging', { params })
  const data = unwrap(res.data)

  if (Array.isArray((data as any))) {
    // Compatibilidad con respuestas antiguas (lista directa)
    const normalize = (raw: any): AgingRow => ({
      thirdPartyId: Number(raw.thirdPartyId ?? 0),
      thirdPartyName: raw.thirdPartyName ?? raw.party ?? '',
      current: Number(raw.current ?? raw.bucket0 ?? 0),
      d30: Number(raw.d30 ?? raw.bucket30 ?? 0),
      d60: Number(raw.d60 ?? raw.bucket60 ?? 0),
      d90: Number(raw.d90 ?? raw.bucket90 ?? 0),
      d90p: Number(raw.d90p ?? raw.bucket120 ?? 0),
    })
    const rows = (data as unknown as any[]).map(normalize)
    const totals = rows.reduce<AgingTotals>((acc, row) => ({
      current: acc.current + row.current,
      d30: acc.d30 + row.d30,
      d60: acc.d60 + row.d60,
      d90: acc.d90 + row.d90,
      d90p: acc.d90p + row.d90p,
    }), { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 })
    return { asOf: params.asOf, scope: params.scope, totals, rows }
  }

  const normalized = data as AgingResponse
  return {
    asOf: normalized.asOf,
    scope: normalized.scope,
    totals: normalized.totals,
    rows: Array.isArray(normalized.rows) ? normalized.rows : [],
  }
}

export async function fetchNiifBalance(params: { asOf: string; previousAsOf?: string }) {
  const res = await api.get<ApiEnvelope<NiifBalanceStatement>>('/accounting/niif/balance', { params })
  return unwrap(res.data)
}

export async function fetchNiifIncome(params: {
  from: string
  to: string
  previousFrom?: string
  previousTo?: string
  accumulateYear?: boolean
}) {
  const res = await api.get<ApiEnvelope<NiifIncomeStatement>>('/accounting/niif/income', { params })
  return unwrap(res.data)
}

export async function fetchNiifCashFlow(params: {
  from: string
  to: string
  previousFrom?: string
  previousTo?: string
}) {
  const res = await api.get<ApiEnvelope<NiifCashFlowStatement>>('/accounting/niif/cash-flow', { params })
  return unwrap(res.data)
}

export type KardexRow = {
  id: number
  ts: string
  type: string
  qty: number
  unitCost: number
  amount: number
  warehouseId?: number | null
  note?: string | null
}

export type KardexResponse = {
  itemId: number
  from: string
  to: string
  totals: { inQty: number; inAmt: number; outQty: number; outAmt: number }
  rows: KardexRow[]
}

export async function fetchKardex(params: { itemId: number; from?: string; to?: string }) {
  const res = await api.get<ApiEnvelope<KardexResponse>>('/accounting/kardex', { params })
  const data = unwrap(res.data) as KardexResponse
  return {
    itemId: data.itemId,
    from: data.from,
    to: data.to,
    totals: data.totals ?? { inQty: 0, inAmt: 0, outQty: 0, outAmt: 0 },
    rows: Array.isArray(data.rows) ? data.rows : [],
  }
}

export function buildKardexExportUrl(params: { itemId?: number | string; from: string; to: string }) {
  if (!params.itemId) return '#'
  const qs = new URLSearchParams({
    itemId: String(params.itemId),
    from: params.from,
    to: params.to,
  }).toString()
  return `/accounting/export/kardex.csv?${qs}`
}

export function buildAgingExportUrl(params: { asOf: string; scope: 'AR' | 'AP' }) {
  const qs = new URLSearchParams({ asOf: params.asOf, scope: params.scope }).toString()
  return `/accounting/export/aging.csv?${qs}`
}

export function buildNiifBalanceExportUrl(params: { asOf: string; previousAsOf?: string }) {
  const qs = new URLSearchParams(
    Object.fromEntries(
      Object.entries({ asOf: params.asOf, previousAsOf: params.previousAsOf })
        .filter(([, value]) => value != null && value !== '')
        .map(([k, v]) => [k, String(v)])
    )
  ).toString()
  return `/accounting/export/niif/balance.csv?${qs}`
}

export function buildNiifIncomeExportUrl(params: {
  from: string
  to: string
  previousFrom?: string
  previousTo?: string
  accumulateYear?: boolean
}) {
  const entries = Object.entries({
    from: params.from,
    to: params.to,
    previousFrom: params.previousFrom,
    previousTo: params.previousTo,
    accumulateYear: params.accumulateYear ? 'true' : undefined,
  }).filter(([, value]) => value != null && value !== '')
  const qs = new URLSearchParams(entries as [string, string][]).toString()
  return `/accounting/export/niif/income.csv?${qs}`
}

export function buildNiifCashFlowExportUrl(params: {
  from: string
  to: string
  previousFrom?: string
  previousTo?: string
}) {
  const qs = new URLSearchParams(
    Object.entries({
      from: params.from,
      to: params.to,
      previousFrom: params.previousFrom,
      previousTo: params.previousTo,
    }).filter(([, value]) => value != null && value !== '') as [string, string][]
  ).toString()
  return `/accounting/export/niif/cash-flow.csv?${qs}`
}

export type JournalStatus = 'DRAFT' | 'POSTED' | 'REVERSED'

export type GeneralJournalRow = {
  entryId: number
  entryDate: string
  entryStatus: string
  journalCode: string
  journalName: string | null
  entryNumber: number | null
  sourceType: string | null
  sourceId: string | number | null
  accountCode: string
  accountName: string
  accountNature: string
  lineId: number
  lineDescription: string | null
  entryDescription: string | null
  thirdPartyId: number | null
  thirdPartyDocument: string | null
  thirdPartyName: string | null
  costCenterId: number | null
  costCenterCode: string | null
  costCenterName: string | null
  debit: number
  credit: number
}

export type GeneralJournalResponse = {
  from: string
  to: string
  status: JournalStatus | null
  journalCode: string | null
  thirdPartyId: number | null
  costCenterId: number | null
  accountCode: string | null
  count: number
  totals: { debit: number; credit: number }
  rows: GeneralJournalRow[]
}

export type GeneralJournalFilters = {
  from?: string
  to?: string
  status?: JournalStatus
  journalCode?: string
  thirdPartyId?: number
  costCenterId?: number
  accountCode?: string
}

export async function fetchGeneralJournal(params: GeneralJournalFilters) {
  const query = cleanParams(params)
  const res = await api.get<ApiEnvelope<GeneralJournalResponse>>('/accounting/books/general-journal', {
    params: query,
  })
  return unwrap(res.data)
}

export function buildGeneralJournalExportUrl(params: GeneralJournalFilters & { format?: 'csv' | 'xlsx' }) {
  const search = new URLSearchParams()
  const clean = cleanParams(params)
  for (const [key, value] of Object.entries(clean)) {
    if (value == null) continue
    search.set(key, String(value))
  }
  if (params.format && params.format !== 'csv') {
    search.set('format', params.format)
  }
  const qs = search.toString()
  return `/accounting/export/books/general-journal${qs ? `?${qs}` : ''}`
}

export type AuxLedgerRow = GeneralJournalRow & { balance: number }

export type AuxLedgerAccountResponse = {
  from: string
  to: string
  status: JournalStatus | null
  journalCode: string | null
  thirdPartyId: number | null
  costCenterId: number | null
  account: { code: string; name: string; nature: string }
  opening: number
  closing: number
  totals: { debit: number; credit: number }
  rows: AuxLedgerRow[]
}

export type AuxLedgerAccountQueryParams = {
  from?: string
  to?: string
  status?: JournalStatus
  journalCode?: string
  thirdPartyId?: number
  costCenterId?: number
  accountCode: string
}

export async function fetchAuxLedgerByAccount(params: AuxLedgerAccountQueryParams) {
  const query = cleanParams(params)
  const res = await api.get<ApiEnvelope<AuxLedgerAccountResponse>>('/accounting/books/aux/account', {
    params: query,
  })
  return unwrap(res.data)
}

export function buildAuxLedgerAccountExportUrl(params: AuxLedgerAccountQueryParams & { format?: 'csv' | 'xlsx' }) {
  const search = new URLSearchParams()
  const clean = cleanParams(params)
  for (const [key, value] of Object.entries(clean)) {
    if (value == null) continue
    search.set(key, String(value))
  }
  if (params.format && params.format !== 'csv') search.set('format', params.format)
  const qs = search.toString()
  return `/accounting/export/books/aux/account${qs ? `?${qs}` : ''}`
}

export type AuxLedgerThirdPartyResponse = {
  from: string
  to: string
  status: JournalStatus | null
  journalCode: string | null
  thirdParty: { id: number; name: string; document?: string | null } | null
  accountCode: string | null
  costCenterId: number | null
  totals: { debit: number; credit: number }
  openings: Array<{ accountCode: string; accountName?: string; opening: number }>
  closings: Array<{ accountCode: string; closing: number }>
  rows: AuxLedgerRow[]
}

export type AuxLedgerThirdPartyQueryParams = {
  from?: string
  to?: string
  status?: JournalStatus
  journalCode?: string
  accountCode?: string
  costCenterId?: number
  thirdPartyId: number
}

export async function fetchAuxLedgerByThirdParty(params: AuxLedgerThirdPartyQueryParams) {
  const query = cleanParams(params)
  const res = await api.get<ApiEnvelope<AuxLedgerThirdPartyResponse>>('/accounting/books/aux/third-party', {
    params: query,
  })
  return unwrap(res.data)
}

export function buildAuxLedgerThirdPartyExportUrl(
  params: AuxLedgerThirdPartyQueryParams & { format?: 'csv' | 'xlsx' }
) {
  const search = new URLSearchParams()
  const clean = cleanParams(params)
  for (const [key, value] of Object.entries(clean)) {
    if (value == null) continue
    search.set(key, String(value))
  }
  if (params.format && params.format !== 'csv') search.set('format', params.format)
  const qs = search.toString()
  return `/accounting/export/books/aux/third-party${qs ? `?${qs}` : ''}`
}

export type AuxLedgerCostCenterResponse = {
  from: string
  to: string
  status: JournalStatus | null
  journalCode: string | null
  thirdPartyId: number | null
  costCenter: { id: number; code: string; name: string } | null
  accountCode: string | null
  totals: { debit: number; credit: number }
  openings: Array<{ accountCode: string; accountName?: string; opening: number }>
  closings: Array<{ accountCode: string; closing: number }>
  rows: AuxLedgerRow[]
}

export type AuxLedgerCostCenterQueryParams = {
  from?: string
  to?: string
  status?: JournalStatus
  journalCode?: string
  accountCode?: string
  thirdPartyId?: number
  costCenterId: number
}

export async function fetchAuxLedgerByCostCenter(params: AuxLedgerCostCenterQueryParams) {
  const query = cleanParams(params)
  const res = await api.get<ApiEnvelope<AuxLedgerCostCenterResponse>>('/accounting/books/aux/cost-center', {
    params: query,
  })
  return unwrap(res.data)
}

export function buildAuxLedgerCostCenterExportUrl(
  params: AuxLedgerCostCenterQueryParams & { format?: 'csv' | 'xlsx' }
) {
  const search = new URLSearchParams()
  const clean = cleanParams(params)
  for (const [key, value] of Object.entries(clean)) {
    if (value == null) continue
    search.set(key, String(value))
  }
  if (params.format && params.format !== 'csv') search.set('format', params.format)
  const qs = search.toString()
  return `/accounting/export/books/aux/cost-center${qs ? `?${qs}` : ''}`
}
