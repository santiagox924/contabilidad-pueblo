'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { notFound, useParams, useRouter } from 'next/navigation'
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import {
  changeJournalStatus,
  deleteJournalEntry,
  getJournalEntry,
  postManualEntry,
  reverseJournalEntry,
  type JournalDetail,
} from '@/lib/journals'

function fmtMoney(n: number) {
  return Number(n || 0).toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtStatus(status: string) {
  if (status === 'DRAFT') return 'Borrador'
  if (status === 'POSTED') return 'Contabilizado'
  if (status === 'REVERSED') return 'Revertido'
  return status
}

export default function JournalDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const entryId = Number(params?.id)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<'STATUS' | 'REVERSE' | 'DELETE' | null>(null)
  const [entry, setEntry] = useState<JournalDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!Number.isFinite(entryId)) {
      notFound()
      return
    }
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getJournalEntry(entryId)
        setEntry(data)
      } catch (err: any) {
        setError(err?.response?.data?.message || err?.message || 'No se pudo cargar el asiento')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [entryId])

  async function refresh() {
    try {
      const data = await getJournalEntry(entryId)
      setEntry(data)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'No se pudo actualizar el asiento')
    }
  }

  async function handleStatus(next: 'DRAFT' | 'POSTED') {
    if (!entry) return
    setActionLoading('STATUS')
    setError(null)
    setSuccess(null)
    try {
      await changeJournalStatus(entry.id, next)
      setSuccess(`Asiento actualizado a ${fmtStatus(next)}.`)
      await refresh()
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'No se pudo cambiar el estado')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReverse() {
    if (!entry) return
    if (!window.confirm('¿Confirmas revertir este asiento?')) return
    setActionLoading('REVERSE')
    setError(null)
    setSuccess(null)
    try {
      await reverseJournalEntry(entry.id, `Reversa generada desde el detalle ${new Date().toISOString()}`)
      setSuccess('Se registró la reversa del asiento.')
      await refresh()
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'No se pudo revertir el asiento')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDelete() {
    if (!entry) return
    if (!window.confirm('¿Eliminar este asiento en borrador?')) return
    setActionLoading('DELETE')
    setError(null)
    setSuccess(null)
    try {
      await deleteJournalEntry(entry.id)
      setSuccess('Asiento eliminado.')
      router.push('/accounting/journals')
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'No se pudo eliminar el asiento')
      setActionLoading(null)
    }
  }

  async function handlePost() {
    if (!entry) return
    setActionLoading('STATUS')
    setError(null)
    setSuccess(null)
    try {
      await postManualEntry(entry.id)
      setSuccess('Asiento contabilizado correctamente.')
      await refresh()
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'No se pudo contabilizar el asiento')
    } finally {
      setActionLoading(null)
    }
  }

  const isDraft = entry?.status === 'DRAFT'
  const isPosted = entry?.status === 'POSTED'

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Detalle de asiento #{entryId}</h1>
            {entry && (
              <p className="text-sm text-gray-500">
                {new Date(entry.date).toLocaleString('es-CO')} · {fmtStatus(entry.status)} ·{' '}
                {entry.journal ? `${entry.journal.code} — ${entry.journal.name}` : 'GENERAL'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isDraft && (
              <Link href={`/accounting/journals/${entryId}/edit`} className="btn btn-outline">
                Editar
              </Link>
            )}
            <Link href="/accounting/journals" className="btn btn-ghost">
              Volver al listado
            </Link>
          </div>
        </div>

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

        {loading && (
          <div className="rounded-2xl border bg-white p-6 text-center text-gray-500 shadow-sm">
            Cargando asiento…
          </div>
        )}

        {!loading && entry && (
          <div className="space-y-5">
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-medium mb-3">Resumen</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <div className="text-xs uppercase text-gray-500">Fecha</div>
                  <div className="text-sm">{new Date(entry.date).toLocaleString('es-CO')}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Estado</div>
                  <div className="text-sm">{fmtStatus(entry.status)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Numero</div>
                  <div className="text-sm">{entry.number != null ? `${entry.number}` : '—'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Diario</div>
                  <div className="text-sm">
                    {entry.journal ? `${entry.journal.code} — ${entry.journal.name}` : 'GENERAL'}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Periodo</div>
                  <div className="text-sm">
                    {entry.period
                      ? `${entry.period.year}-${String(entry.period.month).padStart(2, '0')} (${entry.period.status})`
                      : 'Sin periodo'}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Origen</div>
                  <div className="text-sm">{entry.sourceType} · #{entry.sourceId}</div>
                </div>
              </div>
              {entry.description && (
                <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                  {entry.description}
                </div>
              )}
            </section>

            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-medium">Líneas ({entry.lines.length})</h2>
                <div className="text-sm text-gray-500">
                  Débito: {fmtMoney(entry.totals.debit)} · Crédito: {fmtMoney(entry.totals.credit)}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Cuenta</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Tercero</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Descripción</th>
                      <th className="px-3 py-2 text-right text-sm font-medium text-gray-600">Débito</th>
                      <th className="px-3 py-2 text-right text-sm font-medium text-gray-600">Crédito</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {entry.lines.map((ln) => (
                      <tr key={ln.id}>
                        <td className="px-3 py-2 text-sm">
                          <div className="font-medium">{ln.accountCode}</div>
                          <div className="text-xs text-gray-500">{ln.accountName ?? '—'}</div>
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {ln.thirdParty ? (
                            <>
                              <div>{ln.thirdParty.name}</div>
                              <div className="text-xs text-gray-500">{ln.thirdParty.document ?? ''}</div>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm">{ln.description || '—'}</td>
                        <td className="px-3 py-2 text-sm text-right">{fmtMoney(ln.debit)}</td>
                        <td className="px-3 py-2 text-sm text-right">{fmtMoney(ln.credit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-medium mb-3">Acciones</h2>
              <div className="flex flex-wrap items-center gap-2">
                {isDraft && (
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={handlePost}
                    disabled={actionLoading === 'STATUS'}
                  >
                    {actionLoading === 'STATUS' ? 'Procesando…' : 'Contabilizar'}
                  </button>
                )}
                {isDraft && (
                  <button
                    type="button"
                    className="btn btn-error"
                    onClick={handleDelete}
                    disabled={actionLoading === 'DELETE'}
                  >
                    {actionLoading === 'DELETE' ? 'Eliminando…' : 'Eliminar'}
                  </button>
                )}
                {isPosted && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => handleStatus('DRAFT')}
                    disabled={actionLoading === 'STATUS'}
                  >
                    {actionLoading === 'STATUS' ? 'Procesando…' : 'Volver a borrador'}
                  </button>
                )}
                {isPosted && (
                  <button
                    type="button"
                    className="btn btn-warning"
                    onClick={handleReverse}
                    disabled={actionLoading === 'REVERSE'}
                  >
                    {actionLoading === 'REVERSE' ? 'Procesando…' : 'Reversar'}
                  </button>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </Protected>
  )
}
