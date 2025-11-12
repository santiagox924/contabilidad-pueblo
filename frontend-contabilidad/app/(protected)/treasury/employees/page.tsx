// Página de empleados con tabs para nómina, pagos y anticipos (Tesorería)
'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'

export default function EmployeesTreasurySection() {
  return (
    <Protected>
      <Navbar />
      <main className="container py-8">
        <h1 className="text-2xl font-semibold mb-6">Empleados</h1>

        <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/empleados/lista" className="block rounded-xl border p-5 bg-white hover:shadow">
            <h3 className="text-lg font-semibold">Lista de empleados</h3>
            <p className="text-sm text-gray-600 mt-1">Tabla general con filtros (nombre, cargo, estado, empresa).</p>
          </Link>

          <Link href="/empleados/contratos" className="block rounded-xl border p-5 bg-white hover:shadow">
            <h3 className="text-lg font-semibold">Contratos y cargos</h3>
            <p className="text-sm text-gray-600 mt-1">Gestión de contratos, salario, fechas y tipo de vinculación.</p>
          </Link>

          <Link href="/empleados/nomina" className="block rounded-xl border p-5 bg-white hover:shadow">
            <h3 className="text-lg font-semibold">Nómina y pagos</h3>
            <p className="text-sm text-gray-600 mt-1">Registro de nóminas mensuales, anticipos y deducciones.</p>
          </Link>

          <Link href="/empleados/aportes" className="block rounded-xl border p-5 bg-white hover:shadow">
            <h3 className="text-lg font-semibold">Aportes y retenciones</h3>
            <p className="text-sm text-gray-600 mt-1">EPS, pensión, ARL, CCF, retención en la fuente y PILA.</p>
          </Link>
        </div>
      </main>
    </Protected>
  )
}
