// lib/municipalities.ts
// Cliente para catálogo DIVIPOLA (municipios de Colombia)

import { api } from '@/lib/api'

export interface Municipality {
  code: string
  departmentCode: string
  departmentName: string
  name: string
  type: string
  latitude: number | null
  longitude: number | null
}

export interface MunicipalitySearchParams {
  query?: string
  departmentCode?: string
  code?: string
  take?: number
}

type ApiEnvelope<T> = T | { data: T }

function unwrap<T>(payload: ApiEnvelope<T>): T {
  if (payload && typeof payload === 'object' && 'data' in payload && (payload as any).data !== undefined) {
    return (payload as any).data as T
  }
  return payload as T
}

export async function searchMunicipalities(params?: MunicipalitySearchParams, signal?: AbortSignal) {
  const { data } = await api.get<ApiEnvelope<Municipality[]>>('/geo/municipalities', {
    params,
    signal,
  })
  return unwrap(data)
}

export async function getMunicipalityByCode(code: string, signal?: AbortSignal) {
  if (!code) return null
  const rows = await searchMunicipalities({ code, take: 1 }, signal)
  return rows[0] ?? null
}
