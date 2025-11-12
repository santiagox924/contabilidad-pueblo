'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'

type AccountsMap = Record<string, string>

function isDirtyMap(current: AccountsMap, baseline: AccountsMap | null) {
  if (!baseline) return Object.keys(current).length > 0
  const keys = new Set([...Object.keys(baseline), ...Object.keys(current)])
  for (const key of keys) {
    if ((baseline[key] ?? '') !== (current[key] ?? '')) {
      return true
    }
  }
  return false
}

export default function AccountsMapPage() {
  const [map, setMap] = useState<AccountsMap>({})
  const [baseline, setBaseline] = useState<AccountsMap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  useEffect(() => {
    void loadMap()
  }, [])

  async function loadMap() {
    try {
      setLoading(true)
      setError(null)
  const res = await api.get<AccountsMap>('/accounting/config/accounts-map')
  const data = (res as any)?.data ?? res
  const normalized = data ? { ...data } : {}
  setMap(normalized)
  setBaseline(normalized)
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setMap({})
        setBaseline({})
        setError('No hay un mapa contable guardado. Empieza creando uno nuevo y guarda los cambios.')
      } else {
        setError(err?.response?.data?.message || err?.message || 'No fue posible cargar el mapa de cuentas.')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleChange(key: string, value: string) {
    setMap((prev) => ({ ...prev, [key]: value }))
  }

  function handleRemove(key: string) {
    setMap((prev) => {
      const clone = { ...prev }
      delete clone[key]
      return clone
    })
  }

  function handleAddKey() {
    const trimmedKey = newKey.trim()
    const trimmedValue = newValue.trim()
    if (!trimmedKey) {
      setError('Define un alias para la cuenta antes de agregarla.')
      return
    }
    if (!trimmedValue) {
      setError('Debes indicar el código contable para la nueva entrada.')
      return
    }
    setError(null)
    setSuccess(null)
  setMap((prev) => ({ ...prev, [trimmedKey]: trimmedValue }))
    setNewKey('')
    setNewValue('')
  }

  async function handleSave() {
    try {
      setSaving(true)
      setError(null)
      setSuccess(null)
  const res = await api.put('/accounting/config/accounts-map', map)
  const payload = (res as any)?.data ?? res
  const savedJson = payload?.json ?? map
  const normalized = savedJson ? { ...savedJson } : {}
  setMap(normalized)
  setBaseline(normalized)
      setSuccess('Mapa contable guardado correctamente.')
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'No fue posible guardar el mapa contable.')
    } finally {
      setSaving(false)
    }
  }

  const sortedEntries = useMemo(() => {
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [map])

  const dirty = useMemo(() => isDirtyMap(map, baseline), [map, baseline])

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Mapa contable</h1>
            <p className="text-sm text-gray-500">
              Define los códigos contables clave que utiliza el motor para generar asientos automáticos.
            </p>
          </div>
          <Link href="/accounting" className="btn btn-ghost">Volver</Link>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-800">
            {success}
          </div>
        )}

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Parámetros disponibles</h2>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                setMap(baseline ? { ...baseline } : {})
                setError(null)
                setSuccess(null)
              }}
              disabled={!dirty}
            >
              Restaurar cambios
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-medium">Alias</p>
              <p>Cadenas como <code>cash</code>, <code>salesVat</code> o <code>yearResult</code> identifican cuentas especiales.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-medium">Código contable</p>
              <p>Debe existir en el plan de cuentas. El backend valida y puede auto-crear registros faltantes.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-medium">Versionado</p>
              <p>Cada guardado crea una nueva versión (auditable). No se sobrescribe la configuración anterior.</p>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-4">Alias</th>
                  <th className="py-2 pr-4">Código contable</th>
                  <th className="py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-gray-500">Cargando mapa…</td>
                  </tr>
                )}
                {!loading && sortedEntries.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-gray-500">No hay cuentas configuradas.</td>
                  </tr>
                )}
                {!loading && sortedEntries.map(([key, value]) => (
                  <tr key={key} className="border-t">
                    <td className="py-2 pr-4 font-mono text-xs uppercase text-slate-600">{key}</td>
                    <td className="py-2 pr-4">
                      <input
                        className="input input-bordered w-full rounded-xl"
                        value={value}
                        onChange={(e) => handleChange(key, e.target.value)}
                        placeholder="Código contable"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs text-red-600"
                        onClick={() => handleRemove(key)}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-4">
            <h3 className="text-sm font-semibold text-slate-700">Agregar nuevo alias</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <input
                className="input input-bordered rounded-xl"
                placeholder="Alias (ej. inventory)"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
              />
              <input
                className="input input-bordered rounded-xl"
                placeholder="Código contable (ej. 143505)"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
              />
              <button type="button" className="btn btn-outline" onClick={handleAddKey}>
                Agregar
              </button>
            </div>
          </div>
        </section>

        <div className="mt-6 flex items-center gap-3">
          <button
            className={`btn btn-primary ${(!dirty || saving) ? 'btn-disabled pointer-events-none opacity-60' : ''}`}
            onClick={handleSave}
            disabled={!dirty || saving}
          >
            {saving ? 'Guardando…' : 'Guardar mapa'}
          </button>
          <Link href="/accounting" className="btn btn-ghost">Cancelar</Link>
        </div>
      </main>
    </Protected>
  )
}
