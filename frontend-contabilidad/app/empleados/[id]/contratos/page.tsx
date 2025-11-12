import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'

export default function ContratosPage({ params }: { params: { id: string } }) {
  return (
    <Protected>
      <Navbar />
      <main className="container py-8">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold">Contratos — Empleado {params.id}</h1>
          <p className="mt-4 text-gray-600">Aquí se listarán los contratos y la información contractual del empleado.</p>
        </div>
      </main>
    </Protected>
  )
}
