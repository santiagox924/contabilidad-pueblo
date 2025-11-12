'use client'

import { useEffect, useMemo, useState } from 'react'
import SearchSelect from '@/components/SearchSelect'
import { api } from '@/lib/api'
import { listJournalCatalog, type JournalCatalogItem, type UpsertJournalPayload } from '@/lib/journals'

interface AccountOption {
  id: number
  code: string
  name: string
  nature: 'DEBIT' | 'CREDIT'
}

interface PartyOption {
  id: number
  name: string
  document?: string | null
}

interface LineState {
  accountCode: string
  thirdPartyId: number | ''
  debit: number
  credit: number
  description: string
}

export interface JournalFormInitial {
  date?: string
  description?: string | null
  journalId?: number | null
  journalCode?: string | null
  lines?: Array<{
    accountCode: string
    debit?: number
    credit?: number
    thirdPartyId?: number | null
    description?: string | null
  }>
}

interface JournalFormProps {
  initialValue?: JournalFormInitial
  submitLabel?: string
  onSubmit: (payload: UpsertJournalPayload) => Promise<void>
  disabled?: boolean
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function toLineState(lines?: JournalFormInitial['lines']): LineState[] {
  if (!Array.isArray(lines) || lines.length === 0) {
    return [
      { accountCode: '', thirdPartyId: '', debit: 0, credit: 0, description: '' },
      { accountCode: '', thirdPartyId: '', debit: 0, credit: 0, description: '' },
    ]
  }
  return lines.map((ln) => ({
    accountCode: ln.accountCode ?? '',
    thirdPartyId: ln.thirdPartyId && Number.isFinite(Number(ln.thirdPartyId)) ? Number(ln.thirdPartyId) : '',
    debit: ln.debit != null ? Number(ln.debit) : 0,
    credit: ln.credit != null ? Number(ln.credit) : 0,
    description: ln.description ?? '',
  }))
}

function fmtMoney(n: number) {
  return Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function JournalForm({ initialValue, submitLabel = 'Guardar', onSubmit, disabled = false }: JournalFormProps) {
  const [date, setDate] = useState(initialValue?.date?.slice(0, 10) ?? todayISO())
  const [description, setDescription] = useState(initialValue?.description ?? '')
  const [journalId, setJournalId] = useState<number | ''>(
    initialValue?.journalId && Number.isFinite(Number(initialValue.journalId)) ? Number(initialValue.journalId) : '',
  )
  const [journalCode, setJournalCode] = useState(initialValue?.journalCode ?? '')
  const [lines, setLines] = useState<LineState[]>(() => toLineState(initialValue?.lines))

  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [parties, setParties] = useState<PartyOption[]>([])
  const [loadingParties, setLoadingParties] = useState(false)
  const [journals, setJournals] = useState<JournalCatalogItem[]>([])
  const [loadingJournals, setLoadingJournals] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    const loadAccounts = async () => {
      setLoadingAccounts(true)
      try {
        const { data } = await api.get<AccountOption[]>('/accounts')
        const opts: AccountOption[] = Array.isArray(data)
          ? data.map((acc: any) => ({
              id: Number(acc.id ?? acc.code ?? Math.random()),
              code: acc.code ?? '',
              name: acc.name ?? '',
              nature: (acc.nature === 'C' ? 'CREDIT' : 'DEBIT') as 'CREDIT' | 'DEBIT',
            }))
          : []
        setAccounts(opts)
      } catch (err) {
        console.warn('No se pudo cargar el plan de cuentas', err)
      } finally {
        setLoadingAccounts(false)
      }
    }

    const loadParties = async () => {
      setLoadingParties(true)
      try {
        const { data } = await api.get('/parties')
        const opts: PartyOption[] = Array.isArray(data)
          ? data.map((p: any) => ({
              id: Number(p.id ?? 0),
              name: p.name ?? '',
              document: p.document ?? null,
            }))
          : []
        setParties(opts)
      } catch (err) {
        console.warn('No se pudo cargar la lista de terceros', err)
      } finally {
        setLoadingParties(false)
      }
    }

    const loadJournals = async () => {
      setLoadingJournals(true)
      try {
        const data = await listJournalCatalog()
        setJournals(data)
      } catch (err) {
        console.warn('No se pudo cargar el catalogo de diarios', err)
      } finally {
        setLoadingJournals(false)
      }
    }

    loadAccounts()
    loadParties()
    loadJournals()
  }, [])

