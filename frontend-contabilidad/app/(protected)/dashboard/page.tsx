'use client'
// app/(protected)/dashboard/page.tsx
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { USER_ROLES, type UserRoleCode } from '@/lib/roles'
import { money } from '@/lib/format'
import { MiniLine, SimpleBars, Donut } from '@/components/Charts'

/** ===== Helpers de red ===== */
async function getData(url: string, params?: Record<string, any>) {
  const res = await api.get(url, { params })
  return (res && typeof res === 'object' && 'data' in res) ? (res as any).data : (res as any)
}

/** ===== Helpers de números robustos ===== */
function normKey(k: string) {
  return k
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}
function toNum(v: any): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const s = v.replace(/\s/g, '').replace(/,/g, '')
    const n = Number(s)
    if (!Number.isNaN(n) && Number.isFinite(n)) return n
  }
  return undefined
}
function deepPickNumber(root: any, aliases: string[], maxDepth = 6): number | undefined {
  if (!root || typeof root !== 'object') return undefined
  const aliasSet = new Set(aliases.map(normKey))
  const q: Array<{ v: any; d: number }> = [{ v: root, d: 0 }]
  while (q.length) {
    const { v, d } = q.shift()!
    if (d > maxDepth || v == null) continue
    if (Array.isArray(v)) { for (const it of v) q.push({ v: it, d: d + 1 }); continue }
    if (typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        const nk = normKey(k)
        if (aliasSet.has(nk)) {
          const n = toNum(val)
          if (n !== undefined) return n
        }
        if (aliasSet.has(nk) && typeof val === 'object') {
          const n2 = deepPickNumber(val, ['value','amount','total','sum','saldo','monto','importe'], 1)
          if (n2 !== undefined) return n2
        }
        q.push({ v: val as any, d: d + 1 })
      }
    }
  }
  return undefined
}
function pickSeries(obj: any): Array<{ label: string; value: number }> | undefined {
  if (!obj) return undefined
  const candidates = ['series','timeline','history','byMonth','byPeriod','data','items']
  for (const key of candidates) {
    const arr = obj?.[key]
    if (Array.isArray(arr) && arr.length) {
      const mapped = arr.map((row: any, i: number) => {
        const value = toNum(row?.value ?? row?.amount ?? row?.total ?? row?.y ?? row?.val)
        const label = String(row?.label ?? row?.period ?? row?.month ?? row?.x ?? row?.name ?? `P${i+1}`)
        return { label, value: value ?? 0 }
      })
      if (mapped.some(p => p.value !== 0)) return mapped
    }
  }
  return undefined
}

/** ===== Aliases de claves ===== */
const INCOME_ALIASES = ['income','revenue','ingresos','ventas','sales','totalIncome','totalRevenue']
const EXPENSE_ALIASES = ['expenses','costs','gastos','costoVentas','cogs','totalExpenses','totalCosts','costOfSales']
const NET_ALIASES = ['netIncome','utilidad','resultado','profit','ganancia','beneficio']
const ASSETS_ALIASES = ['assets','activos','totalAssets']
const LIAB_ALIASES = ['liabilities','pasivos','totalLiabilities']
const EQUITY_ALIASES = ['equity','patrimonio','totalEquity']

