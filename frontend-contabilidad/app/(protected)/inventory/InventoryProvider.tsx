// app/(protected)/inventory/InventoryProvider.tsx
'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

type InventoryContextType = {
  invalidateAll: () => void
  openEditItem: (id: number, warehouseId?: number) => void
  openQuickCreate: (warehouseId?: number) => void
}

const InventoryContext = createContext<InventoryContextType | null>(null)

export function useInventory() {
  const ctx = useContext(InventoryContext)
  if (!ctx) {
    throw new Error('useInventory debe usarse dentro de <InventoryProvider>')
  }
  return ctx
}

export function InventoryProvider({
  children,
  openEditItem,
  openQuickCreate,
}: {
  children: ReactNode
  openEditItem: (id: number, warehouseId?: number) => void
  openQuickCreate: (warehouseId?: number) => void
}) {
  const qc = useQueryClient()

  const invalidateAll = () => {
    const invalidate = (key: any) =>
      qc.invalidateQueries({ queryKey: key, refetchType: 'active' })

    // Celdas y vistas de inventario
    invalidate(['stock:cell'])
    invalidate(['cost:cell'])
    invalidate(['moves'])
    invalidate(['layers'])
    invalidate(['kardex'])
    invalidate(['recipes:list'])

    // Todos los items:* (pickers y búsquedas)
    qc.invalidateQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) &&
        typeof q.queryKey[0] === 'string' &&
        q.queryKey[0].startsWith('items'),
      refetchType: 'active',
    })

    // Cualquier variante de layers
    qc.invalidateQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) &&
        typeof q.queryKey[0] === 'string' &&
        q.queryKey[0].startsWith('layers'),
      refetchType: 'active',
    })
  }

  return (
    <InventoryContext.Provider
      value={{ invalidateAll, openEditItem, openQuickCreate }}
    >
      {children}
    </InventoryContext.Provider>
  )
}
