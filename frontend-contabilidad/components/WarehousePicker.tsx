// components/WarehousePicker.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { listWarehouses } from '@/lib/inventory'

export function WarehousePicker({
  value,
  onChange,
  label = 'Bodega',
}: {
  value?: number
  onChange: (id?: number) => void
  label?: string
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
    staleTime: 60_000,
  })

  const warehouses = Array.isArray(data) ? data : []

  return (
    <div className="flex flex-col gap-1">
      <label className="label">{label}</label>
      <select
        className="input"
        value={value ?? ''}
        onChange={(e) =>
          onChange(e.target.value ? Number(e.target.value) : undefined)
        }
      >
        <option value="">— Selecciona —</option>
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      {isLoading && (
        <p className="text-xs text-gray-500 mt-1">Cargando bodegas…</p>
      )}
    </div>
  )
}
