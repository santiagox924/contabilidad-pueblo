"use client"

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import {
  HrEmployee,
  getHrEmployee,
  createHrAffiliation,
  deleteHrAffiliation,
  listHrAffiliations,
  closeHrContract,
  deleteHrContract,
  deactivateHrEmployee,
  deleteHrEmployee,
} from '@/lib/hr'
import { listPaymentMethods } from '@/lib/treasury'
import NewPaymentMethodModal from '@/components/NewPaymentMethodModal'
import { listPayrollRuns, listPayrollPayments, payPayroll } from '@/lib/payroll'
import { buildPaymentLines } from '@/lib/payroll-lines'

type TabKey = 'summary' | 'contracts' | 'affiliations' | 'payroll'

type PayrollRunRow = {
  id: number
  periodLabel: string
  status: string
  grossAmount: number
  deductionsAmount: number
  netAmount: number
}

type PayrollPaymentRow = {
  paymentEntryId: number
  date: string | null
  amount: number
  concept: string
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  SUSPENDED: 'Suspendido',
  TERMINATED: 'Terminado',
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-gray-100 text-gray-700',
  SUSPENDED: 'bg-yellow-100 text-yellow-800',
  TERMINATED: 'bg-red-100 text-red-700',
}

const formatCurrency = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return '-'
  const n = Number(value)
  if (Number.isNaN(n)) return String(value)
  return n.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  })
}

const formatDate = (value?: string | null) => {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('es-CO')
}

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'summary', label: 'Resumen' },
  { key: 'contracts', label: 'Contratos' },
  { key: 'affiliations', label: 'Afiliaciones' },
  { key: 'payroll', label: 'Nómina y pagos' },
]

