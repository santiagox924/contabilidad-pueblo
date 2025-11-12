// app/(protected)/inventory/layout.tsx
'use client'

import { ReactNode, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import EditItemModal from '@/components/EditItemModal'
import { InventoryProvider } from './InventoryProvider'
import { Tabs } from '@/components/inventory/Tabs'
import QuickNewItemModal from '@/components/QuickNewItemModal'
import { USER_ROLES } from '@/lib/roles'

export default function InventoryLayout({ children }: { children: ReactNode }) {
  const qc = useQueryClient()

  // --- estado para modales compartidos
  const [editItemId, setEditItemId] = useState<number | undefined>()
  const [editOpen, setEditOpen] = useState(false)
  const [editWarehouseId, setEditWarehouseId] = useState<number | undefined>()

  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [quickCreateWarehouse, setQuickCreateWarehouse] = useState<number | undefined>()

  // Invalidación global (alineada con InventoryProvider)
  const invalidateAll = () => {
    const invalidate = (key: any) =>
      qc.invalidateQueries({ queryKey: key, refetchType: 'active' })

    invalidate(['stock:cell'])
    invalidate(['cost:cell'])
    invalidate(['moves'])
    invalidate(['layers'])
    invalidate(['kardex'])
    invalidate(['recipes:list'])

    qc.invalidateQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) &&
        typeof q.queryKey[0] === 'string' &&
        q.queryKey[0].startsWith('items'),
      refetchType: 'active',
    })

    qc.invalidateQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) &&
        typeof q.queryKey[0] === 'string' &&
        q.queryKey[0].startsWith('layers'),
      refetchType: 'active',
    })
  }

  return (
    <Protected roles={[USER_ROLES.INVENTORY, USER_ROLES.ACCOUNTING_ADMIN, USER_ROLES.ADMINISTRATOR, USER_ROLES.SUPER_ADMIN]}>
      <Navbar />

      <InventoryProvider
        openEditItem={(id, warehouseId) => {
          setEditItemId(id)
          setEditWarehouseId(warehouseId)
          setEditOpen(true)
        }}
        openQuickCreate={(warehouseId) => {
          setQuickCreateWarehouse(warehouseId)
          setQuickCreateOpen(true)
        }}
      >
        {/* Modal: Editar ítem (reutilizable) */}
        <EditItemModal
          itemId={editItemId}
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false)
            invalidateAll()
          }}
          warehouseId={editWarehouseId}  // ⬅️ bodega correcta para habilitar ajustes
          allowPrices
        />

        {/* Modal: Crear ítem rápido */}
        <QuickNewItemModal
          isOpen={quickCreateOpen}
          onClose={() => setQuickCreateOpen(false)}
          warehouseId={quickCreateWarehouse}
          onCreated={() => {
            setQuickCreateOpen(false)
            invalidateAll()
          }}
        />

        <main className="container my-6 space-y-6">
          <header className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold">Inventario</h1>
            <div className="flex gap-2 flex-wrap items-center">
              <Tabs />
              <button
                className="btn btn-outline btn-success"
                onClick={() => { setQuickCreateWarehouse(undefined); setQuickCreateOpen(true) }}
                title="Crear un nuevo ítem y (opcional) hacer entrada inicial a una bodega"
              >
                + Nuevo ítem
              </button>
            </div>
          </header>

          {/* Aquí se renderiza la subruta activa: /inventory/[tab] */}
          {children}
        </main>
      </InventoryProvider>
    </Protected>
  )
}
