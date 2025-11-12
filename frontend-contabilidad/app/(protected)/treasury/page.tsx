// frontend-contabilidad/app/(protected)/treasury/page.tsx
'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { USER_ROLES } from '@/lib/roles'

export default function TreasuryHome() {
  return (
    <Protected roles={[USER_ROLES.TREASURY, USER_ROLES.ACCOUNTANT, USER_ROLES.SUPER_ADMIN]}>
      <Navbar />
      <main className="container py-8">
        <h1 className="text-2xl font-semibold mb-6">Tesorería</h1>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link href="/treasury/receipts" className="block rounded-xl border p-5 bg-white hover:shadow">
            <h3 className="text-lg font-semibold">Recibos de caja</h3>
            <p className="text-sm text-gray-600 mt-1">Registrar cobros de clientes y aplicar a cuotas/facturas.</p>
          </Link>

          <Link href="/treasury/payments" className="block rounded-xl border p-5 bg-white hover:shadow">
            <h3 className="text-lg font-semibold">Pagos a proveedores</h3>
            <p className="text-sm text-gray-600 mt-1">Registrar pagos y distribuir entre cuotas o facturas.</p>
          </Link>

          <Link href="/treasury/employees" className="block rounded-xl border p-5 bg-white hover:shadow">
            <h3 className="text-lg font-semibold">Empleados</h3>
            <p className="text-sm text-gray-600 mt-1">Gestión y operaciones relacionadas con empleados: nómina, anticipos y aportes.</p>
          </Link>
          <Link href="/treasury/methods" className="block rounded-xl border p-5 bg-white hover:shadow">
            <h3 className="text-lg font-semibold">Métodos de pago (catálogo)</h3>
            <p className="text-sm text-gray-600 mt-1">Crear, editar y activar/desactivar métodos disponibles.</p>
          </Link>
        </div>
      </main>
    </Protected>
  )
}
