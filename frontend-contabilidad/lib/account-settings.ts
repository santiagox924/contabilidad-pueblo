// lib/account-settings.ts
import { api } from '@/lib/api'

export type PurchaseAccountSetting = {
  key: string
  label: string
  description?: string
  accountCode: string
  defaultCode: string
  isDefault: boolean
  account: {
    id: number | null
    code: string
    name: string | null
    nature: string | null
    class: string | null
    requiresThirdParty: boolean
    requiresCostCenter: boolean
  }
}

type ApiEnvelope<T> = T | { data: T }

function unwrap<T>(payload: ApiEnvelope<T>): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as any).data as T
  }
  return payload as T
}

export async function listPurchaseAccountSettings(signal?: AbortSignal) {
  const res = await api.get<ApiEnvelope<PurchaseAccountSetting[]>>('/accounting/config/purchases', { signal })
  return unwrap(res.data)
}

export async function updateAccountSetting(key: string, accountCode: string) {
  const res = await api.patch<ApiEnvelope<PurchaseAccountSetting>>(`/accounting/config/accounts/${encodeURIComponent(key)}`, {
    accountCode,
  })
  return unwrap(res.data)
}
