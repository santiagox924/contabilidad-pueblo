'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { useAuth } from '@/lib/auth'
import React from 'react'
import { USER_ROLES, type UserRoleCode } from '@/lib/roles'

const NavLink = ({
  href,
  children,
  match = 'exact',
}:{
  href: string
  children: React.ReactNode
  match?: 'exact' | 'startsWith'
}) => {
  const pathname = usePathname()
  const active = match === 'startsWith' ? pathname.startsWith(href) : pathname === href
  return (
    <Link
      className={clsx(
        'px-3 py-2 text-sm text-gray-600 hover:text-gray-900',
        { 'active': active }
      )}
      href={href}
    >
      {children}
    </Link>
  )
}

export default function Navbar(){
  const { user, logout, hasAnyRole } = useAuth()
  const userRoles = user?.roles ?? []

  const links: Array<{
    href: string
    label: string
    match?: 'exact' | 'startsWith'
    roles?: UserRoleCode[]
  }> = [
    { href: '/dashboard', label: 'Dashboard', match: 'startsWith' },
    {
      href: '/parties',
      label: 'Terceros',
      match: 'startsWith',
      roles: [
        USER_ROLES.ACCOUNTING_ASSISTANT,
        USER_ROLES.ACCOUNTANT,
        USER_ROLES.ACCOUNTING_ADMIN,
        USER_ROLES.ADMINISTRATOR,
        USER_ROLES.SUPER_ADMIN,
        USER_ROLES.SALES,
        USER_ROLES.PURCHASING,
      ],
    },
    {
      href: '/sales',
      label: 'Ventas',
      match: 'startsWith',
      roles: [USER_ROLES.SALES, USER_ROLES.ADMINISTRATOR, USER_ROLES.SUPER_ADMIN],
    },
    {
      href: '/purchases',
      label: 'Compras',
      match: 'startsWith',
      roles: [USER_ROLES.PURCHASING, USER_ROLES.ADMINISTRATOR, USER_ROLES.SUPER_ADMIN],
    },
    {
      href: '/inventory',
      label: 'Inventario',
      match: 'startsWith',
      roles: [
        USER_ROLES.INVENTORY,
        USER_ROLES.ACCOUNTING_ADMIN,
        USER_ROLES.ADMINISTRATOR,
        USER_ROLES.SUPER_ADMIN,
      ],
    },
    {
      href: '/treasury',
      label: 'Tesorería',
      match: 'startsWith',
      roles: [USER_ROLES.TREASURY, USER_ROLES.ACCOUNTANT, USER_ROLES.SUPER_ADMIN],
    },
    {
      href: '/accounting',
      label: 'Contabilidad',
      match: 'startsWith',
      roles: [
        USER_ROLES.ACCOUNTING_ADMIN,
        USER_ROLES.ACCOUNTANT,
        USER_ROLES.SUPER_ADMIN,
      ],
    },
    // Eliminado enlace de empleados de la barra superior
  ]

  const visibleLinks = links.filter((link) => {
    if (!link.roles || link.roles.length === 0) return true
    if (userRoles.includes(USER_ROLES.SUPER_ADMIN)) return true
    return hasAnyRole(link.roles)
  })
  return (
    <header className="bg-white border-b">
      <div className="container flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-semibold text-gray-900">Contabilidad Pueblo</Link>
          <nav className="flex items-center gap-1">
            {visibleLinks.map((link) => (
              <NavLink key={link.href} href={link.href} match={link.match}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/sales/quick-sale"
            className="px-4 py-2 rounded-lg bg-green-500 text-white hover:opacity-90"
          >
            Venta rápida
          </Link>
          {user?.email && <span className="text-sm text-gray-600">{user.email}</span>}
          <button className="btn" onClick={logout}>Salir</button>
        </div>
      </div>
    </header>
  )
}
