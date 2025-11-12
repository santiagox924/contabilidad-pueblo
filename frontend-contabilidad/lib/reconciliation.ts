// frontend-contabilidad/lib/reconciliation.ts
// Utilidades de conciliación bancaria
import { api } from './api'

type ApiResponse<T> = { data: T } | T

function unwrap<T>(payload: ApiResponse<T>): T {
  return (payload as any)?.data ?? (payload as T)
}

export type BankStatement = {
  id: number
  bank: string
  accountNumber?: string | null
  currency?: string | null
  startDate?: string | null
  endDate?: string | null
  uploadedAt: string
  originalFileName: string
  status: string
}

export type BankStatementLine = {
  id: number
  date: string
  description?: string | null
  reference?: string | null
  amount: number
  balance?: number | null
  externalId?: string | null
  matchScore?: number | null
}

export async function listBankStatements(params?: { bank?: string; skip?: number; take?: number }) {
  const res = await api.get<ApiResponse<{ total: number; items: BankStatement[] }>>(
    '/accounting/reconciliation/statements',
    { params },
  )
  return unwrap(res.data)
}

export async function deleteBankStatement(id: number) {
  const res = await api.delete<ApiResponse<{ deleted: boolean }>>(
    `/accounting/reconciliation/statements/${id}`,
  )
  return unwrap(res.data)
}

export async function getBankStatementLines(id: number) {
  const res = await api.get<ApiResponse<{ statement: BankStatement; lines: BankStatementLine[] }>>(
    `/accounting/reconciliation/statements/${id}/lines`,
  )
  return unwrap(res.data)
}

export async function importBankStatement(file: File, bank?: string) {
  const formData = new FormData()
  formData.append('file', file)
  if (bank) formData.append('bank', bank)

  const res = await api.post<ApiResponse<any>>(
    '/accounting/reconciliation/import',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return unwrap(res.data)
}
