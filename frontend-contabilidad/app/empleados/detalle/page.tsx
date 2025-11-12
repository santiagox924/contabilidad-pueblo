'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'

export default function DetalleEmpleado() {
  return (
    <Protected>
      <Navbar />
      <div className="p-6">
        <h2 className="text-xl font-medium">Detalle empleado</h2>
        <p className="mt-4">Página de detalle para un empleado (scaffold).</p>
      </div>
    </Protected>
  )
}
