'use client'

import { useMemo, useState } from 'react'
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { USER_ROLES } from '@/lib/roles'

const SECTIONS = [
    {
      title: 'Balance de prueba',
      href: '/accounting/balance-trial',
      desc: 'Resumen de débitos y créditos por cuenta en un rango de fechas.',
    },
    {
      title: 'Libro mayor',
      href: '/accounting/ledger',
      desc: 'Movimientos detallados por cuenta contable con filtro de fechas.',
    },
    {
      title: 'Libro diario general',
      href: '/accounting/general-journal',
      desc: 'Consolida todos los asientos con filtros por diario, cuenta, tercero o centro de costo.',
    },
    {
      title: 'Estado de resultados',
      href: '/accounting/income-statement',
      desc: 'Ingresos, costos y gastos del periodo seleccionado.',
    },
    {
      title: 'Balance general',
      href: '/accounting/balance-sheet',
      desc: 'Situación financiera a una fecha de corte.',
    },
    {
      title: 'Balance NIIF',
      href: '/accounting/niif-balance',
      desc: 'Estado de situación financiera conforme a la taxonomía NIIF.',
    },
    {
      title: 'Resultados NIIF',
      href: '/accounting/niif-income',
      desc: 'Resultado integral NIIF con comparativos y acumulado anual.',
    },
    {
      title: 'Flujo de efectivo NIIF',
      href: '/accounting/niif-cash-flow',
      desc: 'Flujos de operación, inversión y financiación bajo NIIF.',
    },
    {
      title: 'Libro de ventas',
      href: '/accounting/sales-book',
      desc: 'Listado de ventas del periodo con exportacion CSV.',
    },
    {
      title: 'Libro de compras',
      href: '/accounting/purchase-book',
      desc: 'Listado de compras del periodo con exportacion CSV.',
    },
    {
      title: 'Auxiliar por cuenta',
      href: '/accounting/aux-ledger-account',
      desc: 'Saldo inicial, movimientos y cierre de una cuenta contable.',
    },
    {
      title: 'Auxiliar por tercero',
      href: '/accounting/aux-ledger-third-party',
      desc: 'Cruza las cuentas del tercero con sus movimientos y saldos.',
    },
    {
      title: 'Auxiliar por centro de costo',
      href: '/accounting/aux-ledger-cost-center',
      desc: 'Analiza los movimientos y saldos asociados a un centro de costo.',
    },
    {
      title: 'IVA',
      href: '/accounting/vat',
      desc: 'Resumen de IVA del periodo y exportacion CSV.',
    },
    {
      title: 'Antiguedad de saldos',
      href: '/accounting/aging',
      desc: 'Vencimientos por cliente/proveedor con exportacion CSV.',
    },
    {
      title: 'COGS / Costo de ventas',
      href: '/accounting/cogs',
      desc: 'Costo de ventas en el periodo y exportaci��n CSV.',
    },
    {
      title: 'Asientos contables',
      href: '/accounting/journals',
      desc: 'Gestion de diarios: crear, editar, publicar y reversar asientos.',
    },
    {
      title: 'Kardex',
      href: '/accounting/kardex',
      desc: 'Movimientos de inventario por producto y exportacion CSV.',
    },
    {
      title: 'Asiento manual',
      href: '/accounting/manual-entry',
      desc: 'Registrar asientos contables manuales balanceados.',
    },
    {
      title: 'Cierre de período',
      href: '/accounting/close-period',
      desc: 'Ejecutar cierre contable mensual con validaciones.',
    },
    {
      title: 'Cierre anual',
      href: '/accounting/close-year',
      desc: 'Traslada el resultado del ejercicio a patrimonio cuando los 12 meses están cerrados.',
    },
    {
      title: 'Mapa contable',
      href: '/accounting/accounts-map',
      desc: 'Configura los códigos contables clave que usa el motor de asientos.',
    },
    {
      title: 'Conciliación bancaria',
      href: '/accounting/reconciliation',
      desc: 'Importa extractos bancarios y gestiona su conciliación.',
    },
    {
      title: 'Plan de cuentas',
      href: '/accounts',
      desc: 'Consulta y búsqueda del catálogo de cuentas.',
    },
]

function AccountingContent() {
  const sections = SECTIONS

  const [search, setSearch] = useState('')
  const normalize = (value: string) =>
    value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const normalizedQuery = normalize(search.trim())
  const filteredSections = useMemo(() => {
    if (!normalizedQuery) return sections
    return sections.filter((section) => {
      const haystack = normalize(`${section.title} ${section.desc}`)
      return haystack.includes(normalizedQuery)
    })
  }, [normalizedQuery])

  return (
    <main className="container mx-auto p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Contabilidad</h1>
          <p className="text-sm text-gray-500">
            Accede a los reportes financieros y operaciones del módulo contable.
          </p>
        </div>
        <Link href="/dashboard" className="btn btn-ghost">Volver al dashboard</Link>
      </div>

      <div className="mb-6 w-full md:w-96">
        <label htmlFor="accounting-search" className="sr-only">Buscar reportes contables</label>
        <input
          id="accounting-search"
          className="input w-full"
          type="search"
          placeholder="Buscar reportes, libros o herramientas contables"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filteredSections.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredSections.map((s) => (
            <div
              key={s.href}
              className="rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md"
            >
              <div className="mb-2">
                <h2 className="text-lg font-medium">{s.title}</h2>
              </div>
              <p className="mb-4 text-sm text-gray-600">{s.desc}</p>
              <div className="flex items-center justify-end">
                <Link href={s.href} className="btn btn-outline">
                  Ir
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border bg-white p-6 text-center text-sm text-gray-600">
          No encontramos resultados para {`"${search}"`}. Intenta con otro término o revisa los reportes disponibles.
        </div>
      )}
    </main>
  )
}

export default function AccountingPage() {
  return (
    <Protected roles={[USER_ROLES.ACCOUNTING_ADMIN, USER_ROLES.ACCOUNTANT, USER_ROLES.SUPER_ADMIN]}>
      <Navbar />
      <AccountingContent />
    </Protected>
  )
}
