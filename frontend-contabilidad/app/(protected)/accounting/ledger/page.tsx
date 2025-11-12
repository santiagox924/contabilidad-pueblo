'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import SearchSelect from '@/components/SearchSelect'
import { LedgerResponse, RawLedgerResponse, normalizeLedgerResponse } from '@/lib/ledger'

interface Account {
  id: number
  code: string
  name: string
  nature: 'DEBIT' | 'CREDIT'
}

function fmtMoney(n: number) {
  return Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function firstDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function lastDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

export default function LedgerIndexPage() {
  const [from, setFrom] = useState<string>(firstDayOfMonth())
  const [to, setTo] = useState<string>(lastDayOfMonth())

  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)

  const [selectedAccountId, setSelectedAccountId] = useState<number | ''>('')
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)

  const [ledger, setLedger] = useState<LedgerResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cargar plan de cuentas para el selector
  useEffect(() => {
    const loadAccounts = async () => {
      setAccountsLoading(true)
      try {
        const res = await api.get<Account[]>('/accounts')
        setAccounts(res.data || [])
      } catch (err: any) {
        // Silencioso acá; si falla igual dejará el selector vacío
        console.error('Error loading accounts', err?.message || err)
      } finally {
        setAccountsLoading(false)
      }
    }
    loadAccounts()
  }, [])

  // Mantener `selectedAccount` sincronizado con el id elegido
  useEffect(() => {
    if (!selectedAccountId) {
      setSelectedAccount(null)
      return
    }
    const acc = accounts.find(a => String(a.id) === String(selectedAccountId)) || null
    setSelectedAccount(acc)
  }, [selectedAccountId, accounts])

  useEffect(() => {
    if (selectedAccount) {
      setError(null)
    }
  }, [selectedAccount])

  async function loadLedger() {
    if (!selectedAccount) {
      setError('Selecciona una cuenta contable para continuar.')
      setLedger(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<RawLedgerResponse>(`/accounting/ledger/${encodeURIComponent(selectedAccount.code)}`, {
        params: { from, to },
      })
      setLedger(normalizeLedgerResponse(res.data, selectedAccount.code))
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Error cargando el libro mayor')
      setLedger(null)
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    loadLedger()
  }

  const exportUrl = useMemo(() => {
    if (!selectedAccount) return '#'
    const qs = new URLSearchParams({ from, to }).toString()
    return `/accounting/export/ledger/${encodeURIComponent(selectedAccount.code)}.csv?${qs}`
  }, [selectedAccount, from, to])

  const opening = ledger?.opening ?? 0
  const ledgerLines = ledger?.lines ?? []
  const hasOpeningBalance = Math.abs(opening) > 0.00001
  const hasLines = ledgerLines.length > 0
  const canExport = !!ledger && (hasLines || hasOpeningBalance)
  const isEmpty = !loading && !hasLines && !hasOpeningBalance

  const totals = useMemo(() => {
    const lines = ledgerLines
    const debit = lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0)
    const credit = lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0)
    const finalBalance = lines.length ? lines[lines.length - 1].balance : opening
    return { debit, credit, finalBalance }
  }, [ledgerLines, opening])
  const closing = ledger?.closing ?? totals.finalBalance

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Libro mayor</h1>
            <p className="text-sm text-gray-500">
              Movimientos detallados por cuenta contable en el período seleccionado.
            </p>
            {ledger ? (
              <p className="text-xs text-gray-400">
                Cuenta: {ledger.account.code} — {ledger.account.name}
              </p>
            ) : null}
            <p className="text-xs text-gray-400">
              Período: {from} — {to}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={exportUrl}
              className={`btn btn-outline ${!canExport ? 'btn-disabled pointer-events-none opacity-50' : ''}`}
              title={!canExport ? 'No hay datos para exportar' : 'Exportar CSV'}
            >
              Exportar CSV
            </a>
            <Link href="/accounting" className="btn btn-ghost">Volver</Link>
          </div>
        </div>

        {/* Filtros */}
        <form onSubmit={onSubmit} className="mb-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Cuenta contable</label>
              <SearchSelect
                value={selectedAccountId || ''}
                options={accounts.map((a) => ({
                  value: a.id,
                  label: `${a.code} — ${a.name}`,
                  sublabel: a.nature === 'DEBIT' ? 'Naturaleza: Débito' : 'Naturaleza: Crédito',
                }))}
                placeholder={accountsLoading ? 'Cargando cuentas…' : 'Buscar por código o nombre…'}
                onSelect={(opt) => {
                  if (!opt) {
                    setSelectedAccountId('')
                    setSelectedAccount(null)
                    return
                  }
                  setSelectedAccountId(Number(opt.value))
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Desde</label>
                <input
                  type="date"
                  className="input input-bordered w-full rounded-xl"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Hasta</label>
                <input
                  type="date"
                  className="input input-bordered w-full rounded-xl"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Cargando…' : 'Ver movimientos'}
            </button>
            {!!selectedAccount && (
              <Link
                href={`/accounting/ledger/${encodeURIComponent(selectedAccount.code)}?from=${from}&to=${to}`}
                className="btn btn-outline"
                title="Abrir en página dedicada"
              >
                Abrir detalle
              </Link>
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
              {error}
            </div>
          )}
        </form>

        {/* Tabla */}
        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Fecha</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Descripción</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Doc/Ref</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Débito</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Crédito</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-gray-500">
                    Cargando…
                  </td>
                </tr>
              )}

              {!loading && ledger && hasOpeningBalance && (
                <tr className="bg-gray-50/60">
                  <td className="px-4 py-2 text-sm">—</td>
                  <td className="px-4 py-2 text-sm">Saldo inicial</td>
                  <td className="px-4 py-2 text-sm">-</td>
                  <td className="px-4 py-2 text-sm text-right">-</td>
                  <td className="px-4 py-2 text-sm text-right">-</td>
                  <td className="px-4 py-2 text-sm text-right font-semibold">{fmtMoney(opening)}</td>
                </tr>
              )}

              {!loading && ledgerLines.map((ln, idx) => (
                <tr key={`${ln.date}-${idx}`}>
                  <td className="px-4 py-2 text-sm">{ln.date}</td>
                  <td className="px-4 py-2 text-sm">{ln.description || '-'}</td>
                  <td className="px-4 py-2 text-sm">{ln.docRef || '-'}</td>
                  <td className="px-4 py-2 text-sm text-right">{fmtMoney(ln.debit)}</td>
                  <td className="px-4 py-2 text-sm text-right">{fmtMoney(ln.credit)}</td>
                  <td className="px-4 py-2 text-sm text-right">{fmtMoney(ln.balance)}</td>
                </tr>
              ))}

              {isEmpty && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-gray-500">
                    {selectedAccount ? 'No hay movimientos para el rango seleccionado.' : 'Selecciona una cuenta y un rango para ver movimientos.'}
                  </td>
                </tr>
              )}
            </tbody>

            {/* Totales */}
            {!loading && (hasLines || hasOpeningBalance) ? (
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-4 py-2 text-sm font-medium" colSpan={3}>Totales</td>
                  <td className="px-4 py-2 text-sm text-right font-semibold">{fmtMoney(totals.debit)}</td>
                  <td className="px-4 py-2 text-sm text-right font-semibold">{fmtMoney(totals.credit)}</td>
                  <td className="px-4 py-2 text-sm text-right text-gray-600">{fmtMoney(totals.finalBalance)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-sm" colSpan={5}>Saldo final</td>
                  <td className="px-4 py-2 text-sm text-right font-semibold">{fmtMoney(closing)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </main>
    </Protected>
  )
}
