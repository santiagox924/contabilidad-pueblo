"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { apiGet, apiPost } from "@/lib/api";
import type { Party, Item } from "@/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

/* =========
   Schema
   ========= */
const lineSchema = z.object({
  itemId: z.coerce.number().int().positive({ message: "Ítem requerido" }),
  qty: z.coerce.number().positive({ message: "Cantidad > 0" }),
  unitPrice: z.coerce.number().min(0, { message: "Precio >= 0" }),
  vatPct: z.coerce.number().min(0).max(100).default(0),
  discountPct: z.coerce.number().min(0).max(100).default(0),
});

const schema = z.object({
  thirdPartyId: z.coerce.number().int().positive({ message: "Cliente requerido" }),
  paymentType: z.enum(["CASH", "CREDIT"]),
  dueDate: z.string().optional().or(z.literal("")).nullable(),
  note: z.string().optional().or(z.literal("")),
  lines: z.array(lineSchema).min(1, { message: "Agrega al menos una línea" }),
}).superRefine((data, ctx) => {
  if (data.paymentType === "CREDIT") {
    if (!data.dueDate || data.dueDate === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dueDate"],
        message: "Fecha de vencimiento requerida para crédito",
      });
    }
  }
});

type FormValues = z.infer<typeof schema>;

/* =========
   Helpers
   ========= */
function money(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);
}

