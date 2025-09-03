"use client";

import * as React from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Party = {
  id: number;
  type: "CLIENT" | "PROVIDER" | "EMPLOYEE" | "OTHER";
  document?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  paymentTermsDays?: number | null;
  active: boolean;
};

export default function PartiesPage() {
  const [rows, setRows] = React.useState<Party[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<Party[]>("/parties");
      setRows(data ?? []);
    } catch (e: any) {
      setError(e?.message || "Error cargando terceros");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { void load(); }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Terceros</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => load()} disabled={loading}>
            {loading ? "Cargando..." : "Refrescar"}
          </Button>
          <Link href="/parties/new">
            <Button>Nuevo tercero</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead className="text-right">Plazo (días)</TableHead>
                <TableHead className="text-center">Activo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Sin registros
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.type === "CLIENT" ? "Cliente" :
                       r.type === "PROVIDER" ? "Proveedor" :
                       r.type === "EMPLOYEE" ? "Empleado" : "Otro"}
                    </TableCell>
                    <TableCell>{r.document ?? ""}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.email ?? ""}</TableCell>
                    <TableCell>{r.phone ?? ""}</TableCell>
                    <TableCell>{r.city ?? ""}</TableCell>
                    <TableCell className="text-right">{r.paymentTermsDays ?? 0}</TableCell>
                    <TableCell className="text-center">{r.active ? "Sí" : "No"}</TableCell>
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
