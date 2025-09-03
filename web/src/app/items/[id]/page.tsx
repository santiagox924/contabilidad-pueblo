import { apiGet } from "@/lib/api";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Item = {
  id: number; sku: string; name: string;
  type: "PRODUCT" | "SERVICE"; unit: string;
  price: number | string | null; ivaPct: number | null; active: boolean;
};

type StockResp = { itemId: number; warehouseId: number; qty: number; value?: number; avgCost?: number };

export default async function ItemDetail({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const item = await apiGet<Item>(`/items/${id}`).catch(() => null);

  // stock en bodega 1 (ajusta si tienes varias)
  const stock = item?.type === "PRODUCT"
    ? await apiGet<StockResp>(`/inventory/stock?itemId=${id}&warehouseId=1`).catch(() => null)
    : null;

  if (!item) {
    return <div className="p-6">Ítem no encontrado. <Link href="/items" className="underline">Volver</Link></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <Link href="/items" className="underline text-sm">&larr; Volver</Link>
      <h1 className="text-2xl font-bold">{item.name} <span className="text-muted-foreground">({item.sku})</span></h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Información</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Tipo: </span>{item.type}</div>
            <div><span className="text-muted-foreground">Unidad: </span>{item.unit}</div>
            <div><span className="text-muted-foreground">Precio: </span>{item.price ?? "-"}</div>
            <div><span className="text-muted-foreground">IVA %: </span>{item.ivaPct ?? 0}</div>
            <div><span className="text-muted-foreground">Estado: </span>{item.active ? "Activo" : "Inactivo"}</div>
          </CardContent>
        </Card>

        {stock && (
          <Card>
            <CardHeader><CardTitle>Stock (Bodega 1)</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Cantidad: </span>{stock.qty}</div>
              {stock.avgCost != null && <div><span className="text-muted-foreground">Costo prom.: </span>{stock.avgCost}</div>}
              {stock.value != null && <div><span className="text-muted-foreground">Valorizado: </span>{stock.value}</div>}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
