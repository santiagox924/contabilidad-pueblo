import Link from 'next/link';
import { cookies } from 'next/headers';

export default async function Home() {
  const store = await cookies();
  const hasToken = !!store.get('token')?.value;

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Contabilidad del Pueblo</h1>
      {hasToken ? (
        <Link className="underline" href="/dashboard">Ir al dashboard</Link>
      ) : (
        <Link className="underline" href="/login">Iniciar sesión</Link>
      )}
    </main>
  );
}