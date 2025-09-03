"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  type: z.enum(["CLIENT", "PROVIDER", "EMPLOYEE", "OTHER"]),
  document: z.string().optional().or(z.literal("")),
  name: z.string().min(2, "Nombre requerido"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  paymentTermsDays: z.coerce.number().int().min(0).optional(),
  active: z.coerce.boolean().default(true),
});
type FormValues = z.infer<typeof schema>;

export default function NewPartyPage() {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "CLIENT",
      document: "",
      name: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      paymentTermsDays: 0,
      active: true,
    },
  });

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    setError(null);
    try {
      // Normaliza strings vacíos a undefined para opcionales
      const payload = {
        ...values,
        document: values.document || undefined,
        email: values.email || undefined,
        phone: values.phone || undefined,
        address: values.address || undefined,
        city: values.city || undefined,
      };
      await apiPost("/parties", payload);
      router.push("/parties");
    } catch (e: any) {
      setError(e?.message || "Error guardando tercero");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Nuevo tercero</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos del tercero</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <div className="text-red-600 text-sm mb-4">{error}</div>}

          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Tipo */}
            <div className="space-y-1">
              <Label>Tipo</Label>
              <select
                className="border rounded-md h-10 px-3"
                {...register("type")}
              >
                <option value="CLIENT">Cliente</option>
                <option value="PROVIDER">Proveedor</option>
                <option value="EMPLOYEE">Empleado</option>
                <option value="OTHER">Otro</option>
              </select>
            </div>

            {/* Documento */}
            <div className="space-y-1">
              <Label htmlFor="document">Documento</Label>
              <Input id="document" {...register("document")} />
            </div>

            {/* Nombre */}
            <div className="space-y-1">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" {...register("name")} />
              {errors.name && (
                <p className="text-red-600 text-xs">{errors.name.message}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && (
                <p className="text-red-600 text-xs">{errors.email.message}</p>
              )}
            </div>

            {/* Teléfono */}
            <div className="space-y-1">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" {...register("phone")} />
            </div>

            {/* Ciudad */}
            <div className="space-y-1">
              <Label htmlFor="city">Ciudad</Label>
              <Input id="city" {...register("city")} />
            </div>

            {/* Dirección */}
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="address">Dirección</Label>
              <Input id="address" {...register("address")} />
            </div>

            {/* Plazo */}
            <div className="space-y-1">
              <Label htmlFor="paymentTermsDays">Plazo (días)</Label>
              <Input id="paymentTermsDays" type="number" min={0} {...register("paymentTermsDays")} />
            </div>

            {/* Activo */}
            <div className="space-y-1 flex items-center gap-2">
              <input id="active" type="checkbox" {...register("active")} />
              <Label htmlFor="active">Activo</Label>
            </div>

            <div className="sm:col-span-2 flex justify-end gap-2 mt-2">
              <Button type="button" variant="outline" onClick={() => router.push("/parties")}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
