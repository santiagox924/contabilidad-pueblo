'use client'

import Link from 'next/link'
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'

export default function EmpleadosIndex() {
  return (
    <Protected>
      <Navbar />
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Empleados</h1>
        <ul className="space-y-2">
          <li>
            <Link href="/empleados/lista" className="text-blue-600">Lista de empleados</Link>
          </li>
          <li>
            <Link href="/empleados/detalle" className="text-blue-600">Detalle empleado (mock)</Link>
          </li>
          <li>
            <Link href="/empleados/contratos" className="text-blue-600">Contratos y cargos</Link>
          </li>
          <li>
            <Link href="/empleados/nomina" className="text-blue-600">Nómina y pagos</Link>
          </li>
          <li>
            <Link href="/empleados/aportes" className="text-blue-600">Aportes y retenciones</Link>
          </li>
        </ul>
      </div>
    </Protected>
  )
}
