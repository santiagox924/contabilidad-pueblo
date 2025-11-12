"use client"
import { useEffect, useState } from "react"
import { listHrEmployees } from "@/lib/hr"
import {
  listPayrollRuns,
  listPayrollPayments,
  recognizePayroll,
  payPayroll,
  payContributions,
  registerAdvance,
} from "@/lib/payroll"
import {
  buildRecognitionLines,
  buildPaymentLines,
  buildContributionLines,
  buildAdvanceLines,
  RecognitionFormState,
} from "@/lib/payroll-lines"

type PayrollRunRow = {
  id: number
  periodLabel: string
  employeeName: string
  netAmount: number
  status: string
}

type PayrollPaymentRow = {
  paymentEntryId: number
  employeeName: string
  date: string | null
  amount: number
  concept: string
}

const toNumber = (value: any) => {
  const n = Number(value)
  return Number.isNaN(n) ? 0 : n
}

const formatCurrency = (value: any) => {
  const n = Number(value) || 0
  return n.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  })
}

export default function NominaPagos() {
  const [runs, setRuns] = useState<PayrollRunRow[]>([])
  const [payments, setPayments] = useState<PayrollPaymentRow[]>([])
  const [employees, setEmployees] = useState<Array<{ thirdPartyId: number; name: string }>>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [previewLines, setPreviewLines] = useState<any[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewDate, setPreviewDate] = useState("")

  const [formEmployeeId, setFormEmployeeId] = useState<number | null>(null)
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10))
  const [formDescription, setFormDescription] = useState("Reconocimiento")
  const [salary, setSalary] = useState(0)
  const [eps, setEps] = useState(0)
  const [pension, setPension] = useState(0)
  const [arl, setArl] = useState(0)
  const [ccf, setCcf] = useState(0)
  const [retention, setRetention] = useState(0)
  const [salaryPayable, setSalaryPayable] = useState(0)
  const [autoRetention, setAutoRetention] = useState(false)
  const [withholdingRate, setWithholdingRate] = useState(0.01)
  const [bankAccountCode, setBankAccountCode] = useState("111005")
  const [paymentAmount, setPaymentAmount] = useState(0)
  const [advanceAmount, setAdvanceAmount] = useState(0)

  useEffect(() => {
    ;(async () => {
      const [runsRes, paymentsRes, employeesRes] = await Promise.all([
        listPayrollRuns(),
        listPayrollPayments(),
        listHrEmployees(),
      ])
      setRuns(Array.isArray(runsRes) ? runsRes : [])
      setPayments(Array.isArray(paymentsRes) ? paymentsRes : [])
      setEmployees(
        (Array.isArray(employeesRes) ? employeesRes : []).map((emp: any) => ({
          thirdPartyId: emp.thirdParty?.id ?? emp.id,
          name: emp.thirdParty?.name ?? emp.name ?? `Empleado ${emp.id}`,
        })),
      )
    })()
  }, [])

  const buildSimplePayload = (): RecognitionFormState => ({
    employeeId: formEmployeeId ?? undefined,
    salary,
    salaryPayable,
    retention,
    eps,
    pension,
    arl,
    ccf,
    autoCalculateRetention: autoRetention,
    withholdingRate,
  })

  const refreshData = async () => {
    const [runsRes, paymentsRes] = await Promise.all([
      listPayrollRuns(),
      listPayrollPayments(),
    ])
    setRuns(Array.isArray(runsRes) ? runsRes : [])
    setPayments(Array.isArray(paymentsRes) ? paymentsRes : [])
  }

  const submitRecognition = async () => {
    const lines = buildRecognitionLines(buildSimplePayload())
    await recognizePayroll({
      employeeId: formEmployeeId ?? undefined,
      date: formDate,
      description: formDescription,
      lines,
    })
  }

  const submitPayment = async () => {
    const amount = paymentAmount || salaryPayable
    if (!amount || amount <= 0) throw new Error('Monto de pago inválido')
    const lines = buildPaymentLines({
      employeeId: formEmployeeId ?? undefined,
      amount,
      bankAccountCode,
    })
    await payPayroll({
      employeeId: formEmployeeId ?? undefined,
      date: formDate,
      description: formDescription,
      lines,
    })
  }

  const submitContributions = async () => {
    const lines = buildContributionLines({
      employeeId: formEmployeeId ?? undefined,
      eps,
      pension,
      arl,
      ccf,
      bankAccountCode,
    })
    await payContributions({
      employeeId: formEmployeeId ?? undefined,
      date: formDate,
      description: formDescription,
      lines,
    })
  }

  const submitAdvance = async () => {
    const amount = advanceAmount
    if (!amount || amount <= 0) throw new Error('Monto de anticipo inválido')
    const lines = buildAdvanceLines({ amount, bankAccountCode })
    await registerAdvance({
      employeeId: formEmployeeId ?? undefined,
      date: formDate,
      description: formDescription,
      lines,
    })
  }

  const handleAction = async (action: 'recognition' | 'payment' | 'contribution' | 'advance') => {
    try {
      setIsSubmitting(true)
      if (action === 'recognition') await submitRecognition()
      if (action === 'payment') await submitPayment()
      if (action === 'contribution') await submitContributions()
      if (action === 'advance') await submitAdvance()
      await refreshData()
      alert('Operación registrada correctamente')
      setIsSubmitting(false)
      setPreviewOpen(false)
    } catch (err: any) {
      console.error(err)
      setIsSubmitting(false)
      alert('Error: ' + (err?.message ?? 'unknown'))
    }
  }

  const handlePreview = () => {
    const lines = buildRecognitionLines(buildSimplePayload())
    setPreviewLines(lines)
    setPreviewDate(formDate)
    setPreviewOpen(true)
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Nómina y pagos</h1>

      <h2 className="font-semibold mb-2">Nóminas</h2>
      <table className="table-auto w-full mb-4">
        <thead>
          <tr>
            <th>Periodo</th>
            <th>Empleado</th>
            <th>Neto</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>{run.periodLabel}</td>
              <td>{run.employeeName}</td>
              <td>{formatCurrency(run.netAmount)}</td>
              <td>{run.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 border p-4 rounded">
        <h3 className="font-semibold mb-2">Nueva operacion</h3>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-sm">Empleado</label>
            <select
              className="w-full border p-1"
              value={formEmployeeId ?? ''}
              onChange={(e) => setFormEmployeeId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">(sin seleccionar)</option>
              {employees.map((emp) => (
                <option key={emp.thirdPartyId} value={emp.thirdPartyId}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm">Fecha</label>
            <input
              type="date"
              className="w-full border p-1"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm">Descripción</label>
            <input
              className="w-full border p-1"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <div>
            <label className="block text-sm">Salario</label>
            <input
              type="number"
              className="w-full border p-1"
              value={salary}
              onChange={(e) => setSalary(toNumber(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm">EPS</label>
            <input
              type="number"
              className="w-full border p-1"
              value={eps}
              onChange={(e) => setEps(toNumber(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm">Pension</label>
            <input
              type="number"
              className="w-full border p-1"
              value={pension}
              onChange={(e) => setPension(toNumber(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm">ARL</label>
            <input
              type="number"
              className="w-full border p-1"
              value={arl}
              onChange={(e) => setArl(toNumber(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm">CCF</label>
            <input
              type="number"
              className="w-full border p-1"
              value={ccf}
              onChange={(e) => setCcf(toNumber(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm">Retención</label>
            <input
              type="number"
              className="w-full border p-1"
              value={retention}
              onChange={(e) => setRetention(toNumber(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm">Salarios por pagar</label>
            <input
              type="number"
              className="w-full border p-1"
              value={salaryPayable}
              onChange={(e) => setSalaryPayable(toNumber(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm">Cuenta banco/caja</label>
            <input
              className="w-full border p-1"
              value={bankAccountCode}
              onChange={(e) => setBankAccountCode(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm">Pago neto</label>
            <input
              type="number"
              className="w-full border p-1"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(toNumber(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm">Anticipo</label>
            <input
              type="number"
              className="w-full border p-1"
              value={advanceAmount}
              onChange={(e) => setAdvanceAmount(toNumber(e.target.value))}
            />
          </div>
          <div className="col-span-3 flex items-center gap-2">
            <input
              id="autoRetention"
              type="checkbox"
              checked={autoRetention}
              onChange={(e) => setAutoRetention(e.target.checked)}
            />
            <label htmlFor="autoRetention" className="text-sm">
              Calcular retención automáticamente (usa salario + deducciones)
            </label>
          </div>
          {autoRetention && (
            <div>
              <label className="block text-sm">Tasa retención</label>
              <input
                type="number"
                step="0.01"
                className="w-full border p-1"
                value={withholdingRate}
                onChange={(e) => setWithholdingRate(Number(e.target.value))}
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={() => handleAction('recognition')} disabled={isSubmitting}>
            {isSubmitting ? 'Enviando…' : 'Registrar reconocimiento'}
          </button>
          <button className="btn btn-secondary" onClick={handlePreview} disabled={isSubmitting}>
            Previsualizar
          </button>
          <button className="btn btn-secondary" onClick={() => handleAction('payment')} disabled={isSubmitting}>
            {isSubmitting ? 'Enviando…' : 'Registrar pago'}
          </button>
          <button className="btn btn-secondary" onClick={() => handleAction('contribution')} disabled={isSubmitting}>
            {isSubmitting ? 'Enviando…' : 'Registrar aportes'}
          </button>
          <button className="btn btn-secondary" onClick={() => handleAction('advance')} disabled={isSubmitting}>
            {isSubmitting ? 'Enviando…' : 'Registrar anticipo'}
          </button>
        </div>
      </div>

      {previewOpen && (
        <div className="mt-4 border p-4 rounded bg-white">
          <div className="flex items-start justify-between">
            <h3 className="font-semibold">Previsualización del asiento</h3>
            <div className="text-sm text-slate-600">Fecha: {previewDate}</div>
          </div>
          <table className="w-full text-sm mt-2">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th>Cuenta</th>
                <th className="text-right">Debe</th>
                <th className="text-right">Haber</th>
              </tr>
            </thead>
            <tbody>
              {previewLines.map((line, idx) => (
                <tr key={idx} className="border-t">
                  <td className="py-1">{line.accountCode}</td>
                  <td className="py-1 text-right">{line.debit ? formatCurrency(line.debit) : ''}</td>
                  <td className="py-1 text-right">{line.credit ? formatCurrency(line.credit) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex gap-2">
            <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={() => handleAction('recognition')} disabled={isSubmitting}>
              Registrar desde previsualización
            </button>
            <button className="px-3 py-1 bg-slate-200 rounded" onClick={() => setPreviewOpen(false)}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      <h2 className="font-semibold mb-2 mt-6">Pagos</h2>
      <table className="table-auto w-full mb-4">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Empleado</th>
            <th>Concepto</th>
            <th>Monto</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.paymentEntryId}>
              <td>{p.date ?? '-'}</td>
              <td>{p.employeeName}</td>
              <td>{p.concept}</td>
              <td>{formatCurrency(p.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
