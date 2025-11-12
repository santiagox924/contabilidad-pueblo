import { api } from '@/lib/api'
import type { PayrollLineInput } from './payroll-lines'

export async function listPayrollRuns(params?: {
  employeeId?: number
  from?: string
  to?: string
}) {
  const res = await api.get('/payroll', { params })
  return Array.isArray(res.data) ? res.data : []
}

export async function listPayrollPayments(params?: {
  employeeId?: number
  from?: string
  to?: string
}) {
  const res = await api.get('/payroll/payments', { params })
  return Array.isArray(res.data) ? res.data : []
}

export async function getPayrollRun(id: number) {
  const res = await api.get(`/payroll/${id}`)
  return res.data
}

export async function recognizePayroll(payload: {
  employeeId?: number
  date?: string
  description?: string
  lines: PayrollLineInput[]
}) {
  return api.post('/payroll/recognition', {
    type: 'RECOGNITION',
    employeeId: payload.employeeId,
    date: payload.date,
    description: payload.description,
    lines: payload.lines,
  })
}

export async function payPayroll(payload: {
  employeeId?: number
  date?: string
  description?: string
  paymentMethodId?: number
  lines: PayrollLineInput[]
}) {
  return api.post('/payroll/payment', {
    type: 'PAYMENT',
    employeeId: payload.employeeId,
    date: payload.date,
    description: payload.description,
    paymentMethodId: payload.paymentMethodId,
    lines: payload.lines,
  })
}

export async function payContributions(payload: {
  employeeId?: number
  date?: string
  description?: string
  paymentMethodId?: number
  lines: PayrollLineInput[]
}) {
  return api.post('/payroll/contributions', {
    type: 'CONTRIBUTION',
    employeeId: payload.employeeId,
    date: payload.date,
    description: payload.description,
    paymentMethodId: payload.paymentMethodId,
    lines: payload.lines,
  })
}

export async function registerAdvance(payload: {
  employeeId?: number
  date?: string
  description?: string
  paymentMethodId?: number
  lines: PayrollLineInput[]
}) {
  return api.post('/payroll/advance', {
    type: 'ADVANCE',
    employeeId: payload.employeeId,
    date: payload.date,
    description: payload.description,
    paymentMethodId: payload.paymentMethodId,
    lines: payload.lines,
  })
}
