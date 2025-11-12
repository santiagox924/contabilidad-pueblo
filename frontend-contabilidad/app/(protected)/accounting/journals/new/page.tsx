'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import JournalForm from '@/components/journals/JournalForm'
import { createJournalEntry, type UpsertJournalPayload } from '@/lib/journals'

export default function NewJournalPage() {
  const router = useRouter()

  async function handleSubmit(payload: UpsertJournalPayload) {
    const created = await createJournalEntry(payload)
    router.push(`/accounting/journals/${created.id}`)
  }

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Nuevo asiento contable</h1>
            <p className="text-sm text-gray-500">Registra un asiento en estado borrador. Luego podrás contabilizarlo o modificarlo.</p>
          </div>
          <Link href="/accounting/journals" className="btn btn-ghost">
            Volver al listado
          </Link>
        </div>

        <JournalForm submitLabel="Crear asiento" onSubmit={handleSubmit} />
      </main>
    </Protected>
  )
}
