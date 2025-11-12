import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'

export default function NominaPage({ params }: { params: { id: string } }) {
  return (
    <Protected>
      <Navbar />
      <main className="container py-8">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold">Nómina — Empleado {params.id}</h1>
          <p className="mt-4 text-gray-600">Aquí se mostrará la nómina y acciones de pago para el empleado.</p>
        </div>
      </main>
    </Protected>
  )
}