export default function NewSalesInvoicePage() {
  const router = useRouter();

  const [clients, setClients] = React.useState<Party[]>([]);
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Cargar clientes (solo CLIENT) e ítems activos
  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const [allParties, allItems] = await Promise.all([
          apiGet<Party[]>("/parties"),
          apiGet<Item[]>("/items"),
        ]);
        setClients((allParties || []).filter(p => p.type === "CLIENT" && p.active));
        setItems((allItems || []).filter(i => i.active));
      } catch (e: any) {
        setErr(e?.message || "Error cargando datos");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const { control, register, handleSubmit, watch, setValue, formState: { errors } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        thirdPartyId: undefined as unknown as number,
        paymentType: "CREDIT",
        dueDate: "",
        note: "",
        lines: [{ itemId: undefined as unknown as number, qty: 1, unitPrice: 0, vatPct: 0, discountPct: 0 }],
      },
    });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  // Actualiza precio/IVA al seleccionar ítem
  const handleItemChange = (index: number, itemIdStr: string) => {
    const id = Number(itemIdStr);
    const it = items.find(i => i.id === id);
    if (it) {
      setValue(`lines.${index}.itemId`, it.id);
      setValue(`lines.${index}.unitPrice`, Number(it.price ?? 0));
      setValue(`lines.${index}.vatPct`, Number(it.ivaPct ?? 0));
    }
  };

  // Totales reactivos
  const lines = watch("lines");
  const computed = React.useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const l of lines || []) {
      const qty = Number(l?.qty || 0);
      const unitPrice = Number(l?.unitPrice || 0);
      const disc = Number(l?.discountPct || 0) / 100;
      const vat = Number(l?.vatPct || 0) / 100;
      const base = qty * unitPrice * (1 - disc);
      const iva = base * vat;
      subtotal += base;
      tax += iva;
    }
    const total = subtotal + tax;
    return { subtotal, tax, total };
  }, [lines]);

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    setErr(null);
    try {
      // Normaliza dueDate
      const payload = {
        thirdPartyId: values.thirdPartyId,
        paymentType: values.paymentType,
        dueDate: values.paymentType === "CREDIT" ? values.dueDate : undefined,
        note: values.note || undefined,
        lines: values.lines.map(l => ({
          itemId: l.itemId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          discountPct: l.discountPct || 0,
          vatPct: l.vatPct || 0,
        })),
      };
      const created = await apiPost<{ id: number; number: number; total: number }>("/sales/invoices", payload);
      // Redirige a detalle (si luego haces /sales/[id]), por ahora a home:
      router.push(`/sales/${created.id}`);
    } catch (e: any) {
      setErr(e?.message || "Error creando factura");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6">Cargando…</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Nueva factura de venta</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Encabezado</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {err && <div className="sm:col-span-3 text-red-600 text-sm">{err}</div>}

          {/* Cliente */}
          <div className="space-y-1">
            <Label>Cliente</Label>
            <select className="border rounded-md h-10 px-3 w-full" {...register("thirdPartyId")}>
              <option value="">-- Selecciona cliente --</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.document ? ` (${c.document})` : ""}
                </option>
              ))}
            </select>
            {errors.thirdPartyId && <p className="text-red-600 text-xs">{errors.thirdPartyId.message}</p>}
          </div>

          {/* Tipo de pago */}
          <div className="space-y-1">
            <Label>Tipo de pago</Label>
            <select className="border rounded-md h-10 px-3 w-full" {...register("paymentType")}>
              <option value="CASH">Contado</option>
              <option value="CREDIT">Crédito</option>
            </select>
          </div>

          {/* Vencimiento (solo crédito) */}
          <div className="space-y-1">
            <Label>Vencimiento</Label>
            <Input type="date" {...register("dueDate")} />
            {errors.dueDate && <p className="text-red-600 text-xs">{errors.dueDate.message as string}</p>}
          </div>

          {/* Nota */}
          <div className="space-y-1 sm:col-span-3">
            <Label>Nota</Label>
            <Input placeholder="Observaciones…" {...register("note")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Líneas</CardTitle>
        </CardHeader>
        <CardContent>
          {errors.lines?.root && (
            <div className="text-red-600 text-sm mb-2">{errors.lines.root.message}</div>
          )}

          <div className="mb-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => append({ itemId: undefined as unknown as number, qty: 1, unitPrice: 0, vatPct: 0, discountPct: 0 })}
            >
              + Agregar línea
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{minWidth: 220}}>Ítem</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Desc. %</TableHead>
                <TableHead className="text-right">IVA %</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Sin líneas
                  </TableCell>
                </TableRow>
              ) : (
                fields.map((f, idx) => {
                  const l = lines?.[idx];
                  const qty = Number(l?.qty || 0);
                  const unitPrice = Number(l?.unitPrice || 0);
                  const disc = Number(l?.discountPct || 0) / 100;
                  const vat = Number(l?.vatPct || 0) / 100;
                  const base = Math.max(0, qty * unitPrice * (1 - disc));
                  const iva = base * vat;
                  const total = base + iva;

                  return (
                    <TableRow key={f.id}>
                      {/* Ítem */}
                      <TableCell>
                        <select
                          className="border rounded-md h-10 px-3 w-full"
                          value={l?.itemId ?? ""}
                          onChange={(e) => handleItemChange(idx, e.target.value)}
                        >
                          <option value="">-- Selecciona --</option>
                          {items.map(it => (
                            <option key={it.id} value={it.id}>
                              {it.sku} — {it.name}
                            </option>
                          ))}
                        </select>
                        {errors.lines?.[idx]?.itemId && (
                          <p className="text-red-600 text-xs">{errors.lines[idx]?.itemId?.message as string}</p>
                        )}
                      </TableCell>

                      {/* Cantidad */}
                      <TableCell className="text-right">
                        <Input type="number" step="any" className="text-right"
                          {...register(`lines.${idx}.qty` as const)} />
                        {errors.lines?.[idx]?.qty && (
                          <p className="text-red-600 text-xs">{errors.lines[idx]?.qty?.message as string}</p>
                        )}
                      </TableCell>

                      {/* Precio */}
                      <TableCell className="text-right">
                        <Input type="number" step="any" className="text-right"
                          {...register(`lines.${idx}.unitPrice` as const)} />
                        {errors.lines?.[idx]?.unitPrice && (
                          <p className="text-red-600 text-xs">{errors.lines[idx]?.unitPrice?.message as string}</p>
                        )}
                      </TableCell>

                      {/* Descuento */}
                      <TableCell className="text-right">
                        <Input type="number" step="any" className="text-right"
                          {...register(`lines.${idx}.discountPct` as const)} />
                      </TableCell>

                      {/* IVA */}
                      <TableCell className="text-right">
                        <Input type="number" step="any" className="text-right"
                          {...register(`lines.${idx}.vatPct` as const)} />
                      </TableCell>

                      {/* Base, IVA, Total calculados */}
                      <TableCell className="text-right">{money(base)}</TableCell>
                      <TableCell className="text-right">{money(iva)}</TableCell>
                      <TableCell className="text-right font-medium">{money(total)}</TableCell>

                      {/* Quitar */}
                      <TableCell className="text-right">
                        <Button type="button" variant="ghost" onClick={() => remove(idx)}>
                          Quitar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Totales */}
          <div className="mt-4 flex flex-col items-end gap-1">
            <div className="w-full sm:w-80 flex justify-between">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span className="font-medium">{money(computed.subtotal)}</span>
            </div>
            <div className="w-full sm:w-80 flex justify-between">
              <span className="text-sm text-muted-foreground">IVA</span>
              <span className="font-medium">{money(computed.tax)}</span>
            </div>
            <div className="w-full sm:w-80 flex justify-between">
              <span className="text-sm">Total</span>
              <span className="font-bold">{money(computed.total)}</span>
            </div>
          </div>

          {/* Guardar */}
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push("/")}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit(onSubmit)} disabled={saving}>
              {saving ? "Guardando…" : "Emitir factura"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
