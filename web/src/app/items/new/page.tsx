"use client";

import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// 1) Schema SIN default() en unit para evitar optional en el input type
const schema = z.object({
  sku: z.string().min(1, "Requerido"),
  name: z.string().min(1, "Requerido"),
  type: z.enum(["PRODUCT", "SERVICE"]),
  unit: z.string().min(1, "Requerido"),
  // coerce: permite que inputs "text/number" lleguen como string y se conviertan a number
  price: z.coerce.number().nonnegative().optional(),
  ivaPct: z.coerce.number().int().min(0).max(100).optional(),
});

// 2) Usa la salida del schema como tipo del formulario
type FormValues = z.infer<typeof schema>;

export default function NewItemPage() {
  const router = useRouter();

  // 3) Tipar el useForm + resolver
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: "PRODUCT", unit: "UN", ivaPct: 0 },
  });

  // 4) Tipar onSubmit
  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    try {
      await apiPost("/items", values);
      toast.success("Ítem creado");
      router.push("/items");
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || "Error creando ítem");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Nuevo ítem</h1>

      <Card>
        <CardHeader>
          <CardTitle>Datos básicos</CardTitle>
        </CardHeader>
        <CardContent>
          {/* 5) Tipar handleSubmit con el onSubmit anterior */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {/* Campo oculto para registrar "type" y evitar warnings */}
            <input type="hidden" {...register("type")} />

            <div>
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" placeholder="ARZ-001" {...register("sku")} />
              {errors.sku && (
                <p className="text-red-500 text-sm">{errors.sku.message}</p>
              )}
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" placeholder="Arroz 500g" {...register("name")} />
              {errors.name && (
                <p className="text-red-500 text-sm">{errors.name.message}</p>
              )}
            </div>

            <div>
              <Label>Tipo</Label>
              <Select
                defaultValue="PRODUCT"
                onValueChange={(v) =>
                  setValue("type", v as "PRODUCT" | "SERVICE", {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRODUCT">Producto</SelectItem>
                  <SelectItem value="SERVICE">Servicio</SelectItem>
                </SelectContent>
              </Select>
              {errors.type && (
                <p className="text-red-500 text-sm">{errors.type.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="unit">Unidad</Label>
              <Input id="unit" placeholder="UN" {...register("unit")} />
              {errors.unit && (
                <p className="text-red-500 text-sm">{errors.unit.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="price">Precio (venta)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                placeholder="0"
                {...register("price")}
              />
              {errors.price && (
                <p className="text-red-500 text-sm">
                  {errors.price.message as any}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="ivaPct">IVA %</Label>
              <Input
                id="ivaPct"
                type="number"
                step="1"
                placeholder="0"
                {...register("ivaPct")}
              />
              {errors.ivaPct && (
                <p className="text-red-500 text-sm">
                  {errors.ivaPct.message as any}
                </p>
              )}
            </div>

            <div className="sm:col-span-2 flex gap-3 pt-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Guardando..." : "Guardar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => history.back()}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
