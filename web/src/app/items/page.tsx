"use client";

import * as React from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Item = {
  id: number;
  sku: string;
  name: string;
  type: "PRODUCT" | "SERVICE";
  unit: string;
  price?: number | null;
  ivaPct?: number | null;
  active: boolean;
};

export default function ItemsPage() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<Item[]>("/items");
      setItems(data ?? []);
    } catch (e: any) {
      setError(e?.message || "Error cargando ítems");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ítems</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => load()} disabled={loading}>
            {loading ? "Cargando..." : "Refrescar"}
          </Button>
          <Link href="/items/new">
            <Button>Nuevo ítem</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-red-600 text-sm mb-3">{error}</div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">IVA %</TableHead>
                <TableHead className="text-center">Activo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Sin registros
                  </TableCell>
                </TableRow>
              ) : (
                items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.sku}</TableCell>
                    <TableCell>{it.name}</TableCell>
                    <TableCell>{it.type === "PRODUCT" ? "Producto" : "Servicio"}</TableCell>
                    <TableCell>{it.unit}</TableCell>
                    <TableCell className="text-right">
                      {it.price ?? 0}
                    </TableCell>
                    <TableCell className="text-right">
                      {it.ivaPct ?? 0}
                    </TableCell>
                    <TableCell className="text-center">
                      {it.active ? "Sí" : "No"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
