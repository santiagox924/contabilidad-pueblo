'use client'
// app/(protected)/sales/page.tsx
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import { api } from '@/lib/api'
import { USER_ROLES } from '@/lib/roles'
import { money, toNum } from '@/lib/format'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type ThirdParty = { id: number; name: string; document?: string | null }
type SalesRow = {
  id: number
  number: number
  issueDate: string
  paymentType: 'CASH' | 'CREDIT'
  status: string
  subtotal: number | string
  tax: number | string
  total: number | string
  thirdPartyId: number
  thirdParty?: ThirdParty
  _count?: { lines: number }
}
type SalesListResponse = {
  items: SalesRow[]
  total: number
  page: number
  pageSize: number
  pages: number
}

function fmtDate(s?: string | null) {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s! : d.toISOString().slice(0, 10)
}

export default function SalesHome() {
  // filtros / controles
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [q, setQ] = useState('')
  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')
  const [paymentType, setPaymentType] = useState<'' | 'CASH' | 'CREDIT'>('')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')

  // ordenar por número de factura (recientes primero)
  const sort = 'number' as const

  // si cambian filtros (no la página), volvemos a la 1
  useEffect(() => {
    setPage(1)
  }, [q, from, to, paymentType, pageSize, order])

  const query = useQuery<SalesListResponse>({
    queryKey: ['sales', { page, pageSize, q, from, to, paymentType, sort, order }],
    queryFn: async () => {
      const params: Record<string, any> = { page, pageSize, sort, order }
      if (q.trim()) params.q = q.trim()
      if (from) params.from = from
      if (to) params.to = to
      if (paymentType) params.paymentType = paymentType
      const { data } = await api.get<SalesListResponse>('/sales', { params })
      return data
    },
    placeholderData: keepPreviousData,
    retry: false,
  })

  const items: SalesRow[] = query.data?.items ?? []
  const total: number = query.data?.total ?? 0
  const pages: number = query.data?.pages ?? 1

  return (
    <Protected roles={[
      USER_ROLES.SALES,
      USER_ROLES.ADMINISTRATOR,
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.ACCOUNTANT,
    ]}>
      <Navbar />
      <main className="container py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Ventas</h1>
          <Link className="btn btn-primary" href="/sales/new-invoice">Nueva factura</Link>
        </div>

        {/* Filtros */}
        <div className="card">
          <form
            className="grid md:grid-cols-5 gap-3"
            onSubmit={(e) => { e.preventDefault(); query.refetch() }}
          >
            <div className="md:col-span-2">
              <label className="label">Buscar</label>
              <input
                className="input"
                placeholder="Cliente, documento, nota o # exacto"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Desde</label>
              <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">Hasta</label>
              <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <label className="label">Tipo pago</label>
              <select className="input" value={paymentType} onChange={(e) => setPaymentType(e.target.value as any)}>
                <option value="">Todos</option>
                <option value="CASH">Contado</option>
                <option value="CREDIT">Crédito</option>
              </select>
            </div>

            <div className="flex gap-2 md:col-span-5">
              <button className="btn" type="submit" disabled={query.isFetching}>
                {query.isFetching ? 'Filtrando…' : 'Aplicar filtros'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => { setQ(''); setFrom(''); setTo(''); setPaymentType(''); setOrder('desc'); setPageSize(10) }}
              >
                Limpiar
              </button>

              <div className="ml-auto flex items-end gap-2">
                <div>
                  <label className="label">Orden</label>
                  <select className="input" value={order} onChange={(e) => setOrder(e.target.value as any)}>
                    <option value="desc">Recientes primero</option>
                    <option value="asc">Antiguas primero</option>
                  </select>
                </div>
                <div>
                  <label className="label">Por página</label>
                  <select
                    className="input"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Mensaje de error si algo falla */}
        {query.isError && (
          <div className="card border-red-300 bg-red-50">
            <div className="text-sm text-red-700">
              {(query.error as any)?.response?.data?.message || (query.error as Error).message || 'Error cargando ventas'}
            </div>
          </div>
        )}

        {/* Tabla */}
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="th">#</th>
                <th className="th">Fecha</th>
                <th className="th">Cliente</th>
                <th className="th">Documento</th>{/* ⬅️ NUEVO */}
                <th className="th">Pago</th>
                <th className="th">Estado</th>
                <th className="th">Líneas</th>
                <th className="th text-right">Subtotal</th>
                <th className="th text-right">IVA</th>
                <th className="th text-right">Total</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 && !query.isFetching && !query.isError && (
                <tr>
                  <td className="td" colSpan={11}>Sin resultados</td>
                </tr>
              )}
              {query.isFetching && (
                <tr>
                  <td className="td" colSpan={11}>Cargando…</td>
                </tr>
              )}

              {items.map((row: SalesRow) => (
                <tr key={row.id}>
                  <td className="td font-medium">#{row.number ?? row.id}</td>
                  <td className="td">{fmtDate(row.issueDate)}</td>
                  <td className="td">{row.thirdParty?.name ?? `#${row.thirdPartyId}`}</td>
                  <td className="td">{row.thirdParty?.document || '—'}</td>{/* ⬅️ NUEVO */}
                  <td className="td">{row.paymentType}</td>
                  <td className="td"><span className="badge">{row.status}</span></td>
                  <td className="td">{row._count?.lines ?? '—'}</td>
                  <td className="td text-right">{money(toNum(row.subtotal))}</td>
                  <td className="td text-right">{money(toNum(row.tax))}</td>
                  <td className="td text-right">{money(toNum(row.total))}</td>
                  <td className="td">
                    <Link className="btn" href={`/sales/${row.id}`}>Ver</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {total} resultados · Página {page} de {pages}
          </div>
          <div className="flex gap-2">
            <button
              className="btn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || query.isFetching}
            >
              ← Anterior
            </button>
            <button
              className="btn"
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages || query.isFetching}
            >
              Siguiente →
            </button>
          </div>
        </div>
      </main>
    </Protected>
  )
}
