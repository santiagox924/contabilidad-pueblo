// lib/party-accounts.ts
// Ayudantes para cuentas por cobrar/pagar de terceros.
// Mantén los códigos sincronizados con api/src/accounting/config/accounts.map.ts

import type { Account } from '@/lib/accounts'

export type PartyType = 'CLIENT' | 'PROVIDER' | 'EMPLOYEE' | 'OTHER'

export const PARTY_TYPES: PartyType[] = ['CLIENT', 'PROVIDER', 'EMPLOYEE', 'OTHER']

export const PARTY_TYPE_LABEL: Record<PartyType, string> = {
  CLIENT: 'Cliente',
  PROVIDER: 'Proveedor',
  EMPLOYEE: 'Empleado',
  OTHER: 'Otro',
}

const DEFAULT_RECEIVABLE_ACCOUNT: Record<PartyType, string | null> = {
  CLIENT: '13050501',
  PROVIDER: '13050501',
  EMPLOYEE: '13050501',
  OTHER: '13050501',
}

const DEFAULT_PAYABLE_ACCOUNT: Record<PartyType, string | null> = {
  CLIENT: '220505',
  PROVIDER: '220505',
  EMPLOYEE: '220505',
  OTHER: '220505',
}

const RECEIVABLE_PRIORITY: PartyType[] = ['CLIENT', 'PROVIDER', 'EMPLOYEE', 'OTHER']
const PAYABLE_PRIORITY: PartyType[] = ['PROVIDER', 'CLIENT', 'EMPLOYEE', 'OTHER']

function toPartyRoles(roles: PartyType | PartyType[] | undefined): PartyType[] {
  if (!roles) return []
  const list = Array.isArray(roles) ? roles : [roles]
  return list.filter((role): role is PartyType => PARTY_TYPES.includes(role))
}

export function getDefaultReceivableAccount(roles: PartyType | PartyType[]): string | null {
  const normalized = toPartyRoles(roles)
  for (const role of RECEIVABLE_PRIORITY) {
    if (normalized.includes(role)) return DEFAULT_RECEIVABLE_ACCOUNT[role]
  }
  return DEFAULT_RECEIVABLE_ACCOUNT.CLIENT
}

export function getDefaultPayableAccount(roles: PartyType | PartyType[]): string | null {
  const normalized = toPartyRoles(roles)
  for (const role of PAYABLE_PRIORITY) {
    if (normalized.includes(role)) return DEFAULT_PAYABLE_ACCOUNT[role]
  }
  return DEFAULT_PAYABLE_ACCOUNT.PROVIDER
}

export function isReceivableAccountEligible(account: Account): boolean {
  return account.flowType === 'AR'
}

export function isPayableAccountEligible(account: Account): boolean {
  return account.flowType === 'AP'
}
