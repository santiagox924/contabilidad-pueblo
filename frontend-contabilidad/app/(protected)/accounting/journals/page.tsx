'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import SearchSelect from '@/components/SearchSelect'
import {
  changeJournalStatus,
  deleteJournalEntry,
  type JournalCatalogItem,
  type JournalStatus,
  listJournalCatalog,
  listJournalEntries,
  type JournalSummary,
  reverseJournalEntry,
} from '@/lib/journals'

function firstDayOfMonth(base = new Date()) {
  return new Date(base.getFullYear(), base.getMonth(), 1).toISOString().slice(0, 10)
}
function lastDayOfMonth(base = new Date()) {
  return new Date(base.getFullYear(), base.getMonth() + 1, 0).toISOString().slice(0, 10)
}

function fmtMoney(n: number) {
  return Number(n || 0).toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtStatus(status: JournalStatus) {
  if (status === 'DRAFT') return 'Borrador'
  if (status === 'POSTED') return 'Contabilizado'
  if (status === 'REVERSED') return 'Revertido'
  return status
}

export default function JournalsPage() {
  const [from, setFrom] = useState(firstDayOfMonth())
  const [to, setTo] = useState(lastDayOfMonth())
  const [status, setStatus] = useState<JournalStatus | ''>('')
  const [journalId, setJournalId] = useState<number | ''>('')
  const [search, setSearch] = useState('')

  const [catalog, setCatalog] = useState<JournalCatalogItem[]>([])
  const [items, setItems] = useState<JournalSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingAction, setLoadingAction] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const rows = await listJournalCatalog()
        setCatalog(rows)
      } catch (err) {
        console.warn('No se pudo cargar el catalogo de diarios', err)
      }
    }
    loadCatalog()
  }, [])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listJournalEntries({
        from,
        to,
        status: status || undefined,
        journalId: typeof journalId === 'number' ? journalId : undefined,
        search: search.trim() || undefined,
      })
      setItems(res.items)
      setTotal(res.total)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Error cargando asientos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedJournal = useMemo(
    () => (typeof journalId === 'number' ? catalog.find((j) => j.id === journalId) ?? null : null),
    [catalog, journalId],
  )

  async function handleStatusChange(entry: JournalSummary, next: 'DRAFT' | 'POSTED') {
    if (loadingAction) return
    setLoadingAction(entry.id)
    setError(null)
    setSuccess(null)
    try {
      await changeJournalStatus(entry.id, next)
      setSuccess(`Asiento ${entry.id} actualizado a ${fmtStatus(next)}.`)
      await load()
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'No se pudo cambiar el estado del asiento')
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleReverse(entry: JournalSummary) {
    if (loadingAction) return
    if (!window.confirm('¿Confirmas revertir este asiento? Se creara un asiento inverso.')) return
    setLoadingAction(entry.id)
    setError(null)
    setSuccess(null)
    try {
      await reverseJournalEntry(entry.id, `Reversa solicitada desde UI ${new Date().toISOString()}`)
      setSuccess(`Se creó la reversa del asiento ${entry.id}.`)
      await load()
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'No se pudo revertir el asiento')
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleDelete(entry: JournalSummary) {
    if (loadingAction) return
    if (!window.confirm('¿Eliminar este asiento en borrador? Esta accion no se puede deshacer.')) return
    setLoadingAction(entry.id)
    setError(null)
    setSuccess(null)
    try {
      await deleteJournalEntry(entry.id)
      setSuccess(`Asiento ${entry.id} eliminado.`)
      await load()
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'No se pudo eliminar el asiento')
    } finally {
      setLoadingAction(null)
    }
  }

  const disableFilters = loading || loadingAction !== null

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Asientos contables</h1>
            <p className="text-sm text-gray-500">
              Consulta, crea y administra los diarios contables de la empresa.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/accounting/journals/new" className="btn btn-primary">
              Nuevo asiento
            </Link>
            <Link href="/accounting" className="btn btn-ghost">
              Volver
            </Link>
          </div>
        </div>

        <form
          className="mb-5 grid grid-cols-1 gap-4 rounded-2xl border bg-white p-5 shadow-sm md:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault()
            load()
          }}
        >
          <div>
            <label className="block text-sm font-medium mb-1">Desde</label>
            <input
              type="date"
              className="input input-bordered w-full rounded-xl"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              disabled={disableFilters}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Hasta</label>
            <input
              type="date"
              className="input input-bordered w-full rounded-xl"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={disableFilters}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Estado</label>
            <select
              className="select select-bordered w-full rounded-xl"
              value={status}
              onChange={(e) => setStatus(e.target.value as JournalStatus | '')}
              disabled={disableFilters}
            >
              <option value="">Todos</option>
              <option value="DRAFT">Borrador</option>
              <option value="POSTED">Contabilizado</option>
              <option value="REVERSED">Revertido</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Diario</label>
            <SearchSelect
              value={selectedJournal ? selectedJournal.id : ''}
              options={catalog.map((j) => ({
                value: j.id,
                label: `${j.code} — ${j.name}`,
              }))}
              placeholder="Filtrar por diario"
              onSelect={(opt) => {
                if (!opt) {
                  setJournalId('')
                  return
                }
                const id = Number(opt.value)
                setJournalId(Number.isFinite(id) ? id : '')
              }}
              disabled={disableFilters}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Buscar</label>
            <input
              type="text"
              className="input input-bordered w-full rounded-xl"
              placeholder="Descripcion, cuenta, numero..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={disableFilters}
            />
          </div>
          <div className="md:col-span-6 flex justify-end">
            <button type="submit" className="btn btn-outline" disabled={disableFilters}>
              {loading ? 'Cargando…' : 'Aplicar filtros'}
            </button>
          </div>
        </form>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}
        {success && !error && (
          <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-800">
            {success}
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Fecha</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Numero</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Diario</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Estado</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Descripcion</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Debito</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Credito</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-center text-gray-500">
                    Cargando asientos…
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-center text-gray-500">
                    No hay asientos contables para los filtros seleccionados.
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((entry) => {
                  const journalLabel = entry.journal ? `${entry.journal.code} — ${entry.journal.name}` : 'GENERAL'
                  const isDraft = entry.status === 'DRAFT'
                  const isPosted = entry.status === 'POSTED'
                  return (
                    <tr key={entry.id}>
                      <td className="px-4 py-2 text-sm">
                        {new Date(entry.date).toLocaleDateString('es-CO')}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {entry.number != null ? `${entry.number}` : '—'}
                      </td>
                      <td className="px-4 py-2 text-sm">{journalLabel}</td>
                      <td className="px-4 py-2 text-sm">{fmtStatus(entry.status)}</td>
                      <td className="px-4 py-2 text-sm">{entry.description || '—'}</td>
                      <td className="px-4 py-2 text-sm text-right">{fmtMoney(entry.totals.debit)}</td>
                      <td className="px-4 py-2 text-sm text-right">{fmtMoney(entry.totals.credit)}</td>
                      <td className="px-4 py-2 text-sm">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Link href={`/accounting/journals/${entry.id}`} className="btn btn-ghost btn-xs">
                            Ver
                          </Link>
                          {isDraft && (
                            <Link href={`/accounting/journals/${entry.id}/edit`} className="btn btn-outline btn-xs">
                              Editar
                            </Link>
                          )}
                          {isDraft && (
                            <button
                              type="button"
                              className="btn btn-success btn-xs"
                              disabled={loadingAction === entry.id}
                              onClick={() => handleStatusChange(entry, 'POSTED')}
                            >
                              {loadingAction === entry.id ? 'Procesando…' : 'Contabilizar'}
                            </button>
                          )}
                          {isPosted && (
                            <button
                              type="button"
                              className="btn btn-outline btn-xs"
                              disabled={loadingAction === entry.id}
                              onClick={() => handleStatusChange(entry, 'DRAFT')}
                            >
                              {loadingAction === entry.id ? 'Procesando…' : 'Volver a borrador'}
                            </button>
                          )}
                          {isPosted && (
                            <button
                              type="button"
                              className="btn btn-warning btn-xs"
                              disabled={loadingAction === entry.id}
                              onClick={() => handleReverse(entry)}
                            >
                              {loadingAction === entry.id ? 'Procesando…' : 'Reversar'}
                            </button>
                          )}
                          {isDraft && (
                            <button
                              type="button"
                              className="btn btn-error btn-xs"
                              disabled={loadingAction === entry.id}
                              onClick={() => handleDelete(entry)}
                            >
                              {loadingAction === entry.id ? 'Procesando…' : 'Eliminar'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-sm text-gray-500">
          Total asientos: {total}
        </div>
      </main>
    </Protected>
  )
}
