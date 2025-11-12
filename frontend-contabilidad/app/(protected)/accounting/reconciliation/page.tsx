'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  BankStatement,
  BankStatementLine,
  deleteBankStatement,
  getBankStatementLines,
  importBankStatement,
  listBankStatements,
} from '@/lib/reconciliation'
import { money } from '@/lib/format'

const pageSize = 20

export default function ReconciliationPage() {
  const [items, setItems] = useState<BankStatement[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [bankFilter, setBankFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<BankStatement | null>(null)
  const [lines, setLines] = useState<BankStatementLine[]>([])
  const [linesLoading, setLinesLoading] = useState(false)
  const [linesError, setLinesError] = useState<string | null>(null)

  const [importing, setImporting] = useState(false)
  const [importFeedback, setImportFeedback] = useState<string | null>(null)

  useEffect(() => {
    void loadStatements()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, bankFilter])

  async function loadStatements() {
    try {
      setLoading(true)
      setError(null)
      const res = await listBankStatements({
        bank: bankFilter || undefined,
        skip: page * pageSize,
        take: pageSize,
      })
      setItems(res.items)
      setTotal(res.total)
      if (res.items.length === 0) {
        setSelected(null)
        setLines([])
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'No fue posible obtener los extractos bancarios.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSelect(statement: BankStatement) {
    setSelected(statement)
    try {
      setLinesLoading(true)
      setLinesError(null)
      const detail = await getBankStatementLines(statement.id)
      setLines(detail.lines)
    } catch (err: any) {
      setLinesError(err?.response?.data?.message || err?.message || 'No fue posible obtener las líneas del extracto.')
      setLines([])
    } finally {
      setLinesLoading(false)
    }
  }

  async function handleDelete(statement: BankStatement) {
    const confirmDelete = window.confirm(`¿Eliminar el extracto ${statement.originalFileName}? Esta acción no se puede deshacer.`)
    if (!confirmDelete) return
    try {
      await deleteBankStatement(statement.id)
      if (selected?.id === statement.id) {
        setSelected(null)
        setLines([])
      }
      await loadStatements()
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'No fue posible eliminar el extracto.')
    }
  }

  async function handleImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fileInput = form.elements.namedItem('statement-file') as HTMLInputElement | null
    const bankInput = form.elements.namedItem('statement-bank') as HTMLInputElement | null
    const file = fileInput?.files?.[0]
    const bank = bankInput?.value?.trim()

    if (!file) {
      setImportFeedback('Selecciona un archivo para importar.')
      return
    }

    try {
      setImporting(true)
      setImportFeedback(null)
      await importBankStatement(file, bank || undefined)
      form.reset()
      setImportFeedback('Importación completada correctamente.')
      await loadStatements()
    } catch (err: any) {
      setImportFeedback(err?.response?.data?.message || err?.message || 'No fue posible importar el archivo.')
    } finally {
      setImporting(false)
    }
  }

  const totalPages = useMemo(() => Math.ceil(total / pageSize), [total])

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Conciliación bancaria</h1>
            <p className="text-sm text-gray-500">
              Gestiona extractos importados para conciliar con los movimientos contables.
            </p>
          </div>
          <Link href="/accounting" className="btn btn-ghost">Volver</Link>
        </div>

        <section className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Importar extracto</h2>
          <p className="text-sm text-gray-500">Carga archivos CSV o Excel según los formatos configurados.</p>
          <form className="mt-3 flex flex-col gap-3 md:flex-row md:items-end" onSubmit={handleImport}>
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium">Archivo</label>
              <input type="file" name="statement-file" className="file-input file-input-bordered w-full" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Banco (opcional)</label>
              <input
                type="text"
                name="statement-bank"
                className="input input-bordered w-full"
                placeholder="Nombre del banco"
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={importing}>
              {importing ? 'Importando…' : 'Importar'}
            </button>
          </form>
          {importFeedback && (
            <div className={`mt-3 rounded-xl border p-3 text-sm ${importFeedback.includes('No fue posible') ? 'border-red-300 bg-red-50 text-red-700' : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`}>
              {importFeedback}
            </div>
          )}
        </section>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Extractos importados</h2>
              <p className="text-sm text-gray-500">Filtra por banco y revisa las cargas recientes.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="input input-bordered"
                placeholder="Filtrar por banco"
                value={bankFilter}
                onChange={(e) => {
                  setPage(0)
                  setBankFilter(e.target.value)
                }}
              />
              <span className="text-xs text-gray-500">{total} registros</span>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-4">Banco</th>
                  <th className="py-2 pr-4">Cuenta</th>
                  <th className="py-2 pr-4">Periodo</th>
                  <th className="py-2 pr-4">Archivo</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4">Cargado</th>
                  <th className="py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-gray-500">Cargando extractos…</td>
                  </tr>
                )}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-gray-500">No se encontraron extractos.</td>
                  </tr>
                )}
                {!loading && items.map((item) => (
                  <tr key={item.id} className={`border-t ${selected?.id === item.id ? 'bg-slate-50' : ''}`}>
                    <td className="py-2 pr-4 font-medium">{item.bank}</td>
                    <td className="py-2 pr-4 text-sm text-gray-600">{item.accountNumber ?? '—'}</td>
                    <td className="py-2 pr-4 text-sm text-gray-600">
                      {item.startDate ? new Date(item.startDate).toLocaleDateString('es-CO') : '—'}
                      {' - '}
                      {item.endDate ? new Date(item.endDate).toLocaleDateString('es-CO') : '—'}
                    </td>
                    <td className="py-2 pr-4 text-sm text-gray-600">{item.originalFileName}</td>
                    <td className="py-2 pr-4">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {item.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-sm text-gray-600">
                      {new Date(item.uploadedAt).toLocaleString('es-CO')}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleSelect(item)}
                        >
                          Ver líneas
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs text-red-600"
                          onClick={() => handleDelete(item)}
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

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
              <span>Página {page + 1} de {totalPages}</span>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Anterior
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => setPage((p) => (p + 1 >= totalPages ? p : p + 1))}
                  disabled={page + 1 >= totalPages}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </section>

        {selected && (
          <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Detalle del extracto</h2>
                <p className="text-sm text-gray-500">{selected.originalFileName} — {selected.bank}</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>Cerrar detalle</button>
            </div>

            {linesError && (
              <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-red-700">{linesError}</div>
            )}

            <div className="mt-4 max-h-96 overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-4">Fecha</th>
                    <th className="py-2 pr-4">Descripción</th>
                    <th className="py-2 pr-4">Referencia</th>
                    <th className="py-2 pr-4">Monto</th>
                    <th className="py-2">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {linesLoading && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-gray-500">Cargando líneas…</td>
                    </tr>
                  )}
                  {!linesLoading && lines.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-gray-500">No hay líneas en este extracto.</td>
                    </tr>
                  )}
                  {!linesLoading && lines.map((line) => (
                    <tr key={line.id} className="border-t">
                      <td className="py-2 pr-4 text-sm text-gray-600">
                        {new Date(line.date).toLocaleDateString('es-CO')}
                      </td>
                      <td className="py-2 pr-4 text-sm text-gray-700">{line.description ?? '—'}</td>
                      <td className="py-2 pr-4 text-sm text-gray-600">{line.reference ?? '—'}</td>
                      <td className="py-2 pr-4 text-right font-mono">{money(line.amount, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}</td>
                      <td className="py-2 text-right font-mono text-gray-600">{line.balance !== null && line.balance !== undefined ? money(line.balance, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </Protected>
  )
}