export default function Dashboard(){
  const { hasAnyRole } = useAuth()
  const todayIso = new Date().toISOString().slice(0,10)
  const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10)

  const [from, setFrom] = useState<string>(thisMonthStart)
  const [to, setTo] = useState<string>(todayIso)
  const [asOf, setAsOf] = useState<string>(todayIso)

  // ====== Queries ======
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => getData('/auth/health'),
    staleTime: 60_000,
  })

  const income = useQuery({
    queryKey: ['income-statement', { from, to }],
    queryFn: async () => getData('/accounting/income-statement', { from, to }),
    placeholderData: keepPreviousData,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    staleTime: 0,
    enabled: !!from && !!to,
  })

  const balance = useQuery({
    queryKey: ['balance-sheet', { asOf }],
    queryFn: async () => getData('/accounting/balance-sheet', { asOf }),
    placeholderData: keepPreviousData,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    staleTime: 0,
    enabled: !!asOf,
  })

  // === NUEVO: cuentas para widget de Maestros ===
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => getData('/accounts'),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
  const accList: Array<{ code?: string; name?: string }> = Array.isArray(accounts.data)
    ? accounts.data
    : (accounts.data?.data ?? [])
  const accPreview = (accList ?? []).slice(0, 8)

  // ====== KPIs ======
  const ingresos = useMemo(() => deepPickNumber(income.data, INCOME_ALIASES), [income.data])
  const gastos   = useMemo(() => deepPickNumber(income.data, EXPENSE_ALIASES), [income.data])
  const utilidad = useMemo(() => {
    const direct = deepPickNumber(income.data, NET_ALIASES)
    if (direct !== undefined) return direct
    if (ingresos !== undefined && gastos !== undefined) return ingresos - gastos
    return undefined
  }, [income.data, ingresos, gastos])

  const activos = useMemo(() => deepPickNumber(balance.data, ASSETS_ALIASES), [balance.data])
  const pasivos = useMemo(() => deepPickNumber(balance.data, LIAB_ALIASES), [balance.data])
  const patrimonio = useMemo(() => {
    const direct = deepPickNumber(balance.data, EQUITY_ALIASES)
    if (direct !== undefined) return direct
    if (activos !== undefined && pasivos !== undefined) return activos - pasivos
    return undefined
  }, [balance.data, activos, pasivos])

  // ====== Series ======
  const utilidadSeries = useMemo(() => {
    const real = pickSeries(income.data)
    if (real && real.length) return real
    const u = Math.max(0, utilidad ?? 0)
    return [
      { label: 'W1', value: Math.round(u * 0.7) },
      { label: 'W2', value: Math.round(u * 0.9) },
      { label: 'W3', value: Math.round(u * 1.1) },
      { label: 'W4', value: Math.round(u * 1.0) },
    ]
  }, [income.data, utilidad])

  const barsIG = useMemo(() => ([
    { label: 'Ingresos', value: ingresos ?? 0 },
    { label: 'Gastos',   value: gastos   ?? 0 },
  ]), [ingresos, gastos])

  const donutBalance = useMemo(() => ([
    { name: 'Activos', value: activos    ?? 0 },
    { name: 'Pasivos', value: pasivos    ?? 0 },
    { name: 'Patrim.', value: patrimonio ?? 0 },
  ]), [activos, pasivos, patrimonio])

  const modules: Array<{
    title: string
    href: string
    desc: string
    roles?: UserRoleCode[]
  }> = [
    {
      title: 'Ventas',
      href: '/sales',
      desc: 'Punto de venta, facturación y reportes comerciales.',
      roles: [USER_ROLES.SALES, USER_ROLES.ADMINISTRATOR, USER_ROLES.SUPER_ADMIN],
    },
    {
      title: 'Compras',
      href: '/purchases',
      desc: 'Gestión de órdenes y facturas de proveedores.',
      roles: [USER_ROLES.PURCHASING, USER_ROLES.ADMINISTRATOR, USER_ROLES.SUPER_ADMIN],
    },
    {
      title: 'Inventario',
      href: '/inventory',
      desc: 'Control de existencias, movimientos y valorización.',
      roles: [
        USER_ROLES.INVENTORY,
        USER_ROLES.ACCOUNTING_ADMIN,
        USER_ROLES.ADMINISTRATOR,
        USER_ROLES.SUPER_ADMIN,
      ],
    },
    {
      title: 'Tesorería',
      href: '/treasury',
      desc: 'Gestión de caja, bancos y conciliaciones.',
      roles: [USER_ROLES.TREASURY, USER_ROLES.ACCOUNTANT, USER_ROLES.SUPER_ADMIN],
    },
    {
      title: 'Contabilidad',
      href: '/accounting',
      desc: 'Reportes contables, asientos y cierres.',
      roles: [
        USER_ROLES.ACCOUNTING_ADMIN,
        USER_ROLES.ACCOUNTANT,
        USER_ROLES.SUPER_ADMIN,
      ],
    },
    {
      title: 'Terceros',
      href: '/parties',
      desc: 'Clientes, proveedores y fichas maestras.',
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
  ]

  const visibleModules = modules.filter((module) =>
    module.roles ? hasAnyRole(module.roles) : true,
  )

  return (
    <Protected>
      <Navbar />
      <main className="container py-8 space-y-6">
        <div className="card flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="text-sm text-gray-600">
              API: <span className="badge">{health.data?.ok ? 'OK' : '—'}</span>
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <label className="text-sm text-gray-600 flex items-center gap-2">
              <span>Desde</span>
              <input className="input" type="date" value={from} onChange={e=>{ const v=e.target.value; if (v) setFrom(v) }} />
            </label>
            <label className="text-sm text-gray-600 flex items-center gap-2">
              <span>Hasta</span>
              <input className="input" type="date" value={to} onChange={e=>{ const v=e.target.value; if (v) setTo(v) }} />
            </label>
            <label className="text-sm text-gray-600 flex items-center gap-2">
              <span>Balance a</span>
              <input className="input" type="date" value={asOf} onChange={e=>{ const v=e.target.value; if (v) setAsOf(v) }} />
            </label>
          </div>
        </div>

        {/* KPIs */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="card">
            <div className="text-sm text-gray-600">Ingresos</div>
            <div className="mt-1 text-2xl font-semibold">{money(ingresos ?? 0)}</div>
            {income.isFetching && <p className="text-xs text-gray-500 mt-1">Actualizando…</p>}
          </div>
          <div className="card">
            <div className="text-sm text-gray-600">Gastos/Costos</div>
            <div className="mt-1 text-2xl font-semibold">{money(gastos ?? 0)}</div>
            {income.isFetching && <p className="text-xs text-gray-500 mt-1">Actualizando…</p>}
          </div>
          <div className="card">
            <div className="text-sm text-gray-600">Utilidad</div>
            <div className="mt-1 text-2xl font-semibold">{money(utilidad ?? ((ingresos ?? 0) - (gastos ?? 0)))}</div>
            <MiniLine data={utilidadSeries} dataKey="value" xKey="label" />
          </div>
        </section>

        {/* Gráficos */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <h2 className="text-lg font-semibold mb-2">Ingresos vs Gastos</h2>
            <SimpleBars data={barsIG} xKey="label" yKey="value" />
          </div>
          <div className="card">
            <h2 className="text-lg font-semibold mb-2">Estructura del Balance</h2>
            <Donut data={donutBalance} nameKey="name" valueKey="value" />
            {balance.isFetching && <p className="text-xs text-gray-500 mt-2">Actualizando…</p>}
          </div>
        </section>

        {/* Accesos rápidos a módulos */}
        {visibleModules.length > 0 && (
          <section className="grid gap-4 md:grid-cols-3">
            {visibleModules.map((module) => (
              <div key={module.href} className="card h-full">
                <h2 className="text-lg font-semibold">{module.title}</h2>
                <p className="mt-2 text-sm text-gray-600">{module.desc}</p>
                <Link
                  href={module.href}
                  className="mt-4 inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Entrar
                </Link>
              </div>
            ))}
          </section>
        )}

        {/* === NUEVO: Sección Maestros === */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Plan de cuentas</h2>
                <p className="text-sm text-gray-600">
                  {(accounts.isLoading || accounts.isFetching) && 'Cargando…'}
                  {!accounts.isLoading && !accounts.isError && (
                    <>
                      Total:&nbsp;
                      <span className="badge">
                        {accList?.length ?? 0}
                      </span>
                    </>
                  )}
                  {accounts.isError && <span className="text-red-600">No se pudo cargar.</span>}
                </p>
              </div>
              <Link
                href="/accounts"
                className="rounded-xl bg-black px-3 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Ir a cuentas
              </Link>
            </div>

            {/* Preview de cuentas */}
            {!accounts.isError && accPreview?.length > 0 && (
              <div className="mt-4 overflow-hidden rounded-xl border">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Código</th>
                      <th className="px-3 py-2 text-left font-medium">Nombre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accPreview.map((a, i) => (
                      <tr key={`${a.code}-${i}`} className="border-t">
                        <td className="px-3 py-2 font-mono tabular-nums">{a.code}</td>
                        <td className="px-3 py-2">{a.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(!accounts.isLoading && !accounts.isError && (accPreview?.length ?? 0) === 0) && (
              <p className="text-sm text-gray-500 mt-3">Aún no hay cuentas creadas.</p>
            )}
          </div>

          {/* Espacio para otras tarjetas de Maestros (por ejemplo, Categorías) */}
          <div className="card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Categorías</h2>
                <p className="text-sm text-gray-600">
                  Conecta tu UI a <code className="bg-gray-50 px-1 py-0.5 rounded">/categories</code>.
                </p>
              </div>
              <Link
                href="/items" // cambia si tienes una página específica de categorías
                className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
              >
                Ver más
              </Link>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Si ya creaste <code>lib/categories.ts</code>, puedes añadir un widget similar al de cuentas.
            </p>
          </div>
        </section>

        {/* Debug */}
        <details className="card">
          <summary className="cursor-pointer font-medium">Ver JSON bruto</summary>
          <div className="mt-3 grid md:grid-cols-2 gap-4 text-xs">
            <div>
              <h3 className="font-semibold mb-1">Income Statement</h3>
              <pre className="bg-gray-50 p-3 rounded-xl overflow-auto">{JSON.stringify(income.data, null, 2)}</pre>
            </div>
            <div>
              <h3 className="font-semibold mb-1">Balance Sheet</h3>
              <pre className="bg-gray-50 p-3 rounded-xl overflow-auto">{JSON.stringify(balance.data, null, 2)}</pre>
            </div>
          </div>
        </details>
      </main>
    </Protected>
  )
}
