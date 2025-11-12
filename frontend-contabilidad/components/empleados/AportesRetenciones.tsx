"use client"
import { useEffect, useMemo, useState } from 'react'
import { listHrEmployees } from '@/lib/hr'

type AffiliationRow = {
  id: string
  employee: string
  kind: string
  entity: string
  startDate?: string | null
  endDate?: string | null
}

const CONTRIBUTION_KINDS = new Set([
  'EPS',
  'PENSION',
  'ARL',
  'CCF',
  'COMPENSATION_FUND',
])

const formatDate = (value?: string | null) => {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('es-CO')
}

// EPS, pensión, ARL, CCF, retención en la fuente, PILA, histórico de afiliaciones
export default function AportesRetenciones() {
  const [rows, setRows] = useState<AffiliationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const employees = await listHrEmployees({ includeAffiliations: true })
        const flattened: AffiliationRow[] = []
        for (const emp of employees) {
          const employeeName =
            emp.thirdParty?.name ?? `Empleado ${emp.thirdParty?.id ?? emp.id}`
          for (const aff of emp.affiliations ?? []) {
            flattened.push({
              id: `${emp.thirdParty?.id ?? emp.id}-${aff.id}`,
              employee: employeeName,
              kind: aff.kind,
              entity: aff.thirdParty?.name ?? '-',
              startDate: aff.startDate ?? null,
              endDate: aff.endDate ?? null,
            })
          }
        }
        setRows(flattened)
      } catch (err: any) {
        console.error('Failed to load affiliations', err)
        setError('No se pudieron cargar las afiliaciones de seguridad social')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const aportes = useMemo(
    () => rows.filter((row) => CONTRIBUTION_KINDS.has(row.kind)),
    [rows],
  )
  const retenciones = useMemo(
    () => rows.filter((row) => !CONTRIBUTION_KINDS.has(row.kind)),
    [rows],
  )

  if (loading) return <div>Cargando aportes y retenciones…</div>
  if (error) return <div className="text-red-600">{error}</div>

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Aportes y retenciones</h1>

      <h2 className="font-semibold mb-2">Aportes de seguridad social</h2>
      {!aportes.length ? (
        <div className="p-4 bg-gray-50 rounded">
          No hay afiliaciones registradas para EPS, pensión, ARL o CCF.
        </div>
      ) : (
        <table className="table-auto w-full mb-4">
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Tipo</th>
              <th>Entidad</th>
              <th>Inicio</th>
              <th>Fin</th>
            </tr>
          </thead>
          <tbody>
            {aportes.map((row) => (
              <tr key={row.id}>
                <td>{row.employee}</td>
                <td>{row.kind}</td>
                <td>{row.entity}</td>
                <td>{formatDate(row.startDate)}</td>
                <td>{formatDate(row.endDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="font-semibold mb-2">Retenciones y deducciones</h2>
      {!retenciones.length ? (
        <div className="p-4 bg-gray-50 rounded">
          No hay deducciones adicionales registradas.
        </div>
      ) : (
        <table className="table-auto w-full mb-4">
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Tipo</th>
              <th>Entidad</th>
              <th>Inicio</th>
              <th>Fin</th>
            </tr>
          </thead>
          <tbody>
            {retenciones.map((row) => (
              <tr key={row.id}>
                <td>{row.employee}</td>
                <td>{row.kind}</td>
                <td>{row.entity}</td>
                <td>{formatDate(row.startDate)}</td>
                <td>{formatDate(row.endDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
