// Nueva página de empleados
'use client'

import Navbar from '@/components/Navbar'
import Protected from '@/components/Protected'
import SearchSelect from '@/components/SearchSelect'
import { api } from '@/lib/api'
import { useEffect, useMemo, useState } from 'react'

// Tipos
export type PartyType = 'CLIENT'|'PROVIDER'|'EMPLOYEE'|'OTHER'
export type Party = { id: number; name: string; type?: PartyType; roles?: PartyType[]; document?: string | null; email?: string | null; phone?: string | null }
export type Account = { id: number; code: string; name: string; type: string }

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Party[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<Party | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [amount, setAmount] = useState<string>('')
  const [note, setNote] = useState<string>('')

  // Cargar empleados y cuentas
  useEffect(() => {
    (async () => {
      const partiesRes = await api.get('/parties', { params: { role: 'EMPLOYEE' } })
      setEmployees(Array.isArray(partiesRes.data) ? partiesRes.data : [])
      // Filtrar cuentas para pagos de empleados (ejemplo: nómina, seguridad social)
      const accountsRes = await api.get('/accounts')
      setAccounts((Array.isArray(accountsRes.data) ? accountsRes.data : []).filter(
        acc => acc.type === 'NOMINA' || acc.type === 'SEG_SOCIAL'
      ))
    })()
  }, [])

  return (
    <Protected>
      <Navbar />
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Pagos a empleados</h1>
        <div className="mb-4">
          <label className="block mb-1 font-medium">Empleado</label>
          <SearchSelect
            options={employees.map(e => ({ value: e.id, label: e.name, sublabel: e.document || '' }))}
            value={selectedEmployee?.id || ''}
            onSelect={opt => {
              const emp = employees.find(e => e.id === opt?.value)
              setSelectedEmployee(emp || null)
            }}
            placeholder="Buscar empleado por nombre o documento"
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1 font-medium">Cuenta de pago</label>
          <SearchSelect
            options={accounts.map(a => ({ value: a.id, label: a.name, sublabel: a.code }))}
            value={selectedAccount?.id || ''}
            onSelect={opt => {
              const acc = accounts.find(a => a.id === opt?.value)
              setSelectedAccount(acc || null)
            }}
            placeholder="Buscar cuenta de nómina o seguridad social"
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1 font-medium">Monto</label>
          <input type="number" className="input input-bordered w-full" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div className="mb-4">
          <label className="block mb-1 font-medium">Concepto / Nota</label>
          <input type="text" className="input input-bordered w-full" value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={!selectedEmployee || !selectedAccount || !amount}>Registrar pago</button>
      </div>
    </Protected>
  )
}
