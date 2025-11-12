"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  EmploymentStatus,
  HrEmployee,
  listHrEmployees,
} from '@/lib/hr'
import NewEmployeeWizard from '@/components/empleados/NewEmployeeWizard'

export type Employee = {
  id: number
  profileId: number
  name: string
  document?: string
  jobTitle?: string | null
  department?: string | null
  status?: string
}

const STATUS_FILTERS: Array<{ label: string; value: 'ALL' | EmploymentStatus }> =
  [
    { label: 'Todos', value: 'ALL' },
    { label: 'Activos', value: 'ACTIVE' },
    { label: 'Inactivos', value: 'INACTIVE' },
    { label: 'Suspendidos', value: 'SUSPENDED' },
    { label: 'Terminados', value: 'TERMINATED' },
  ]

const statusBadge = (status?: string) => {
  switch (status) {
    case 'ACTIVE':
      return 'bg-green-100 text-green-700'
    case 'INACTIVE':
      return 'bg-gray-100 text-gray-700'
    case 'SUSPENDED':
      return 'bg-yellow-100 text-yellow-800'
    case 'TERMINATED':
      return 'bg-red-100 text-red-700'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

export default function ListaEmpleados() {
  const router = useRouter()
  const [empleados, setEmpleados] = useState<Employee[]>([])
  const [filtro, setFiltro] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | EmploymentStatus
  >('ALL')
  const [includeTerminated, setIncludeTerminated] = useState(false)
  const [showWizard, setShowWizard] = useState(false)

  const loadEmployees = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listHrEmployees({
        includeContracts: true,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        includeTerminated:
          includeTerminated || statusFilter === 'TERMINATED',
      })
      const mapped = res.map((emp) => ({
        id: emp.thirdParty.id,
        profileId: emp.id,
        name: emp.thirdParty.name,
        document: emp.thirdParty.document ?? undefined,
        jobTitle: emp.jobTitle ?? undefined,
        department: emp.department ?? undefined,
        status: emp.status,
      }))
      setEmpleados(mapped)
    } catch (err: any) {
      console.error('Failed to load employees', err)
      setError('No se pudieron cargar los empleados')
    } finally {
      setLoading(false)
    }
  }, [includeTerminated, statusFilter])

  useEffect(() => {
    void loadEmployees()
  }, [loadEmployees])

  const normalizedFilter = filtro.trim().toLowerCase()
  const empleadosFiltrados = useMemo(() => {
    if (!normalizedFilter) return empleados
    return empleados.filter(
      (e) =>
        (e.name || '').toLowerCase().includes(normalizedFilter) ||
        (e.document || '').toLowerCase().includes(normalizedFilter) ||
        (e.jobTitle || '').toLowerCase().includes(normalizedFilter) ||
        (e.department || '').toLowerCase().includes(normalizedFilter),
    )
  }, [empleados, normalizedFilter])

  const handleCreated = (created: HrEmployee) => {
    setShowWizard(false)
    void loadEmployees()
    if (created.thirdParty?.id) {
      router.push(`/empleados/${created.thirdParty.id}`)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold">Lista de empleados</h1>
          <p className="text-sm text-gray-500">
            Revisa el estado general y crea nuevos colaboradores con un asistente guiado.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowWizard(true)}>
          Nuevo empleado
        </button>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="md:col-span-1">
          <input
            type="text"
            className="input input-bordered w-full"
            placeholder="Filtrar por nombre, documento, cargo o area"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        </div>
        <div className="md:col-span-1">
          <select
            className="select select-bordered w-full"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'ALL' | EmploymentStatus)
            }
          >
            {STATUS_FILTERS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={includeTerminated}
            onChange={(e) => setIncludeTerminated(e.target.checked)}
          />
          Mostrar terminados con el resto
        </label>
      </div>

      {loading && <div className="py-8 text-center">Cargando empleados…</div>}
      {error && <div className="mb-4 text-red-600">{error}</div>}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto border-collapse">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Documento</th>
                <th className="px-4 py-2">Cargo</th>
                <th className="px-4 py-2">Area</th>
                <th className="px-4 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {empleadosFiltrados.map((e) => (
                <tr
                  key={e.profileId}
                  className="cursor-pointer border-b hover:bg-gray-50"
                  onClick={() => router.push(`/empleados/${e.id}`)}
                >
                  <td className="px-4 py-2">
                    <span className="text-blue-600 hover:underline">{e.name}</span>
                  </td>
                  <td className="px-4 py-2">{e.document || '-'}</td>
                  <td className="px-4 py-2">{e.jobTitle || '-'}</td>
                  <td className="px-4 py-2">{e.department || '-'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${statusBadge(e.status)}`}
                    >
                      {e.status || '-'}
                    </span>
                  </td>
                </tr>
              ))}
              {empleadosFiltrados.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center" colSpan={5}>
                    No se encontraron empleados con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <NewEmployeeWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onCreated={handleCreated}
      />
    </div>
  )
}
