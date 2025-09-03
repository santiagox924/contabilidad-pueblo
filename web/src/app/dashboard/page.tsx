import Link from "next/link";
import { apiGet } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function DashboardPage() {
  // info del usuario para saludar
  const me = await apiGet<{ userId: number; email: string }>("/auth/me").catch(() => null);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Hola {me?.email ?? "usuario"} 👋
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Ventas</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Factura y notas crédito.
            </p>
            <Link href="/sales" className="underline">Ir a ventas</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Compras</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Facturas de proveedor e inventario.
            </p>
            <Link href="/purchases" className="underline">Ir a compras</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Inventario</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Ítems, stock y kardex.
            </p>
            <Link href="/items" className="underline">Ir a inventario</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Tesorería</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              CxC / CxP, cobros y pagos.
            </p>
            <Link href="/treasury" className="underline">Ir a tesorería</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Contabilidad</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Diario, mayor y reportes.
            </p>
            <Link href="/accounting" className="underline">Ir a contabilidad</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Salir</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Cierra tu sesión de forma segura.
            </p>
            <Link href="/logout" className="underline">Cerrar sesión</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
