// frontend-contabilidad/lib/accounting-periods.ts
// Utilidades para consultar periodos contables y sus estados
import { api } from './api'

type ApiResponse<T> = { data: T } | T

function unwrap<T>(payload: ApiResponse<T>): T {
  return (payload as any)?.data ?? (payload as T)
}

export type PeriodSummaryItem = {
  year: number
  month: number
  status: 'OPEN' | 'CLOSED'
  start: string
  end: string
  closedAt: string | null
  reopenedAt: string | null
  draftEntries: number
  postedEntries: number
  reversedEntries: number
}

export type PeriodSummaryYear = {
  year: number
  closedMonths: number
  totalMonths: number
  fullyClosed: boolean
}

export type PeriodSummaryResponse = {
  generatedAt: string
  months: PeriodSummaryItem[]
  years: PeriodSummaryYear[]
  recommended: { year: number; month: number } | null
}

export type CloseYearResponse = {
  year: number
  result: number
  entry1: { id: number } | null
  entry2: { id: number } | null
} & Record<string, unknown>

export async function fetchPeriodSummary(params?: { months?: number; focusYear?: number }) {
  const res = await api.get<ApiResponse<PeriodSummaryResponse>>('/accounting/periods', {
    params: {
      months: params?.months,
      focusYear: params?.focusYear,
    },
  })
  return unwrap(res.data)
}

export async function closePeriodRequest(payload: { year: number; month: number }) {
  const res = await api.post<ApiResponse<any>>('/accounting/close-period', payload)
  return unwrap(res.data)
}

export async function openPeriodRequest(payload: { year: number; month: number }) {
  const res = await api.post<ApiResponse<any>>('/accounting/open-period', payload)
  return unwrap(res.data)
}

export async function closeYearRequest(payload: { year: number }) {
  const res = await api.post<ApiResponse<CloseYearResponse>>('/accounting/close-year', payload)
  return unwrap(res.data)
}

export function formatPeriodLabel(year: number, month: number) {
  const date = new Date(year, month - 1, 1)
  return date.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
}