  const totals = useMemo(() => {
    const debit = lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0)
    const credit = lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0)
    return { debit, credit, diff: debit - credit }
  }, [lines])

  const validationMsg = useMemo(() => {
    if (lines.length < 2) return 'Debe registrar al menos dos lineas.'
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.accountCode) return `Selecciona la cuenta en la linea ${i + 1}.`
      const debit = Number(line.debit) || 0
      const credit = Number(line.credit) || 0
      if (debit < 0 || credit < 0) return `Los valores no pueden ser negativos (linea ${i + 1}).`
      if (debit > 0 && credit > 0) return `Solo uno de Debito o Credito puede tener valor (linea ${i + 1}).`
      if (debit === 0 && credit === 0) return `Indica un valor en la linea ${i + 1}.`
    }
    if (Math.abs(totals.diff) > 0.0001) return 'El asiento no esta balanceado: Debito debe ser igual a Credito.'
    return ''
  }, [lines, totals.diff])

  function setLine<K extends keyof LineState>(idx: number, key: K, value: LineState[K]) {
    setLines((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [key]: value }
      return next
    })
  }

  function addLine() {
    setLines((prev) => [...prev, { accountCode: '', thirdPartyId: '', debit: 0, credit: 0, description: '' }])
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (disabled || saving) return

    if (validationMsg) {
      setError(validationMsg)
      return
    }

    const payload: UpsertJournalPayload = {
      date,
      description: description.trim() ? description.trim() : undefined,
      journalId: typeof journalId === 'number' ? journalId : undefined,
      journalCode:
        typeof journalId === 'number' ? undefined : (journalCode.trim() ? journalCode.trim().toUpperCase() : undefined),
      lines: lines.map((l) => ({
        accountCode: l.accountCode,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        thirdPartyId: typeof l.thirdPartyId === 'number' ? l.thirdPartyId : undefined,
        description: l.description.trim() ? l.description.trim() : undefined,
      })),
    }

    try {
      setSaving(true)
      await onSubmit(payload)
      setSuccess('Asiento guardado correctamente.')
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'No se pudo guardar el asiento')
    } finally {
      setSaving(false)
    }
  }

  const selectedJournal = useMemo(() => {
    if (typeof journalId !== 'number') return null
    return journals.find((j) => j.id === journalId) ?? null
  }, [journalId, journals])

  const disableInputs = disabled || saving

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="block text-sm font-medium mb-1">Fecha</label>
            <input
              type="date"
              className="input input-bordered w-full rounded-xl"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={disableInputs}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Diario</label>
            <SearchSelect
              value={selectedJournal ? selectedJournal.id : ''}
              options={journals.map((j) => ({ value: j.id, label: `${j.code} — ${j.name}` }))}
              placeholder={loadingJournals ? 'Cargando diarios…' : 'Selecciona el diario (opcional)'}
              onSelect={(opt) => {
                if (!opt) {
                  setJournalId('')
                  return
                }
                const id = Number(opt.value)
                setJournalId(Number.isFinite(id) ? id : '')
              }}
              disabled={disableInputs || loadingJournals}
            />
            {!selectedJournal && (
              <input
                type="text"
                className="input input-bordered mt-2 w-full rounded-xl"
                placeholder="Codigo del diario (ej. GENERAL)"
                value={journalCode}
                onChange={(e) => setJournalCode(e.target.value)}
                disabled={disableInputs}
              />
            )}
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium mb-1">Descripción (opcional)</label>
            <input
              type="text"
              className="input input-bordered w-full rounded-xl"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Motivo general del asiento"
              disabled={disableInputs}
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">Líneas del asiento</h2>
          <button type="button" className="btn btn-outline" onClick={addLine} disabled={disableInputs}>
            Añadir línea
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Cuenta</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Tercero</th>
                <th className="px-3 py-2 text-left text-sm font-medium text-gray-600">Descripción</th>
                <th className="px-3 py-2 text-right text-sm font-medium text-gray-600">Débito</th>
                <th className="px-3 py-2 text-right text-sm font-medium text-gray-600">Crédito</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((line, idx) => {
                const selectedAccount = accounts.find((acc) => acc.code === line.accountCode) || null
                const selectedParty = parties.find((p) => p.id === line.thirdPartyId) || null
                return (
                  <tr key={idx}>
                    <td className="px-3 py-2">
                      <SearchSelect
                        value={selectedAccount ? selectedAccount.id : ''}
                        options={accounts.map((acc) => ({
                          value: acc.id,
                          label: `${acc.code} — ${acc.name}`,
                          sublabel: acc.nature === 'DEBIT' ? 'Débito' : 'Crédito',
                        }))}
                        placeholder={loadingAccounts ? 'Cargando cuentas…' : 'Buscar por código o nombre…'}
                        onSelect={(opt) => {
                          if (!opt) {
                            setLine(idx, 'accountCode', '')
                            return
                          }
                          const acc = accounts.find((a) => String(a.id) === String(opt.value))
                          setLine(idx, 'accountCode', acc?.code ?? '')
                        }}
                        onCustom={(txt) => setLine(idx, 'accountCode', String(txt).trim())}
                        disabled={disableInputs || loadingAccounts}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <SearchSelect
                        value={selectedParty ? selectedParty.id : ''}
                        options={parties.map((p) => ({
                          value: p.id,
                          label: p.name,
                          sublabel: p.document ?? undefined,
                        }))}
                        placeholder={loadingParties ? 'Cargando terceros…' : 'Buscar tercero…'}
                        onSelect={(opt) => {
                          if (!opt) {
                            setLine(idx, 'thirdPartyId', '')
                            return
                          }
                          const id = Number(opt.value)
                          setLine(idx, 'thirdPartyId', Number.isFinite(id) ? id : '')
                        }}
                        disabled={disableInputs || loadingParties}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        className="input input-bordered w-full rounded-xl"
                        placeholder="Detalle de la línea"
                        value={line.description}
                        onChange={(e) => setLine(idx, 'description', e.target.value)}
                        disabled={disableInputs}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="input input-bordered w-full rounded-xl text-right"
                        value={line.debit}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value || '0')
                          setLine(idx, 'debit', Number.isFinite(val) ? val : 0)
                          if ((Number.isFinite(val) ? val : 0) > 0) setLine(idx, 'credit', 0)
                        }}
                        disabled={disableInputs}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="input input-bordered w-full rounded-xl text-right"
                        value={line.credit}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value || '0')
                          setLine(idx, 'credit', Number.isFinite(val) ? val : 0)
                          if ((Number.isFinite(val) ? val : 0) > 0) setLine(idx, 'debit', 0)
                        }}
                        disabled={disableInputs}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => removeLine(idx)}
                        disabled={disableInputs || lines.length <= 1}
                        title="Eliminar línea"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td className="px-3 py-2 text-sm font-medium" colSpan={3}>
                  Totales
                </td>
                <td className="px-3 py-2 text-sm text-right font-semibold">{fmtMoney(totals.debit)}</td>
                <td className="px-3 py-2 text-sm text-right font-semibold">{fmtMoney(totals.credit)}</td>
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>

        {validationMsg && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800">
            {validationMsg}
          </div>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={disableInputs || !!validationMsg || saving}>
          {saving ? 'Guardando…' : submitLabel}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">{error}</div>
      )}
      {success && !error && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-800">{success}</div>
      )}
    </form>
  )
}
