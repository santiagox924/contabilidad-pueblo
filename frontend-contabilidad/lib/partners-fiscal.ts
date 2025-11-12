// lib/partners-fiscal.ts
// Cliente para perfiles fiscales de terceros (partners)

export type FiscalRegime =
  | 'NO_RESPONSABLE_IVA'
  | 'RESPONSABLE_IVA'
  | 'SIMPLE'
  | 'ESPECIAL'

export type TaxProfile = 'NA' | 'IVA_RESPONSABLE' | 'EXENTO' | 'EXCLUIDO'

export interface PartnerFiscalProfile {
  id: number
  name: string
  document: string | null
  fiscalRegime: FiscalRegime | null
  isWithholdingAgent: boolean | null
  ciiuCode: string | null
  municipalityCode: string | null
  taxProfile: TaxProfile | null
  defaultVatId: number | null
}

export interface PartnerFiscalFilters {
  isWithholdingAgent?: boolean
  regime?: FiscalRegime
  municipalityCode?: string
  ciiuCode?: string
  take?: number
  skip?: number
}

export interface UpdatePartnerFiscalInput {
  fiscalRegime?: FiscalRegime
  isWithholdingAgent?: boolean
  ciiuCode?: string | null
  municipalityCode?: string | null
  taxProfile?: TaxProfile
  defaultVatId?: number | null
}

type ApiEnvelope<T> = T | { data: T }

const _API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/$/, '')
if (!_API_BASE) {
  console.warn(
    '[partners-fiscal] NEXT_PUBLIC_API_BASE_URL está vacío. Define NEXT_PUBLIC_API_BASE_URL para apuntar al backend (ej: http://localhost:3001).',
  )
}
const API_BASE = _API_BASE || '/__MISSING_API_BASE__'

function unwrap<T>(payload: ApiEnvelope<T>): T {
  if (payload && typeof payload === 'object' && 'data' in payload && (payload as any).data !== undefined) {
    return (payload as any).data as T
  }
  return payload as T
}

async function handleResponse<T>(res: Response): Promise<T> {
  const ct = res.headers.get('content-type') || ''
  const isJson = ct.includes('application/json') || ct.includes('+json')

  if (res.status === 204 || res.status === 205) {
    return undefined as unknown as T
  }

  if (res.ok && isJson) {
    return (await res.json()) as T
  }

  if (res.ok && !isJson) {
    const text = await res.text()
    throw new Error(`Respuesta no-JSON del servidor (Content-Type: ${ct || 'desconocido'}). Snippet: ${text.slice(0, 200)}`)
  }

  try {
    if (isJson) {
      const data = await res.json()
      const msg = (data && (data.message || data.error)) || JSON.stringify(data)
      throw new Error(`Error ${res.status}${msg ? `: ${msg}` : ''}`)
    }
  } catch {
    // fallback
  }
  const text = await res.text()
  const hint =
    text?.trim().startsWith('<!DOCTYPE') || text?.includes('<html')
      ? ' (posible HTML: revisa que NEXT_PUBLIC_API_BASE_URL apunte al backend y que no sea una página de login/redirect)'
      : ''
  throw new Error(`Error ${res.status}${hint}: ${text.slice(0, 200)}`)
}

function normalizePartner(payload: any): PartnerFiscalProfile {
  return {
    id: Number(payload?.id ?? 0),
    name: String(payload?.name ?? ''),
    document: payload?.document ?? null,
    fiscalRegime: payload?.fiscalRegime ?? null,
    isWithholdingAgent:
      payload?.isWithholdingAgent === undefined ? null : Boolean(payload?.isWithholdingAgent),
    ciiuCode: payload?.ciiuCode ?? null,
    municipalityCode: payload?.municipalityCode ?? null,
    taxProfile: payload?.taxProfile ?? null,
    defaultVatId:
      payload?.defaultVatId === undefined || payload?.defaultVatId === null
        ? null
        : Number(payload?.defaultVatId),
  }
}

function buildQuery(params?: PartnerFiscalFilters) {
  const search = new URLSearchParams()
  if (!params) return search
  if (params.isWithholdingAgent !== undefined) search.set('isWithholdingAgent', String(params.isWithholdingAgent))
  if (params.regime) search.set('regime', params.regime)
  if (params.municipalityCode) search.set('municipalityCode', params.municipalityCode)
  if (params.ciiuCode) search.set('ciiuCode', params.ciiuCode)
  if (typeof params.take === 'number') search.set('take', String(params.take))
  if (typeof params.skip === 'number') search.set('skip', String(params.skip))
  return search
}

export async function listPartnersFiscal(filters?: PartnerFiscalFilters, signal?: AbortSignal) {
  const qs = buildQuery(filters)
  const url = `${API_BASE}/partners-fiscal${qs.toString() ? `?${qs.toString()}` : ''}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal,
  })
  const payload = await handleResponse<ApiEnvelope<any[]>>(res)
  const rows = unwrap(payload)
  return rows.map(normalizePartner)
}

export async function getPartnerFiscal(thirdPartyId: number | string, signal?: AbortSignal) {
  const res = await fetch(`${API_BASE}/partners-fiscal/${thirdPartyId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal,
  })
  const payload = await handleResponse<ApiEnvelope<any>>(res)
  return normalizePartner(unwrap(payload))
}

export async function updatePartnerFiscal(thirdPartyId: number | string, input: UpdatePartnerFiscalInput) {
  const body: Record<string, unknown> = {}
  if (input.fiscalRegime !== undefined) body.fiscalRegime = input.fiscalRegime
  if (input.isWithholdingAgent !== undefined) body.isWithholdingAgent = input.isWithholdingAgent
  if (input.ciiuCode !== undefined) body.ciiuCode = normalizeStringOrNull(input.ciiuCode)
  if (input.municipalityCode !== undefined) body.municipalityCode = normalizeStringOrNull(input.municipalityCode)
  if (input.taxProfile !== undefined) body.taxProfile = input.taxProfile
  if (input.defaultVatId !== undefined) {
    body.defaultVatId = input.defaultVatId === null ? null : Number(input.defaultVatId)
  }

  if (Object.keys(body).length === 0) {
    throw new Error('No hay cambios para actualizar.')
  }

  const res = await fetch(`${API_BASE}/partners-fiscal/${thirdPartyId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await handleResponse<ApiEnvelope<any>>(res)
  return normalizePartner(unwrap(payload))
}

function normalizeStringOrNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}