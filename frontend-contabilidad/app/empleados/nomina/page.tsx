"use client"

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import NominaPagos from '@/components/empleados/NominaPagos'

export default function NominaPagosPage() {
  return (
    <Protected>
      <Navbar />
      <div className="p-6">
        <NominaPagos />
      </div>
    </Protected>
  )
}
