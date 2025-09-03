import { apiGet, apiPost } from "@/lib/api";
import type { SalesInvoice } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

function money(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);
}

export default async function SalesInvoiceDetail({
  params,
}: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  let inv: SalesInvoice;
  try {
    inv = await apiGet<SalesInvoice>(`/sales/invoices/${id}`);
  } catch {
    notFound();
  }

  async function onVoid() {
    "use server";
    // Endpoint del backend: POST /sales/invoices/:id/void
    await apiPost(`/sales/invoices/${id}/void`);
    redirect(`/sales/${id}`); // recarga la página
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Factura #{inv.number} {inv.status === "VOID" && <span className="text-red-600 text-base font-medium"> (ANULADA)</span>}
        </h1>
        <div className="flex gap-2">
          <Link href="/sales/new">
            <Button variant="outline">Nueva factura</Button>
          </Link>
          {inv.status !== "VOID" && (
            <form action={onVoid}>
              <Button type="submit" variant="destructive">Anular</Button>
            </form>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Encabezado</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <div className="text-sm text-muted-foreground">Cliente</div>
            <div className="font-medium">
              {inv.thirdParty?.name} {inv.thirdParty?.document ? `(${inv.thirdParty.document})` : ""}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Fecha</div>
            <div className="font-medium">{new Date(inv.issueDate).toLocaleDateString()}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Pago</div>
            <div className="font-medium">
              {inv.paymentType === "CASH" ? "Contado" : "Crédito"}
              {inv.paymentType === "CREDIT" && inv.dueDate
                ? ` · Vence: ${new Date(inv.dueDate).toLocaleDateString()}`
                : ""}
            </div>
          </div>
          {inv.note && (
            <div className="sm:col-span-3">
              <div className="text-sm text-muted-foreground">Nota</div>
              <div className="font-medium">{inv.note}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Líneas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Desc. %</TableHead>
                <TableHead className="text-right">IVA %</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inv.lines.map((l) => {
                return (
                  <TableRow key={l.id}>
                    <TableCell>{l.item?.sku ?? l.itemId}</TableCell>
                    <TableCell className="max-w-[380px] truncate">{l.item?.name ?? ""}</TableCell>
                    <TableCell className="text-right">{l.qty}</TableCell>
                    <TableCell className="text-right">{money(l.unitPrice)}</TableCell>
                    <TableCell className="text-right">{l.discountPct ?? 0}</TableCell>
                    <TableCell className="text-right">{l.vatPct ?? 0}</TableCell>
                    <TableCell className="text-right">{money(l.lineSubtotal)}</TableCell>
                    <TableCell className="text-right">{money(l.lineVat)}</TableCell>
                    <TableCell className="text-right font-medium">{money(l.lineTotal)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Totales */}
          <div className="mt-4 flex flex-col items-end gap-1">
            <div className="w-full sm:w-80 flex justify-between">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span className="font-medium">{money(inv.subtotal)}</span>
            </div>
            <div className="w-full sm:w-80 flex justify-between">
              <span className="text-sm text-muted-foreground">IVA</span>
              <span className="font-medium">{money(inv.tax)}</span>
            </div>
            <div className="w-full sm:w-80 flex justify-between">
              <span className="text-sm">Total</span>
              <span className="font-bold">{money(inv.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
