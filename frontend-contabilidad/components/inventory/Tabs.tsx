// components/inventory/Tabs.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

const tabs = [
  { slug: 'stock',       label: 'Stock' },
  { slug: 'categories',  label: 'Categorías' },
  { slug: 'adjust',      label: 'Ajuste inventario' },
  { slug: 'kardex',      label: 'Kardex' },
  { slug: 'moves',       label: 'Movimientos' },
  { slug: 'layers',      label: 'Capas' },
  { slug: 'warehouses',  label: 'Bodegas' },
  { slug: 'recipes',     label: 'Recetas' },
  { slug: 'produce',     label: 'Producción' },
  { slug: 'transfer',    label: 'Transferencias' },
] as const

export function Tabs() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-2 flex-wrap">
      {tabs.map((t) => {
        const href = `/inventory/${t.slug}`
        const active = pathname?.startsWith(href)

        return (
          <Link
            key={t.slug}
            href={href}
            className={clsx(
              'btn btn-sm',
              active ? 'btn-primary' : 'btn-ghost'
            )}
            prefetch
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
