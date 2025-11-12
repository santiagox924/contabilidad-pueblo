'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import SearchSelect from '@/components/SearchSelect'
import { api } from '@/lib/api'
import {
  buildAuxLedgerThirdPartyExportUrl,
  fetchAuxLedgerByThirdParty,
  type AuxLedgerThirdPartyQueryParams,
  type AuxLedgerRow,
  type AuxLedgerThirdPartyResponse,
  type JournalStatus,
} from '@/lib/accounting-reports'
import { listJournalCatalog, type JournalCatalogItem } from '@/lib/journals'

interface AccountOption {
  id: number
  code: string
  name: string
  nature: 'DEBIT' | 'CREDIT'
}

interface PartyOption {
  id: number
  name: string
  document?: string | null
}

const statusOptions: Array<{ value: JournalStatus | ''; label: string }> = [
  { value: '', label: 'Todos los estados' },
  { value: 'POSTED', label: 'Contabilizados' },
  { value: 'DRAFT', label: 'Borradores' },
  { value: 'REVERSED', label: 'Reversados' },
]

function firstDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function lastDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

function fmtMoney(value?: number) {
  return Number(value || 0).toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function sanitizeNumber(input: string | number | '') {
  if (typeof input === 'number') return Number.isFinite(input) ? input : undefined
  const trimmed = String(input ?? '').trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

function buildFilters(params: {
  from: string
  to: string
  status: JournalStatus | ''
  journalCode: string
  accountCode: string
  costCenterId: string
  thirdPartyId: number | ''
}): AuxLedgerThirdPartyQueryParams | null {
  if (typeof params.thirdPartyId !== 'number') return null
  const filters: AuxLedgerThirdPartyQueryParams = {
    from: params.from,
    to: params.to,
    thirdPartyId: params.thirdPartyId,
  }
  if (params.status) filters.status = params.status
  if (params.journalCode.trim()) filters.journalCode = params.journalCode.trim().toUpperCase()
  if (params.accountCode.trim()) filters.accountCode = params.accountCode.trim()
  const costCenterId = sanitizeNumber(params.costCenterId)
  if (costCenterId !== undefined) filters.costCenterId = costCenterId
  return filters
}

export default function AuxLedgerThirdPartyPage() {
  const [from, setFrom] = useState(firstDayOfMonth())
  const [to, setTo] = useState(lastDayOfMonth())
  const [status, setStatus] = useState<JournalStatus | ''>('POSTED')
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [selectedAccountCode, setSelectedAccountCode] = useState('')
  const [thirdParties, setThirdParties] = useState<PartyOption[]>([])
  const [loadingParties, setLoadingParties] = useState(false)
  const [selectedThirdPartyId, setSelectedThirdPartyId] = useState<number | ''>('')
  const [journals, setJournals] = useState<JournalCatalogItem[]>([])
  const [loadingJournals, setLoadingJournals] = useState(false)
  const [selectedJournalCode, setSelectedJournalCode] = useState('')
  const [costCenterId, setCostCenterId] = useState('')
  const [report, setReport] = useState<AuxLedgerThirdPartyResponse | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadAccounts = async () => {
      setLoadingAccounts(true)
      try {
        const { data } = await api.get<AccountOption[]>('/accounts')
        const rows = Array.isArray(data)
          ? data.map((acc: any) => ({
              id: Number(acc.id ?? acc.code ?? Math.random()),
              code: String(acc.code ?? ''),
              name: String(acc.name ?? ''),
              nature: (acc.nature === 'C' ? 'CREDIT' : 'DEBIT') as 'CREDIT' | 'DEBIT',
            }))
          : []
        setAccountOptions(rows)
      } catch (err) {
        console.warn('No se pudo cargar el plan de cuentas', err)
      } finally {
        setLoadingAccounts(false)
      }
    }

    const loadParties = async () => {
      setLoadingParties(true)
      try {
        const { data } = await api.get('/parties')
        const rows = Array.isArray(data)
          ? data.map((p: any) => ({
              id: Number(p.id ?? 0),
              name: String(p.name ?? ''),
              document: p.document ?? null,
            }))
          : []
        setThirdParties(rows)
      } catch (err) {
        console.warn('No se pudo cargar la lista de terceros', err)
      } finally {
        setLoadingParties(false)
      }
    }

    const loadJournals = async () => {
      setLoadingJournals(true)
      try {
        const rows = await listJournalCatalog()
        setJournals(rows)
      } catch (err) {
        console.warn('No se pudo cargar el catalogo de diarios', err)
      } finally {
        setLoadingJournals(false)
      }
    }

    loadAccounts()
    loadParties()
    loadJournals()
  }, [])

  const filters = useMemo<AuxLedgerThirdPartyQueryParams | null>(() =>
    buildFilters({
      from,
      to,
      status,
      journalCode: selectedJournalCode,
      accountCode: selectedAccountCode,
      costCenterId,
      thirdPartyId: selectedThirdPartyId,
    }),
  [from, to, status, selectedJournalCode, selectedAccountCode, costCenterId, selectedThirdPartyId])

  const exportCsvUrl = useMemo(() => {
    if (!filters) return '#'
    return buildAuxLedgerThirdPartyExportUrl({ ...filters, format: 'csv' })
  }, [filters])

  const exportXlsxUrl = useMemo(() => {
    if (!filters) return '#'
    return buildAuxLedgerThirdPartyExportUrl({ ...filters, format: 'xlsx' })
  }, [filters])

  async function loadReport() {
    if (!filters) {
      setError('Selecciona un tercero para consultar el auxiliar.')
      setReport(null)
      return
    }
    setLoadingReport(true)
    setError(null)
    try {
  const data = await fetchAuxLedgerByThirdParty(filters)
      setReport(data)
    } catch (err: any) {
      setReport(null)
      setError(err?.response?.data?.message || err?.message || 'No se pudo cargar el auxiliar por tercero')
    } finally {
      setLoadingReport(false)
    }
  }

  const totals = useMemo(() => {
    if (!report) return { debit: 0, credit: 0 }
    return {
      debit: Number(report.totals?.debit || 0),
      credit: Number(report.totals?.credit || 0),
    }
  }, [report])

  const rows = report?.rows ?? []

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
  <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Auxiliar por tercero</h1>
            <p className="text-sm text-gray-500">
              Consolida saldos y movimientos del tercero a traves de todas las cuentas contables involucradas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={exportXlsxUrl} className={`btn btn-outline ${!filters ? 'btn-disabled pointer-events-none opacity-50' : ''}`}>
              Exportar XLSX
            </a>
            <a href={exportCsvUrl} className={`btn btn-outline ${!filters ? 'btn-disabled pointer-events-none opacity-50' : ''}`}>
              Exportar CSV
            </a>
            <Link href="/accounting" className="btn btn-ghost">Volver</Link>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            loadReport()
          }}
          className="mb-5 grid grid-cols-1 gap-4 rounded-2xl border bg-white p-5 shadow-sm md:grid-cols-4"
        >
          <div>
            <label className="mb-1 block text-sm font-medium">Desde</label>
            <input
              type="date"
              className="input input-bordered w-full rounded-xl"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Hasta</label>
            <input
              type="date"
              className="input input-bordered w-full rounded-xl"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Estado</label>
            <select
              className="input input-bordered w-full rounded-xl"
              value={status}
              onChange={(e) => setStatus(e.target.value as JournalStatus | '')}
            >
              {statusOptions.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Diario</label>
            <select
              className="input input-bordered w-full rounded-xl"
              value={selectedJournalCode}
              onChange={(e) => setSelectedJournalCode(e.target.value)}
              disabled={loadingJournals}
            >
              <option value="">Todos</option>
              {journals.map((j) => (
                <option key={j.id} value={j.code}>
                  {j.code} — {j.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Tercero</label>
            <SearchSelect
              value={selectedThirdPartyId || ''}
              options={thirdParties.map((p) => ({
                value: p.id,
                label: p.name,
                sublabel: p.document ?? undefined,
              }))}
              placeholder={loadingParties ? 'Cargando terceros…' : 'Buscar tercero…'}
              onSelect={(opt) => {
                if (!opt) {
                  setSelectedThirdPartyId('')
                  return
                }
                const id = Number(opt.value)
                setSelectedThirdPartyId(Number.isFinite(id) ? id : '')
              }}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Cuenta (filtrar opcional)</label>
            <SearchSelect
              value={selectedAccountCode || ''}
              options={accountOptions.map((acc) => ({
                value: acc.code,
                label: `${acc.code} — ${acc.name}`,
                sublabel: acc.nature === 'DEBIT' ? 'Naturaleza: Débito' : 'Naturaleza: Crédito',
              }))}
              placeholder={loadingAccounts ? 'Cargando cuentas…' : 'Buscar por código o nombre…'}
              onSelect={(opt) => {
                if (!opt) {
                  setSelectedAccountCode('')
                  return
                }
                setSelectedAccountCode(String(opt.value))
              }}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Centro de costo (ID)</label>
            <input
              type="number"
              className="input input-bordered w-full rounded-xl"
              placeholder="Opcional"
              value={costCenterId}
              onChange={(e) => setCostCenterId(e.target.value)}
            />
          </div>

          <div className="flex items-end">
            <button type="submit" className="btn btn-primary w-full" disabled={loadingReport}>
              {loadingReport ? 'Cargando…' : 'Buscar'}
            </button>
          </div>
        </form>

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {report && (
          <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-2xl border bg-white p-4 shadow-sm md:col-span-2">
              <p className="text-sm text-gray-500">Tercero</p>
              <p className="text-lg font-semibold">{report.thirdParty?.name ?? '—'}</p>
              {report.thirdParty?.document && (
                <p className="text-sm text-gray-600">Documento: {report.thirdParty.document}</p>
              )}
            </div>
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">Débito</p>
              <p className="text-2xl font-semibold">${fmtMoney(totals.debit)}</p>
            </div>
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">Crédito</p>
              <p className="text-2xl font-semibold">${fmtMoney(totals.credit)}</p>
            </div>
          </div>
        )}

        {report && (report.openings?.length || report.closings?.length) ? (
          <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {report.openings?.length ? (
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <p className="mb-2 text-sm font-medium text-gray-600">Saldos iniciales por cuenta</p>
                <ul className="space-y-1 text-sm">
                  {report.openings.map((item) => (
                    <li key={`open-${item.accountCode}`} className="flex items-center justify-between">
                      <span>{item.accountCode}</span>
                      <span className="font-semibold">${fmtMoney(item.opening)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {report.closings?.length ? (
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <p className="mb-2 text-sm font-medium text-gray-600">Saldos finales por cuenta</p>
                <ul className="space-y-1 text-sm">
                  {report.closings.map((item) => (
                    <li key={`close-${item.accountCode}`} className="flex items-center justify-between">
                      <span>{item.accountCode}</span>
                      <span className="font-semibold">${fmtMoney(item.closing)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Fecha</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Cuenta</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Comprobante</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Fuente</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Descripción</th>
                <th className="px-3 py-2 text-right text-sm font-medium text-gray-600">Débito</th>
                <th className="px-3 py-2 text-right text-sm font-medium text-gray-600">Crédito</th>
                <th className="px-3 py-2 text-right text-sm font-medium text-gray-600">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadingReport && (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-center text-sm text-gray-500">
                    Cargando…
                  </td>
                </tr>
              )}

              {!loadingReport && rows.map((row: AuxLedgerRow) => (
                <tr key={`${row.accountCode}-${row.lineId}`}>
                  <td className="px-3 py-2 text-sm">{formatDate(row.entryDate)}</td>
                  <td className="px-3 py-2 text-sm">
                    <div className="font-medium">{row.accountCode}</div>
                    <div className="text-xs text-gray-500">{row.accountName}</div>
                  </td>
                  <td className="px-3 py-2 text-sm">
                    <div>{row.entryNumber ?? '-'}</div>
                    <div className="text-xs text-gray-500">{row.entryStatus}</div>
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {row.sourceType ? `${row.sourceType}${row.sourceId ? `#${row.sourceId}` : ''}` : '-'}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    <div>{row.lineDescription || '-'}</div>
                    {row.entryDescription && (
                      <div className="text-xs text-gray-500">{row.entryDescription}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm text-right">{fmtMoney(row.debit)}</td>
                  <td className="px-3 py-2 text-sm text-right">{fmtMoney(row.credit)}</td>
                  <td className="px-3 py-2 text-sm text-right font-semibold">{fmtMoney(row.balance)}</td>
                </tr>
              ))}

              {!loadingReport && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-500">
                    {filters ? 'No hay movimientos para el tercero en el periodo indicado.' : 'Selecciona un tercero para ver sus movimientos.'}
                  </td>
                </tr>
              )}
            </tbody>
            {!loadingReport && rows.length > 0 && (
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={5} className="px-3 py-2 text-sm font-medium">
                    Totales
                  </td>
                  <td className="px-3 py-2 text-sm text-right font-semibold">{fmtMoney(totals.debit)}</td>
                  <td className="px-3 py-2 text-sm text-right font-semibold">{fmtMoney(totals.credit)}</td>
                  <td className="px-3 py-2 text-sm text-right font-semibold">
                    {fmtMoney(rows.length ? rows[rows.length - 1].balance : 0)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </main>
    </Protected>
  )
}
