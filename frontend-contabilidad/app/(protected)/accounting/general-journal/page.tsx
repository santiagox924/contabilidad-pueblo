'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import SearchSelect from '@/components/SearchSelect'
import { api } from '@/lib/api'
import {
  buildGeneralJournalExportUrl,
  fetchGeneralJournal,
  type GeneralJournalResponse,
  type GeneralJournalRow,
  type GeneralJournalFilters,
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

function formatSource(row: GeneralJournalRow) {
  if (!row.sourceType && (row.sourceId == null || row.sourceId === '')) return '-'
  const type = row.sourceType || 'SRC'
  const id = row.sourceId == null ? '' : `#${row.sourceId}`
  return `${type}${id}`
}

function sanitizeCostCenterId(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

function buildFilters(
  from: string,
  to: string,
  status: JournalStatus | '',
  journalCode: string,
  accountCode: string,
  thirdPartyId: number | '',
  costCenterInput: string,
) {
  const filters: GeneralJournalFilters = { from, to }
  if (status) filters.status = status
  if (journalCode.trim()) filters.journalCode = journalCode.trim().toUpperCase()
  if (accountCode.trim()) filters.accountCode = accountCode.trim()
  if (typeof thirdPartyId === 'number') filters.thirdPartyId = thirdPartyId
  const costCenterId = sanitizeCostCenterId(costCenterInput)
  if (costCenterId !== undefined) filters.costCenterId = costCenterId
  return filters
}

export default function GeneralJournalPage() {
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
  const [report, setReport] = useState<GeneralJournalResponse | null>(null)
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

  const queryFilters = useMemo(
    () =>
      buildFilters(
        from,
        to,
        status,
        selectedJournalCode,
        selectedAccountCode,
        selectedThirdPartyId,
        costCenterId,
      ),
    [from, to, status, selectedJournalCode, selectedAccountCode, selectedThirdPartyId, costCenterId],
  )

  const exportCsvUrl = useMemo(
    () => buildGeneralJournalExportUrl({ ...queryFilters, format: 'csv' }),
    [queryFilters],
  )
  const exportXlsxUrl = useMemo(
    () => buildGeneralJournalExportUrl({ ...queryFilters, format: 'xlsx' }),
    [queryFilters],
  )

  async function loadReport() {
    setLoadingReport(true)
    setError(null)
    try {
      const data = await fetchGeneralJournal(queryFilters)
      setReport(data)
    } catch (err: any) {
      setReport(null)
      setError(err?.response?.data?.message || err?.message || 'No se pudo cargar el libro diario')
    } finally {
      setLoadingReport(false)
    }
  }

  useEffect(() => {
    loadReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totals = useMemo(() => {
    if (!report) return { debit: 0, credit: 0 }
    return {
      debit: Number(report.totals?.debit || 0),
      credit: Number(report.totals?.credit || 0),
    }
  }, [report])

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Libro diario general</h1>
            <p className="text-sm text-gray-500">
              Filtra movimientos por rango de fechas, diario, cuenta, tercero o centro de costo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={exportXlsxUrl} className="btn btn-outline">Exportar XLSX</a>
            <a href={exportCsvUrl} className="btn btn-outline">Exportar CSV</a>
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
            <label className="mb-1 block text-sm font-medium">Cuenta contable</label>
            <SearchSelect
              value={selectedAccountCode ? selectedAccountCode : ''}
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
          <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">Movimientos</p>
              <p className="text-2xl font-semibold">{report.count}</p>
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

        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Fecha</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Diario</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Comprobante</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Fuente</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Cuenta</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Descripción</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Tercero</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Centro de costo</th>
                <th className="px-3 py-2 text-right text-sm font-medium text-gray-600">Débito</th>
                <th className="px-3 py-2 text-right text-sm font-medium text-gray-600">Crédito</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadingReport && (
                <tr>
                  <td colSpan={10} className="px-4 py-4 text-center text-sm text-gray-500">
                    Cargando…
                  </td>
                </tr>
              )}

              {!loadingReport && report?.rows?.map((row) => (
                <tr key={row.lineId}>
                  <td className="px-3 py-2 text-sm">{formatDate(row.entryDate)}</td>
                  <td className="px-3 py-2 text-sm">
                    <div className="font-medium">{row.journalCode}</div>
                    {row.journalName && <div className="text-xs text-gray-500">{row.journalName}</div>}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    <div>{row.entryNumber ?? '-'}</div>
                    <div className="text-xs text-gray-500">{row.entryStatus}</div>
                  </td>
                  <td className="px-3 py-2 text-sm">{formatSource(row)}</td>
                  <td className="px-3 py-2 text-sm">
                    <div className="font-medium">{row.accountCode}</div>
                    <div className="text-xs text-gray-500">{row.accountName}</div>
                  </td>
                  <td className="px-3 py-2 text-sm">
                    <div>{row.lineDescription || '-'}</div>
                    {row.entryDescription && (
                      <div className="text-xs text-gray-500">{row.entryDescription}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {row.thirdPartyName ? (
                      <div>
                        <div className="font-medium">{row.thirdPartyName}</div>
                        {row.thirdPartyDocument && (
                          <div className="text-xs text-gray-500">{row.thirdPartyDocument}</div>
                        )}
                      </div>
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {row.costCenterCode ? (
                      <div>
                        <div className="font-medium">{row.costCenterCode}</div>
                        {row.costCenterName && (
                          <div className="text-xs text-gray-500">{row.costCenterName}</div>
                        )}
                      </div>
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm text-right">{fmtMoney(row.debit)}</td>
                  <td className="px-3 py-2 text-sm text-right">{fmtMoney(row.credit)}</td>
                </tr>
              ))}

              {!loadingReport && (!report || report.rows.length === 0) && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-sm text-gray-500">
                    No hay movimientos para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
            {!loadingReport && report?.rows?.length ? (
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={8} className="px-3 py-2 text-sm font-medium">
                    Totales
                  </td>
                  <td className="px-3 py-2 text-sm text-right font-semibold">{fmtMoney(totals.debit)}</td>
                  <td className="px-3 py-2 text-sm text-right font-semibold">{fmtMoney(totals.credit)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </main>
    </Protected>
  )
}
