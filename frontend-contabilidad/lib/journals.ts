import { api } from '@/lib/api'

export type JournalStatus = 'DRAFT' | 'POSTED' | 'REVERSED'

export interface JournalTotals {
  debit: number
  credit: number
}

export interface JournalSummary {
  id: number
  date: string
  status: JournalStatus
  number: number | null
  sourceType: string
  sourceId: number
  description: string | null
  journal: { id: number; code: string; name: string } | null
  totals: JournalTotals
}

export interface JournalLine {
  id: number
  accountCode: string
  accountName: string | null
  thirdParty: { id: number; name: string; document: string | null } | null
  costCenter: { id: number; code: string; name: string } | null
  debit: number
  credit: number
  description: string | null
}

export interface JournalDetail extends JournalSummary {
  period: { id: number; year: number; month: number; status: string } | null
  lines: JournalLine[]
}

export interface JournalListResponse {
  total: number
  items: JournalSummary[]
}

function num(x: any): number {
  const n = typeof x === 'number' ? x : Number(x)
  return Number.isFinite(n) ? n : 0
}

function journalTotals(raw: any): JournalTotals {
  return {
    debit: num(raw?.debit),
    credit: num(raw?.credit),
  }
}

function mapSummary(raw: any): JournalSummary {
  return {
    id: num(raw?.id),
    date: raw?.date ?? raw?.createdAt ?? new Date().toISOString(),
    status: (raw?.status as JournalStatus) ?? 'POSTED',
    number: raw?.number != null ? num(raw.number) : null,
    sourceType: raw?.sourceType ?? '',
    sourceId: num(raw?.sourceId),
    description: raw?.description ?? null,
    journal: raw?.journal
      ? {
          id: num(raw.journal.id),
          code: raw.journal.code ?? '',
          name: raw.journal.name ?? '',
        }
      : null,
    totals: journalTotals(raw?.totals),
  }
}

function mapDetail(raw: any): JournalDetail {
  return {
    ...mapSummary(raw),
    period: raw?.period
      ? {
          id: num(raw.period.id),
          year: num(raw.period.year),
          month: num(raw.period.month),
          status: raw.period.status ?? 'OPEN',
        }
      : null,
    lines: Array.isArray(raw?.lines)
      ? raw.lines.map((ln: any) => ({
          id: num(ln?.id ?? Date.now()),
          accountCode: ln?.accountCode ?? '',
          accountName: ln?.accountName ?? ln?.account?.name ?? null,
          thirdParty: ln?.thirdParty
            ? {
                id: num(ln.thirdParty.id),
                name: ln.thirdParty.name ?? '',
                document: ln.thirdParty.document ?? null,
              }
            : null,
          costCenter: ln?.costCenter
            ? {
                id: num(ln.costCenter.id),
                code: ln.costCenter.code ?? '',
                name: ln.costCenter.name ?? '',
              }
            : null,
          debit: num(ln?.debit),
          credit: num(ln?.credit),
          description: ln?.description ?? null,
        }))
      : [],
  }
}

export async function listJournalEntries(params: {
  from?: string
  to?: string
  status?: JournalStatus
  journalId?: number
  journalCode?: string
  search?: string
  take?: number
  skip?: number
  order?: 'asc' | 'desc'
} = {}): Promise<JournalListResponse> {
  const { data } = await api.get('/accounting/journals', { params })
  const itemsRaw = Array.isArray((data as any)?.items) ? (data as any).items : []
  return {
    total: num((data as any)?.total),
    items: itemsRaw.map(mapSummary),
  }
}

export async function getJournalEntry(id: number): Promise<JournalDetail> {
  const { data } = await api.get(`/accounting/journals/${id}`)
  return mapDetail(data)
}

export interface UpsertJournalPayload {
  date?: string
  description?: string | null
  journalId?: number
  journalCode?: string
  lines: Array<{
    accountCode: string
    debit?: number
    credit?: number
    thirdPartyId?: number | null
    description?: string | null
  }>
}

export async function createJournalEntry(payload: UpsertJournalPayload): Promise<JournalDetail> {
  const { data } = await api.post('/accounting/journals', payload)
  return mapDetail(data)
}

export async function updateJournalEntry(id: number, payload: UpsertJournalPayload): Promise<JournalDetail> {
  const { data } = await api.patch(`/accounting/journals/${id}`, payload)
  return mapDetail(data)
}

export async function deleteJournalEntry(id: number): Promise<void> {
  await api.delete(`/accounting/journals/${id}`)
}

export async function changeJournalStatus(id: number, status: 'DRAFT' | 'POSTED') {
  const { data } = await api.post(`/accounting/entry/${id}/status`, { status })
  return mapDetail(data)
}

export async function postManualEntry(id: number) {
  const { data } = await api.post(`/accounting/manual-entry/${id}/post`)
  return mapDetail(data)
}

export async function reverseJournalEntry(id: number, reason?: string | null) {
  const { data } = await api.post(`/accounting/entry/${id}/reverse`, {
    reason: reason ?? undefined,
  })
  return mapDetail(data)
}

export interface JournalCatalogItem {
  id: number
  code: string
  name: string
  isActive: boolean
}

export async function listJournalCatalog(): Promise<JournalCatalogItem[]> {
  const { data } = await api.get('/accounting/journals/catalog')
  const items = Array.isArray(data) ? data : []
  return items.map((j: any) => ({
    id: num(j?.id),
    code: j?.code ?? '',
    name: j?.name ?? '',
    isActive: Boolean(j?.isActive ?? true),
  }))
}
