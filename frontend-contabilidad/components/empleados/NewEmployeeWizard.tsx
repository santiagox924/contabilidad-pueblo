"use client"

import { useState } from 'react'
import {
  EmploymentStatus,
  createHrEmployee,
  HrEmployee,
} from '@/lib/hr'

type StepKey = 'general' | 'contable'

const STATUS_OPTIONS: EmploymentStatus[] = [
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'TERMINATED',
]

type WizardProps = {
  open: boolean
  onClose: () => void
  onCreated?: (employee: HrEmployee) => void
}

const defaultForm = {
  thirdPartyId: '',
  status: 'ACTIVE' as EmploymentStatus,
  jobTitle: '',
  department: '',
  hireDate: '',
  terminationDate: '',
  defaultCostCenterId: '',
  payableAccountCode: '',
  notes: '',
}

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

export default function NewEmployeeWizard({
  open,
  onClose,
  onCreated,
}: WizardProps) {
  const [step, setStep] = useState<StepKey>('general')
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const reset = () => {
    setForm(defaultForm)
    setStep('general')
    setSaving(false)
    setError(null)
    setSuccess(null)
  }

  const closeWizard = () => {
    reset()
    onClose()
  }

  const goNext = () => {
    if (step === 'general') setStep('contable')
  }

  const goBack = () => {
    if (step === 'contable') setStep('general')
  }

  const handleSave = async () => {
    if (!form.thirdPartyId.trim()) {
      setError('Debes indicar el ID del tercero (empleado) antes de continuar.')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const payload = {
        thirdPartyId: Number(form.thirdPartyId),
        status: form.status,
        jobTitle: form.jobTitle.trim() || undefined,
        department: form.department.trim() || undefined,
        hireDate: form.hireDate || undefined,
        terminationDate: form.terminationDate || undefined,
        defaultCostCenterId: form.defaultCostCenterId
          ? Number(form.defaultCostCenterId)
          : undefined,
        payableAccountCode: form.payableAccountCode.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }
      const created = await createHrEmployee(payload)
      setSuccess('Empleado creado correctamente')
      if (onCreated && created) onCreated(created as HrEmployee)
      setTimeout(() => {
        closeWizard()
      }, 800)
    } catch (err: any) {
      console.error('Failed to create employee', err)
      setError(
        err?.response?.data?.message ??
          'No se pudo crear el empleado. Revisa la informacion.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Nuevo empleado</h2>
            <p className="text-sm text-gray-500">
              Completa los datos en dos pasos para registrar al colaborador.
            </p>
          </div>
          <button className="btn btn-sm" onClick={closeWizard}>
            Cerrar
          </button>
        </div>

        <ol className="mb-6 flex items-center gap-4 text-sm text-gray-600">
          <li className={step === 'general' ? 'font-semibold text-blue-600' : ''}>
            1. Datos generales
          </li>
          <li
            className={step === 'contable' ? 'font-semibold text-blue-600' : ''}
          >
            2. Parametrización contable
          </li>
        </ol>

        {error && <div className="mb-3 rounded bg-red-100 p-2 text-sm text-red-700">{error}</div>}
        {success && (
          <div className="mb-3 rounded bg-green-100 p-2 text-sm text-green-700">
            {success}
          </div>
        )}

        {step === 'general' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">ID del tercero</label>
              <input
                className="input input-bordered mt-1 w-full"
                placeholder="Ej: 102"
                value={form.thirdPartyId}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, thirdPartyId: e.target.value }))
                }
              />
              <p className="mt-1 text-xs text-gray-500">
                Debe existir previamente como tercero en el módulo de contactos.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Estado inicial</label>
              <select
                className="select select-bordered mt-1 w-full"
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    status: e.target.value as EmploymentStatus,
                  }))
                }
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Cargo</label>
              <input
                className="input input-bordered mt-1 w-full"
                value={form.jobTitle}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, jobTitle: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Área / Departamento</label>
              <input
                className="input input-bordered mt-1 w-full"
                value={form.department}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, department: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Fecha de ingreso</label>
              <input
                type="date"
                className="input input-bordered mt-1 w-full"
                value={form.hireDate}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, hireDate: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Fecha de retiro (opcional)</label>
              <input
                type="date"
                className="input input-bordered mt-1 w-full"
                value={form.terminationDate}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    terminationDate: e.target.value,
                  }))
                }
              />
            </div>
          </div>
        )}

        {step === 'contable' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">
                Centro de costos predeterminado
              </label>
              <input
                className="input input-bordered mt-1 w-full"
                placeholder="ID opcional"
                value={form.defaultCostCenterId}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    defaultCostCenterId: e.target.value,
                  }))
                }
              />
              <p className="mt-1 text-xs text-gray-500">
                Ingresa el ID del centro de costos que recibirá las provisiones.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Cuenta por pagar laboral</label>
              <input
                className="input input-bordered mt-1 w-full"
                placeholder="Ej: 25050501"
                value={form.payableAccountCode}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    payableAccountCode: e.target.value,
                  }))
                }
              />
              <p className="mt-1 text-xs text-gray-500">
                Debe corresponder a una cuenta detallada de pasivo (23xx o 25xx).
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Notas internas</label>
              <textarea
                className="textarea textarea-bordered mt-1 w-full"
                rows={3}
                value={form.notes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
              />
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            Paso {step === 'general' ? '1' : '2'} de 2
          </div>
          <div className="flex gap-2">
            {step === 'contable' && (
              <button className="btn btn-secondary btn-sm" onClick={goBack}>
                Atrás
              </button>
            )}
            {step === 'general' && (
              <button className="btn btn-sm" onClick={goNext}>
                Siguiente
              </button>
            )}
            {step === 'contable' && (
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Guardando…' : 'Crear empleado'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
