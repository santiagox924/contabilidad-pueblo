import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import EditEmpleadoForm from '@/components/empleados/EditEmpleadoForm'

export default function EditEmpleadoPage({ params }: { params: { id: string } }) {
  return (
    <Protected>
      <Navbar />
      <main className="container py-8">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold mb-4">Editar empleado {params.id}</h1>
          <EditEmpleadoForm empleadoId={params.id} />
        </div>
      </main>
    </Protected>
  )
}
