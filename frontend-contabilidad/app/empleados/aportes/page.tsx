"use client"

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import AportesRetenciones from '@/components/empleados/AportesRetenciones'

export default function AportesRetencionesPage() {
  return (
    <Protected>
      <Navbar />
      <div className="p-6">
        <AportesRetenciones />
      </div>
    </Protected>
  )
}
