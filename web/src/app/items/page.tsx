import Link from "next/link";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Item = {
  id: number;
  sku: string;
  name: string;
  type: "PRODUCT" | "SERVICE";
  unit: string;
  price: number | string | null;
  ivaPct: number | null;
  active: boolean;
};

export const dynamic = "force-dynamic"; // evita cache

export default async function ItemsPage() {
  const items = await apiGet<Item[]>("/items").catch(() => []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ítems</h1>
        <Link href="/items/new" className="underline">Nuevo ítem</Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left border-b">
                <tr className="text-muted-foreground">
                  <th className="py-2 pr-4">SKU</th>
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4">Unidad</th>
                  <th className="py-2 pr-4">Precio</th>
                  <th className="py-2 pr-4">IVA %</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{it.sku}</td>
                    <td className="py-2 pr-4">{it.name}</td>
                    <td className="py-2 pr-4">{it.type === "PRODUCT" ? "Producto" : "Servicio"}</td>
                    <td className="py-2 pr-4">{it.unit}</td>
                    <td className="py-2 pr-4">{it.price ?? "-"}</td>
                    <td className="py-2 pr-4">{it.ivaPct ?? 0}</td>
                    <td className="py-2 pr-4">
                      <Badge className={cn(!it.active && "opacity-60")}>
                        {it.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">
                      <Link href={`/items/${it.id}`} className="underline">Ver</Link>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-muted-foreground">
                      Sin ítems aún. Crea el primero.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
