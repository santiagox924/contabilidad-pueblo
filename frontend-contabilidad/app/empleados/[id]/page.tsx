// Página 2: Detalle / perfil de empleado
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import DetalleEmpleado from '../../../components/empleados/DetalleEmpleado';

export default function DetalleEmpleadoPage({ params }: { params: { id: string } }) {
  return (
    <Protected>
      <Navbar />
      <main className="container py-8">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <DetalleEmpleado empleadoId={params.id} />
        </div>
      </main>
    </Protected>
  )
}
