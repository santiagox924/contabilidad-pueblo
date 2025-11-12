'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import ListaEmpleados from '@/components/empleados/ListaEmpleados'

export default function ListaEmpleadosPage() {
  return (
    <Protected>
      <Navbar />
      <main className="container py-8">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <ListaEmpleados />
        </div>
      </main>
    </Protected>
  )
}
