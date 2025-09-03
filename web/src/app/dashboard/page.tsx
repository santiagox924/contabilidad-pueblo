import { cookies } from 'next/headers';
import Link from 'next/link';

export default async function Dashboard() {
  const store = await cookies();
  const token = store.get('token')?.value;

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-sm text-muted-foreground">
        Token presente: {token ? 'sí' : 'no'}
      </p>
      <div className="space-x-4">
        <Link className="underline" href="/logout">Cerrar sesión</Link>
        <Link className="underline" href="/">Inicio</Link>
      </div>
    </main>
  );
}
