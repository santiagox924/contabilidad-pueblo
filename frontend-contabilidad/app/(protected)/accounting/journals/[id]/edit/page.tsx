'use client'

import Link from 'next/link'
import { notFound, useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import JournalForm, { type JournalFormInitial } from '@/components/journals/JournalForm'
import { getJournalEntry, type JournalDetail, updateJournalEntry, type UpsertJournalPayload } from '@/lib/journals'

export default function EditJournalPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const entryId = Number(params?.id)
  const [loading, setLoading] = useState(true)
  const [entry, setEntry] = useState<JournalDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  async function handleSubmit(payload: UpsertJournalPayload) {
    await updateJournalEntry(entryId, payload)
    router.push(`/accounting/journals/${entryId}`)
  }

  if (!Number.isFinite(entryId)) {
    notFound()
    return null
  }

  const initial: JournalFormInitial | undefined = entry
    ? {
        date: entry.date,
        description: entry.description,
        journalId: entry.journal?.id ?? undefined,
        journalCode: entry.journal?.code ?? undefined,
        lines: entry.lines.map((ln) => ({
          accountCode: ln.accountCode,
          debit: ln.debit,
          credit: ln.credit,
          thirdPartyId: ln.thirdParty?.id ?? undefined,
          description: ln.description ?? undefined,
        })),
      }
    : undefined

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Editar asiento #{entryId}</h1>
            <p className="text-sm text-gray-500">Solo es posible editar asientos en estado borrador.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/accounting/journals/${entryId}`} className="btn btn-outline">
              Ver detalle
            </Link>
            <Link href="/accounting/journals" className="btn btn-ghost">
              Volver al listado
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">{error}</div>
        )}

        {loading && (
          <div className="rounded-2xl border bg-white p-6 text-center text-gray-500 shadow-sm">
            Cargando asiento…
          </div>
        )}

        {!loading && entry && entry.status !== 'DRAFT' && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-800">
            Este asiento no está en estado borrador. Solo los asientos en DRAFT se pueden editar.
          </div>
        )}

        {!loading && entry && entry.status === 'DRAFT' && (
          <JournalForm initialValue={initial} submitLabel="Guardar cambios" onSubmit={handleSubmit} />
        )}
      </main>
    </Protected>
  )
}
