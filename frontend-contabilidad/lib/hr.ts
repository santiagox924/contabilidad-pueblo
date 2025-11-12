import { api } from '@/lib/api'

export type EmploymentStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'TERMINATED'

export type HrEmployee = {
  id: number
  status: EmploymentStatus
  jobTitle?: string | null
  department?: string | null
  hireDate?: string | null
  terminationDate?: string | null
  payableAccountCode?: string | null
  thirdParty: {
    id: number
    name: string
    document?: string | null
    email?: string | null
    phone?: string | null
    address?: string | null
    city?: string | null
  }
  contracts?: Array<{
    id: number
    code?: string | null
    contractType: string
    startDate: string
    endDate?: string | null
    salaryAmount: string
    salaryFrequency: string
    isActive: boolean
  }>
  affiliations?: Array<{
    id: number
    kind: string
    startDate?: string | null
    endDate?: string | null
    thirdParty?: {
      id: number
      name?: string | null
      document?: string | null
    } | null
  }>
}

export async function listHrEmployees(params?: {
  status?: EmploymentStatus
  search?: string
  includeContracts?: boolean
  includeAffiliations?: boolean
  includeTerminated?: boolean
}) {
  const res = await api.get<HrEmployee[]>('/treasury/hr/employees', {
    params,
  })
  return Array.isArray(res.data) ? res.data : []
}

export async function getHrEmployee(
  id: number,
  params?: { includeContracts?: boolean; includeAffiliations?: boolean },
) {
  const res = await api.get<HrEmployee>(`/treasury/hr/employees/${id}`, {
    params,
  })
  return res.data
}

export async function createHrEmployee(payload: {
  thirdPartyId: number
  status?: EmploymentStatus
  jobTitle?: string
  department?: string
  hireDate?: string
  terminationDate?: string
  defaultCostCenterId?: number
  payableAccountCode?: string
  notes?: string
}) {
  const res = await api.post('/treasury/hr/employees', payload)
  return res.data
}

export async function updateHrEmployee(
  id: number,
  payload: Partial<{
    status: EmploymentStatus
    jobTitle?: string | null
    department?: string | null
    hireDate?: string | null
    terminationDate?: string | null
    defaultCostCenterId?: number | null
    payableAccountCode?: string | null
    notes?: string | null
  }>,
) {
  const res = await api.put(`/treasury/hr/employees/${id}`, payload)
  return res.data
}

export async function createHrContract(
  employeeId: number,
  payload: {
    contractType: string
    code?: string
    startDate: string
    endDate?: string | null
    salaryAmount: number
    salaryFrequency: string
    workingHours?: string
    probationEnd?: string | null
    notes?: string
    isActive?: boolean
  },
) {
  const res = await api.post(
    `/treasury/hr/employees/${employeeId}/contracts`,
    payload,
  )
  return res.data
}

export async function updateHrContract(
  contractId: number,
  payload: Partial<{
    contractType: string
    code?: string | null
    startDate?: string
    endDate?: string | null
    salaryAmount?: number
    salaryFrequency?: string
    workingHours?: string | null
    probationEnd?: string | null
    notes?: string | null
    isActive?: boolean
  }>,
) {
  const res = await api.put(`/treasury/hr/contracts/${contractId}`, payload)
  return res.data
}

export async function closeHrContract(contractId: number, endDate?: string) {
  const res = await api.post(`/treasury/hr/contracts/${contractId}/close`, {
    endDate,
  })
  return res.data
}

export async function deleteHrContract(contractId: number) {
  const res = await api.delete(`/treasury/hr/contracts/${contractId}`)
  return res.data
}

export async function listHrAffiliations(employeeId: number) {
  const res = await api.get(`/treasury/hr/employees/${employeeId}/affiliations`)
  return Array.isArray(res.data) ? res.data : []
}

export async function createHrAffiliation(
  employeeId: number,
  payload: {
    kind: string
    thirdPartyId: number
    startDate?: string
    endDate?: string
    notes?: string
  },
) {
  const res = await api.post(
    `/treasury/hr/employees/${employeeId}/affiliations`,
    payload,
  )
  return res.data
}

export async function updateHrAffiliation(
  affiliationId: number,
  payload: {
    kind?: string
    thirdPartyId?: number
    startDate?: string | null
    endDate?: string | null
    notes?: string | null
  },
) {
  const res = await api.put(
    `/treasury/hr/affiliations/${affiliationId}`,
    payload,
  )
  return res.data
}

export async function deleteHrAffiliation(affiliationId: number) {
  const res = await api.delete(`/treasury/hr/affiliations/${affiliationId}`)
  return res.data
}

export async function deactivateHrEmployee(
  employeeId: number,
  payload?: { terminationDate?: string; deactivateThirdParty?: boolean },
) {
  const res = await api.post(
    `/treasury/hr/employees/${employeeId}/deactivate`,
    payload ?? {},
  )
  return res.data
}

export async function deleteHrEmployee(employeeId: number) {
  const res = await api.delete(`/treasury/hr/employees/${employeeId}`)
  return res.data
}
