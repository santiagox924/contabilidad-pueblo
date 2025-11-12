"use client"

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'

export default function ContratosCargosPage() {
  return (
    <Protected>
      <Navbar />
      <div className="p-6">
        <h2 className="text-xl font-medium">Contratos y cargos</h2>
        <p className="mt-4">Administración de contratos y cargos (scaffold).</p>
      </div>
    </Protected>
  )
}
