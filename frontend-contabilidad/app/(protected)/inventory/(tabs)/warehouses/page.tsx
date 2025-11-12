// app/(protected)/inventory/(tabs)/warehouses/page.tsx
'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listWarehouses, createWarehouse } from '@/lib/inventory'

export default function WarehousesPage() {
  const qc = useQueryClient()
  const { data, isFetching } = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
    staleTime: 60_000,
  })

  const warehouses = Array.isArray(data) ? data : []
  const [name, setName] = useState('')

  const createMut = useMutation({
    mutationFn: () => createWarehouse(name.trim()),
    onSuccess: async () => {
      setName('')
      await qc.invalidateQueries({ queryKey: ['warehouses'] })
    },
  })

  const canCreate = name.trim().length > 0 && !createMut.isPending

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Bodegas</h2>

      <div className="grid md:grid-cols-[1fr_auto] gap-3">
        <input
          className="input"
          placeholder="Nombre de la bodega…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canCreate) createMut.mutate()
          }}
        />
        <button
          className="btn btn-primary"
          disabled={!canCreate}
          onClick={() => createMut.mutate()}
        >
          {createMut.isPending ? 'Creando…' : 'Crear'}
        </button>
      </div>

      <div className="overflow-auto rounded-lg border">
        <table className="table">
          <thead>
            <tr>
              <th className="th">ID</th>
              <th className="th">Nombre</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {warehouses.map((w: any) => (
              <tr key={w.id}>
                <td className="td">{w.id}</td>
                <td className="td">{w.name}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {isFetching && (
          <p className="text-gray-600 mt-2 px-3 pb-3">Cargando…</p>
        )}
        {!isFetching && warehouses.length === 0 && (
          <p className="text-gray-600 mt-2 px-3 pb-3">Aún no hay bodegas.</p>
        )}
      </div>
    </section>
  )
}
