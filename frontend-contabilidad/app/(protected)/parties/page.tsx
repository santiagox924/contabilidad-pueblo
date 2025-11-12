'use client'

// app/(protected)/parties/page.tsx
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import { api } from '@/lib/api'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { USER_ROLES } from '@/lib/roles'

type PartyType = 'CLIENT'|'PROVIDER'|'EMPLOYEE'|'OTHER'
type PersonKind = 'NATURAL' | 'JURIDICAL'
type IdType = 'NIT' | 'CC' | 'PASSPORT' | 'OTHER'

type Party = {
  id: number
  name: string
  type: PartyType
  personKind?: PersonKind | null
  idType?: IdType | null
  legalRepName?: string | null
  document?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  active?: boolean | null
  responsibilities?: string[] | null
}

// Normalizador compatible con respuestas tipo Axios y variantes comunes
function normalizeArray(res: any): any[] {
  const x = res && typeof res === 'object' && 'data' in res ? (res as any).data : res
  if (Array.isArray(x)) return x
  if (!x || typeof x !== 'object') return []
  if (Array.isArray((x as any).items)) return (x as any).items
  if (Array.isArray((x as any).data)) return (x as any).data
  if (Array.isArray((x as any).results)) return (x as any).results
  return []
}

export default function PartiesPage() {
  const [rows, setRows] = useState<Party[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const res = await api.get('/parties')
      setRows(normalizeArray(res))
    } catch (e: any) {
      setErr(e?.message ?? 'Error cargando terceros')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter(r => {
      const inStrings =
        (r.name ?? '').toLowerCase().includes(term) ||
        (r.document ?? '').toLowerCase().includes(term) ||
        (r.email ?? '').toLowerCase().includes(term) ||
        (r.legalRepName ?? '').toLowerCase().includes(term)
      const inResp = Array.isArray(r.responsibilities)
        ? (r.responsibilities as string[]).some(s => (s ?? '').toLowerCase().includes(term))
        : false
      return inStrings || inResp
    })
  }, [rows, q])

  async function remove(id: number) {
    if (!confirm('¿Eliminar este tercero? Esta acción no se puede deshacer.')) return
    try {
      await api.delete(`/parties/${id}`)
      setRows(prev => prev.filter(r => r.id !== id))
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? 'No se pudo eliminar'
      alert(Array.isArray(msg) ? msg.join(', ') : String(msg))
    }
  }

  return (
    <Protected roles={[
      USER_ROLES.ACCOUNTING_ASSISTANT,
      USER_ROLES.ACCOUNTANT,
      USER_ROLES.ACCOUNTING_ADMIN,
      USER_ROLES.ADMINISTRATOR,
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.SALES,
      USER_ROLES.PURCHASING,
    ]}>
      <Navbar />
      <main className="container py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Terceros</h1>
            <p className="text-sm text-gray-500">Administra clientes, proveedores y más.</p>
          </div>
          <Link href="/parties/new" className="btn btn-primary">Nuevo tercero</Link>
        </div>

        {/* Filtros / acciones */}
        <div className="card">
          <form
            className="grid md:grid-cols-5 gap-3"
            onSubmit={(e) => { e.preventDefault(); load() }}
          >
            <div className="md:col-span-2">
              <label className="label">Buscar</label>
              <input
                className="input"
                placeholder="Documento, nombre, correo, representante o responsabilidad"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <div className="flex items-end gap-2 md:col-span-3">
              <button className="btn" type="submit" disabled={loading}>
                {loading ? 'Actualizando…' : 'Aplicar filtro'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => { setQ(''); load() }}
                disabled={loading}
              >
                Limpiar
              </button>
            </div>
          </form>
        </div>

        {/* Error */}
        {err && (
          <div className="card border-red-300 bg-red-50">
            <div className="text-sm text-red-700">{err}</div>
          </div>
        )}

        {/* Tabla */}
        <div className="card">
          <div className="-mx-2 overflow-x-auto">
            <table className="table table-fixed text-sm">
              {/* Control de anchos para compactar y evitar scroll horizontal */}
              <colgroup>
                <col className="w-32" /> {/* Documento */}
                <col className="w-44" /> {/* Nombre */}
                <col className="w-24" /> {/* Tipo */}
                <col className="w-24" /> {/* Persona */}
                <col className="w-20" /> {/* Tipo ID */}
                <col className="w-40" /> {/* Rep. legal */}
                <col className="w-44" /> {/* Correo */}
                <col className="w-28" /> {/* Teléfono */}
                <col className="w-28" /> {/* Ciudad */}
                <col className="w-24" /> {/* Estado */}
                <col className="w-52" /> {/* Acciones */}
              </colgroup>
              <thead>
                <tr className="whitespace-nowrap">
                  <th className="th">Documento</th>
                  <th className="th">Nombre</th>
                  <th className="th">Tipo</th>
                  <th className="th">Persona</th>
                  <th className="th">Tipo ID</th>
                  <th className="th">Rep. legal</th>
                  <th className="th">Correo</th>
                  <th className="th">Teléfono</th>
                  <th className="th">Ciudad</th>
                  <th className="th">Estado</th>
                  <th className="th text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && (
                  <tr>
                    <td className="td" colSpan={11}>Cargando…</td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td className="td text-gray-500" colSpan={11}>No hay resultados.</td>
                  </tr>
                )}

                {filtered.map(r => (
                  <tr key={r.id} className="align-top">
                    {/* Documento */}
                    <td className="td whitespace-nowrap">{r.document ?? '—'}</td>

                    {/* Nombre (truncate para compactar) */}
                    <td className="td">
                      <div className="truncate" title={r.name}>{r.name}</div>
                      {/* Si es jurídica y tiene responsabilidades, mostrarlas pequeño (opcional) */}
                      {r.personKind === 'JURIDICAL' && Array.isArray(r.responsibilities) && r.responsibilities.length > 0 && (
                        <div className="text-[11px] text-gray-500 mt-0.5 truncate" title={r.responsibilities.join(', ')}>
                          {r.responsibilities.join(', ')}
                        </div>
                      )}
                    </td>

                    {/* Tipo */}
                    <td className="td whitespace-nowrap">
                      {r.type === 'CLIENT' && 'Cliente'}
                      {r.type === 'PROVIDER' && 'Proveedor'}
                      {r.type === 'EMPLOYEE' && 'Empleado'}
                      {r.type === 'OTHER' && 'Otro'}
                    </td>

                    {/* Persona */}
                    <td className="td whitespace-nowrap">
                      {r.personKind === 'JURIDICAL' ? 'Jurídica' : 'Natural'}
                    </td>

                    {/* Tipo ID */}
                    <td className="td whitespace-nowrap">
                      {r.idType === 'NIT' && 'NIT'}
                      {r.idType === 'CC' && 'CC'}
                      {r.idType === 'PASSPORT' && 'Pasaporte'}
                      {r.idType === 'OTHER' && 'Otro'}
                      {/* Soporte por si viniera undefined/null */}
                      {!r.idType && '—'}
                    </td>

                    {/* Rep. legal (solo si es jurídica) */}
                    <td className="td">
                      <div className="truncate" title={r.legalRepName || undefined}>
                        {r.personKind === 'JURIDICAL' ? (r.legalRepName || '—') : '—'}
                      </div>
                    </td>

                    {/* Correo */}
                    <td className="td">
                      <div className="truncate" title={r.email || undefined}>{r.email ?? '—'}</div>
                    </td>

                    {/* Teléfono */}
                    <td className="td whitespace-nowrap">{r.phone ?? '—'}</td>

                    {/* Ciudad */}
                    <td className="td whitespace-nowrap">{r.city ?? '—'}</td>

                    {/* Estado */}
                    <td className="td whitespace-nowrap">
                      <span className={`badge ${r.active === false ? 'badge-ghost' : 'badge-success'} badge-outline`}>
                        {r.active === false ? 'Inactivo' : 'Activo'}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="td">
                      <div className="flex flex-nowrap gap-1 justify-end">
                        <Link
                          href={`/sales/new-invoice?partyId=${r.id}`}
                          className="btn btn-xs btn-outline"
                          title="Usar en factura"
                        >
                          Facturar
                        </Link>
                        <Link
                          href={`/parties/${r.id}`}
                          className="btn btn-xs"
                          title="Editar tercero"
                        >
                          Editar
                        </Link>
                        <button
                          className="btn btn-xs btn-ghost"
                          title="Eliminar tercero"
                          onClick={() => remove(r.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </Protected>
  )
}
