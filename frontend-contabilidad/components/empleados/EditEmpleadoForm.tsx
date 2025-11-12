"use client"
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  EmploymentStatus,
  getHrEmployee,
  updateHrEmployee,
} from '@/lib/hr'

const STATUS_OPTIONS: EmploymentStatus[] = [
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'TERMINATED',
]

const statusLabel = (status: EmploymentStatus) => {
  switch (status) {
    case 'ACTIVE':
      return 'Activo'
    case 'INACTIVE':
      return 'Inactivo'
    case 'SUSPENDED':
      return 'Suspendido'
    case 'TERMINATED':
      return 'Terminado'
    default:
      return status
  }
}

export default function EditEmpleadoForm({
  empleadoId,
}: {
  empleadoId: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [profileId, setProfileId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [document, setDocument] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [status, setStatus] = useState<EmploymentStatus>('ACTIVE')
  const [hireDate, setHireDate] = useState('')
  const [terminationDate, setTerminationDate] = useState('')
  const [payableAccountCode, setPayableAccountCode] = useState('')
  const [notes, setNotes] = useState('')

  const loadEmployee = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const employee = await getHrEmployee(Number(empleadoId), {
        includeContracts: false,
        includeAffiliations: false,
      })
      setProfileId(employee.id)
      setName(employee.thirdParty?.name ?? '')
      setDocument(employee.thirdParty?.document ?? '')
      setJobTitle(employee.jobTitle ?? '')
      setDepartment(employee.department ?? '')
      setStatus(employee.status)
      setHireDate(employee.hireDate ? employee.hireDate.slice(0, 10) : '')
      setTerminationDate(
        employee.terminationDate ? employee.terminationDate.slice(0, 10) : '',
      )
      setPayableAccountCode(employee.payableAccountCode ?? '')
      setNotes((employee as any)?.notes ?? '')
    } catch (err: any) {
      console.error('Failed to load employee profile', err)
      setError('No se pudo cargar la información del empleado')
    } finally {
      setLoading(false)
    }
  }, [empleadoId])

  useEffect(() => {
    void loadEmployee()
  }, [loadEmployee])

  const onSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!profileId) {
      setError('No se encontró el perfil del empleado')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await updateHrEmployee(profileId, {
        status,
        jobTitle: jobTitle.trim() || null,
        department: department.trim() || null,
        hireDate: hireDate || null,
        terminationDate: terminationDate || null,
        payableAccountCode: payableAccountCode.trim() || null,
        notes: notes.trim() || null,
      })
      setSuccess('Guardado correctamente')
      setTimeout(() => router.push(`/empleados/${empleadoId}`), 600)
    } catch (err: any) {
      console.error('Save failed', err)
      setError(
        err?.response?.data?.message ?? 'Error al guardar los cambios',
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div>Cargando datos del empleado…</div>
  if (error) return <div className="text-red-600">{error}</div>

  return (
    <form onSubmit={onSave} className="space-y-4">
      {success && <div className="text-green-600">{success}</div>}
      <div>
        <label className="block text-sm font-medium mb-1">Nombre</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input input-bordered w-full"
          disabled
        />
        <p className="text-xs text-gray-500 mt-1">
          El nombre se administra desde la ficha del tercero.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Documento</label>
        <input
          value={document}
          onChange={(e) => setDocument(e.target.value)}
          className="input input-bordered w-full"
          disabled
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Cargo</label>
        <input
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          className="input input-bordered w-full"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Área / Departamento</label>
        <input
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="input input-bordered w-full"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Estado</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as EmploymentStatus)}
          className="select select-bordered w-full"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {statusLabel(opt)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Fecha de ingreso
          </label>
          <input
            type="date"
            value={hireDate}
            onChange={(e) => setHireDate(e.target.value)}
            className="input input-bordered w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Fecha de retiro
          </label>
          <input
            type="date"
            value={terminationDate}
            onChange={(e) => setTerminationDate(e.target.value)}
            className="input input-bordered w-full"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">
          Cuenta por pagar (250505, etc.)
        </label>
        <input
          value={payableAccountCode}
          onChange={(e) => setPayableAccountCode(e.target.value)}
          className="input input-bordered w-full"
          placeholder="Ej: 25050501"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Notas</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="textarea textarea-bordered w-full"
          rows={3}
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => router.push(`/empleados/${empleadoId}`)}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