export default function DetalleEmpleado({ empleadoId }: { empleadoId: string }) {
  const [empleado, setEmpleado] = useState<HrEmployee | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('summary')

  const [payrollRuns, setPayrollRuns] = useState<PayrollRunRow[]>([])
  const [payrollPayments, setPayrollPayments] = useState<PayrollPaymentRow[]>([])
  const [affiliations, setAffiliations] = useState<any[]>([])

  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentMethods, setPaymentMethods] = useState<Array<any>>([])
  const [bankAccounts, setBankAccounts] = useState<Array<any>>([])
  const [cashAccounts, setCashAccounts] = useState<Array<any>>([])

  const [payAmount, setPayAmount] = useState(0)
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payConcept, setPayConcept] = useState('Pago nómina')
  const [payBankAccount, setPayBankAccount] = useState('')
  const [selectedMethodId, setSelectedMethodId] = useState<number | ''>('')
  const [isPaySubmitting, setIsPaySubmitting] = useState(false)

  const [message, setMessage] = useState<string | null>(null)

  const loadEmployee = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const numericId = Number(empleadoId)
      const data = await getHrEmployee(numericId, {
        includeContracts: true,
        includeAffiliations: true,
      })
      setEmpleado(data)
      const key = data.thirdParty?.id ?? data.id
      const [runs, payments, affs] = await Promise.all([
        listPayrollRuns({ employeeId: key }),
        listPayrollPayments({ employeeId: key }),
        listHrAffiliations(key),
      ])
      setPayrollRuns(Array.isArray(runs) ? runs : [])
      setPayrollPayments(Array.isArray(payments) ? payments : [])
      setAffiliations(Array.isArray(affs) ? affs : [])
    } catch (err: any) {
      console.error('Failed to load employee', err)
      setError(
        err?.response?.data?.message ||
          'No se pudo cargar la información del empleado',
      )
    } finally {
      setLoading(false)
    }
  }, [empleadoId])

  useEffect(() => {
    void loadEmployee()
  }, [loadEmployee])

  useEffect(() => {
    ;(async () => {
      try {
        const accounts = await api.get('/accounts')
        const data = Array.isArray(accounts.data) ? accounts.data : []
        setBankAccounts(data.filter((a: any) => a.isBank))
        setCashAccounts(data.filter((a: any) => a.isCash))
      } catch (err) {
        console.warn('No se pudieron cargar cuentas', err)
      }
      try {
        const methods = await listPaymentMethods({ active: true })
        setPaymentMethods(methods)
      } catch (err) {
        console.warn('No se pudieron cargar métodos de pago', err)
      }
    })()
  }, [])

  if (loading) return <div>Cargando…</div>
  if (error) return <div className="text-red-600">{error}</div>
  if (!empleado || !empleado.thirdParty)
    return <div>No se encontró el empleado solicitado.</div>

  return (
    <div>
      <nav className="mb-2 text-sm text-gray-600">
        <Link href="/empleados" className="hover:underline">
          Empleados
        </Link>
        <span className="mx-2">/</span>
        <span>{empleado.thirdParty.name}</span>
      </nav>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Perfil de empleado</h1>
        <div className="flex flex-wrap gap-2">
          <Link href={`/empleados/${empleado.thirdParty.id}/edit`} className="btn btn-sm">
            Editar
          </Link>
          <Link
            href={`/empleados/${empleado.thirdParty.id}/contratos`}
            className="btn btn-sm"
          >
            Contratos
          </Link>
          <Link
            href={`/empleados/${empleado.thirdParty.id}/nomina`}
            className="btn btn-sm"
          >
            Nómina
          </Link>
          <button className="btn btn-sm bg-blue-600 text-white" onClick={() => setShowPaymentModal(true)}>
            Registrar pago
          </button>
        </div>
      </header>

      {message && (
        <div className="mb-3 rounded bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      )}

      <div className="mb-4 flex gap-2 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`btn btn-sm ${activeTab === tab.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        {activeTab === 'summary' && (
          <div className="grid gap-4 md:grid-cols-2">
            <InfoItem label="Nombre" value={empleado.thirdParty.name} />
            <InfoItem
              label="Documento"
              value={empleado.thirdParty.document ?? '-'}
            />
            <InfoItem label="Cargo" value={empleado.jobTitle ?? '-'} />
            <InfoItem label="Área" value={empleado.department ?? '-'} />
            <InfoItem
              label="Estado"
              value={
                <span
                  className={`inline-flex rounded px-2 py-1 text-sm ${STATUS_BADGE[empleado.status] ?? 'bg-gray-100 text-gray-700'}`}
                >
                  {STATUS_LABEL[empleado.status] ?? empleado.status}
                </span>
              }
            />
            <InfoItem label="Ingreso" value={formatDate(empleado.hireDate)} />
            <InfoItem
              label="Retiro"
              value={formatDate(empleado.terminationDate)}
            />
            <InfoItem
              label="Cuenta por pagar"
              value={empleado.payableAccountCode ?? 'Sin parametrizar'}
            />
          </div>
        )}
        {activeTab === 'contracts' && (
          <ContractsSection
            contracts={empleado.contracts ?? []}
            onClose={async (id) => {
              await closeHrContract(id)
              await loadEmployee()
            }}
            onDelete={async (id) => {
              await deleteHrContract(id)
              await loadEmployee()
            }}
          />
        )}
        {activeTab === 'affiliations' && (
          <AffiliationsSection
            employeeId={empleado.thirdParty.id}
            affiliations={affiliations}
            onDelete={async (id) => {
              await deleteHrAffiliation(id)
              await loadEmployee()
            }}
            onCreate={async (payload) => {
              await createHrAffiliation(empleado.thirdParty.id, payload)
              await loadEmployee()
            }}
          />
        )}
        {activeTab === 'payroll' && (
          <PayrollSection runs={payrollRuns} payments={payrollPayments} />
        )}
      </section>

      {showPaymentModal && (
        <PaymentModal
          employee={empleado}
          bankAccounts={bankAccounts}
          cashAccounts={cashAccounts}
          paymentMethods={paymentMethods}
          selectedMethodId={selectedMethodId}
          payAmount={payAmount}
          payDate={payDate}
          payConcept={payConcept}
          payBankAccount={payBankAccount}
          isSubmitting={isPaySubmitting}
          onClose={() => setShowPaymentModal(false)}
          onChange={(state) => {
            setPayAmount(state.amount)
            setPayDate(state.date)
            setPayConcept(state.concept)
            setPayBankAccount(state.bankAccount)
            setSelectedMethodId(state.methodId)
          }}
          onSubmit={async () => {
            if (!payAmount || payAmount <= 0) {
              alert('Monto inválido')
              return
            }
            setIsPaySubmitting(true)
            try {
              const lines = buildPaymentLines({
                employeeId: empleado.thirdParty.id,
                amount: payAmount,
                bankAccountCode: payBankAccount,
              })
              await payPayroll({
                employeeId: empleado.thirdParty.id,
                date: payDate,
                description: payConcept,
                paymentMethodId:
                  selectedMethodId === '' ? undefined : Number(selectedMethodId),
                lines,
              })
              setShowPaymentModal(false)
              setPayAmount(0)
              setMessage('Pago de nómina registrado correctamente')
              await loadEmployee()
            } catch (err: any) {
              console.error(err)
              alert(
                'Error al registrar pago: ' +
                  (err?.response?.data?.message ?? err?.message ?? 'unknown'),
              )
            } finally {
              setIsPaySubmitting(false)
            }
          }}
        />
      )}
    </div>
  )
}

type InfoItemProps = { label: string; value: React.ReactNode }

function InfoItem({ label, value }: InfoItemProps) {
  return (
    <div>
      <div className="text-sm text-gray-600">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  )
}

type ContractsProps = {
  contracts: HrEmployee['contracts']
  onClose: (id: number) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

function ContractsSection({ contracts = [], onClose, onDelete }: ContractsProps) {
  if (!contracts.length) {
    return <div className="rounded bg-gray-50 p-4">No hay contratos registrados.</div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
              Código
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
              Tipo
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
              Salario
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
              Inicio
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
              Fin
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
              Estado
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {contracts.map((c) => (
            <tr key={c!.id}>
              <td className="px-4 py-2 text-sm">{c!.code || '-'}</td>
              <td className="px-4 py-2 text-sm">{c!.contractType}</td>
              <td className="px-4 py-2 text-sm text-right">
                {formatCurrency(c!.salaryAmount)}
              </td>
              <td className="px-4 py-2 text-sm">{formatDate(c!.startDate)}</td>
              <td className="px-4 py-2 text-sm">{formatDate(c!.endDate)}</td>
              <td className="px-4 py-2 text-sm">
                {c!.isActive ? (
                  <span className="text-green-700">Vigente</span>
                ) : (
                  <span className="text-gray-600">Finalizado</span>
                )}
              </td>
              <td className="px-4 py-2 text-sm text-right space-x-2">
                {c!.isActive && (
                  <button className="btn btn-xs" onClick={() => onClose(c!.id)}>
                    Cerrar
                  </button>
                )}
                <button className="btn btn-xs btn-error" onClick={() => onDelete(c!.id)}>
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
