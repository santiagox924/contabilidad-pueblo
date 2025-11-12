// frontend-contabilidad/app/(protected)/treasury/methods/page.tsx
'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listPaymentMethods,
  updatePaymentMethod,
  deletePaymentMethod,
  getPaymentMethodBalance,
  type PaymentMethod,
  type PaymentMethodBalance,
} from '@/lib/treasury'
import NewPaymentMethodModal from '../../../../components/NewPaymentMethodModal'

type EditingRow = Partial<PaymentMethod> & { id: number }

// ===== Helpers de fecha/moneda =====
function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function monthStartISO(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  return start.toISOString().slice(0, 10)
}
function isISODate(d?: string) {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)
}
function formatCOP(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

// Pequeño componente para mostrar el saldo por método en un rango
function BalanceCell({ id, from, to }: { id: number; from?: string; to?: string }) {
  const enabled = !!id && isISODate(from) && isISODate(to)

  const q = useQuery({
    queryKey: ['pm-balance', id, from, to],
    queryFn: () => getPaymentMethodBalance(id, { from: from!, to: to! }),
    enabled,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  if (!enabled) return <span className="text-xs text-gray-400">—</span>
  if (q.isLoading) return <span className="text-xs text-gray-500">Calculando…</span>

  if (q.isError) {
    const err = q.error as any
    const msg =
      err?.response?.data?.message ||
      err?.message ||
      'Error al calcular el saldo'
    return (
      <span className="text-xs text-rose-600" title={String(msg)}>
        Error
      </span>
    )
  }

  const data = q.data as PaymentMethodBalance | undefined
  if (!data) return <span className="text-xs text-gray-400">—</span>

  const signClass =
    data.balance > 0
      ? 'text-emerald-700'
      : data.balance < 0
      ? 'text-rose-700'
      : 'text-gray-700'

  return (
    <div className="flex flex-col">
      <span className={`font-medium ${signClass}`}>
        {formatCOP(data.balance)}
      </span>
      <span className="text-[10px] text-gray-500">
        {data.accountCode} • {data.from} → {data.to}
      </span>
    </div>
  )
}

export default function PaymentMethodsPage() {
  const qc = useQueryClient()

  // ======= Rango para saldos =======
  const [from, setFrom] = useState<string>(monthStartISO())
  const [to, setTo] = useState<string>(todayISO())

  // ======= Query base =======
  const [showInactive, setShowInactive] = useState(false)
  const methodsQuery = useQuery({
    queryKey: ['payment-methods', { showInactive }],
    queryFn: () =>
      showInactive ? listPaymentMethods() : listPaymentMethods({ active: true }),
  })
  const methods = methodsQuery.data ?? []

  // ======= Crear =======
  const [openNew, setOpenNew] = useState(false)
  const onCreated = () => {
    setOpenNew(false)
    qc.invalidateQueries({ queryKey: ['payment-methods'] })
  }

  // ======= Edición inline =======
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<EditingRow | null>(null)

  function startEdit(pm: PaymentMethod) {
    setEditingId(pm.id)
    setDraft({ ...pm })
  }
  function cancelEdit() {
    setEditingId(null)
    setDraft(null)
  }
  function patchDraft(p: Partial<EditingRow>) {
    setDraft(prev => ({ ...(prev as EditingRow), ...p }))
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft || !editingId) return
      const normCash = draft.cashAccountCode?.toString().trim() ?? ''
      const normBank = draft.bankAccountCode?.toString().trim() ?? ''
      if (!normCash && !normBank) {
        throw new Error('Debes asignar al menos una cuenta contable (Caja o Banco).')
      }

      const payload = {
        name: (draft.name ?? '').trim(),
        accountName: draft.accountName?.toString().trim() || undefined,
        accountNumber: draft.accountNumber?.toString().trim() || undefined,
        cashAccountCode: normCash || undefined,  // ⬅️ NUEVO
        bankAccountCode: normBank || undefined,  // ⬅️ NUEVO
        active: draft.active,
      }
      if (!payload.name) throw new Error('El nombre es obligatorio')

      // Validación básica de formato de cuentas contables (si vienen)
      const re = /^[0-9A-Za-z.\-]+$/
      if (payload.cashAccountCode && !re.test(payload.cashAccountCode)) {
        throw new Error('La cuenta de Caja solo puede contener dígitos, letras, punto o guion')
      }
      if (payload.bankAccountCode && !re.test(payload.bankAccountCode)) {
        throw new Error('La cuenta de Banco solo puede contener dígitos, letras, punto o guion')
      }

      await updatePaymentMethod(editingId, payload)
    },
    onSuccess: async () => {
      setEditingId(null)
      setDraft(null)
      await qc.invalidateQueries({ queryKey: ['payment-methods'] })
      // refrescar saldos visibles
      await qc.invalidateQueries({ queryKey: ['pm-balance'] })
    },
    onError: (e: any) => {
      alert(e?.response?.data?.message ?? e?.message ?? 'No se pudo guardar el método')
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: async (pm: PaymentMethod) => {
      await updatePaymentMethod(pm.id, { active: !pm.active })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-methods'] })
      qc.invalidateQueries({ queryKey: ['pm-balance'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (pm: PaymentMethod) => {
      if (!confirm(`¿Eliminar el método "${pm.name}"? Esta acción no se puede deshacer.`)) return
      await deletePaymentMethod(pm.id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-methods'] })
      qc.invalidateQueries({ queryKey: ['pm-balance'] })
    },
    onError: (e: any) => {
      alert(e?.response?.data?.message ?? e?.message ?? 'No se pudo eliminar')
    },
  })

  const filtered = useMemo(() => {
    if (showInactive) return methods
    return methods.filter(m => m.active)
  }, [methods, showInactive])

  return (
    <Protected>
      <Navbar />
      <main className="container py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Métodos de pago</h1>
          <div className="flex items-center gap-3">
            <label className="text-sm inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              <span>Mostrar inactivos</span>
            </label>
            <button className="btn" onClick={() => setOpenNew(true)}>Nuevo método</button>
            <Link className="text-sm text-gray-600 underline" href="/treasury">Volver</Link>
          </div>
        </div>

        {/* 🔹 Filtros de rango para el saldo */}
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Desde</label>
            <input
              type="date"
              className="input"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Hasta</label>
            <input
              type="date"
              className="input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <button
            className="btn btn-outline"
            onClick={() => {
              // invalidar todas las celdas de saldo visibles
              filtered.forEach(pm => {
                qc.invalidateQueries({ queryKey: ['pm-balance', pm.id, from, to] })
              })
            }}
          >
            Recalcular saldos
          </button>
        </div>

        <div className="border rounded-xl bg-white">
          {methodsQuery.isLoading ? (
            <div className="p-4 text-sm text-gray-600">Cargando métodos…</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">
              {showInactive ? 'No hay métodos.' : 'No hay métodos activos.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3">Nombre</th>
                    <th className="text-left p-3">Nombre de cuenta (opcional)</th>
                    <th className="text-left p-3">N° Cuenta (opcional)</th>
                    {/* ⬇️ NUEVAS columnas de cuentas contables */}
                    <th className="text-left p-3">Cuenta contable (Caja)</th>
                    <th className="text-left p-3">Cuenta contable (Banco)</th>
                    <th className="text-center p-3">Activo</th>
                    <th className="text-left p-3">Saldo (rango)</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(pm => {
                    const isEditing = editingId === pm.id
                    return (
                      <tr key={pm.id} className="border-t">
                        {/* Nombre */}
                        <td className="p-3 align-middle">
                          {isEditing ? (
                            <input
                              className="input w-full"
                              value={draft?.name ?? ''}
                              onChange={(e)=>patchDraft({ name: e.target.value })}
                            />
                          ) : (
                            <span className="font-medium">{pm.name}</span>
                          )}
                        </td>
                        {/* accountName */}
                        <td className="p-3 align-middle">
                          {isEditing ? (
                            <input
                              className="input w-full"
                              value={draft?.accountName ?? ''}
                              onChange={(e)=>patchDraft({ accountName: e.target.value })}
                              placeholder="Ej. Bancolombia CC"
                            />
                          ) : (
                            <span className="text-gray-700">{pm.accountName || '—'}</span>
                          )}
                        </td>
                        {/* accountNumber */}
                        <td className="p-3 align-middle">
                          {isEditing ? (
                            <input
                              className="input w-full"
                              value={draft?.accountNumber ?? ''}
                              onChange={(e)=>patchDraft({ accountNumber: e.target.value })}
                              placeholder="Ej. 123-456789-01"
                            />
                          ) : (
                            <span className="text-gray-700">{pm.accountNumber || '—'}</span>
                          )}
                        </td>

                        {/* ⬇️ NUEVO: cashAccountCode */}
                        <td className="p-3 align-middle">
                          {isEditing ? (
                            <input
                              className="input w-full"
                              value={draft?.cashAccountCode ?? ''}
                              onChange={(e)=>patchDraft({ cashAccountCode: e.target.value })}
                              placeholder="Ej. 110505"
                            />
                          ) : (
                            <span className="text-gray-700">{pm.cashAccountCode || '—'}</span>
                          )}
                        </td>
                        {/* ⬇️ NUEVO: bankAccountCode */}
                        <td className="p-3 align-middle">
                          {isEditing ? (
                            <input
                              className="input w-full"
                              value={draft?.bankAccountCode ?? ''}
                              onChange={(e)=>patchDraft({ bankAccountCode: e.target.value })}
                              placeholder="Ej. 111005-NEQUI"
                            />
                          ) : (
                            <span className="text-gray-700">{pm.bankAccountCode || '—'}</span>
                          )}
                        </td>

                        {/* active */}
                        <td className="p-3 text-center align-middle">
                          {isEditing ? (
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={!!draft?.active}
                                onChange={(e)=>patchDraft({ active: e.target.checked })}
                              />
                              <span className="text-xs">{draft?.active ? 'Sí' : 'No'}</span>
                            </label>
                          ) : (
                            <button
                              className={`inline-flex items-center gap-2 px-2 py-0.5 rounded-full text-xs border ${pm.active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}
                              onClick={() => toggleActiveMutation.mutate(pm)}
                              title="Alternar activo"
                            >
                              {pm.active ? 'Activo' : 'Inactivo'}
                            </button>
                          )}
                        </td>

                        {/* Saldo (rango) */}
                        <td className="p-3 align-middle">
                          <BalanceCell id={pm.id} from={from} to={to} />
                        </td>

                        {/* acciones */}
                        <td className="p-3 text-right align-middle">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={cancelEdit}
                                disabled={saveMutation.isPending}
                              >
                                Cancelar
                              </button>
                              <button
                                className="btn btn-sm"
                                onClick={() => saveMutation.mutate()}
                                disabled={saveMutation.isPending}
                              >
                                {saveMutation.isPending ? 'Guardando…' : 'Guardar'}
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button className="btn btn-ghost btn-sm" onClick={() => startEdit(pm)}>
                                Editar
                              </button>
                              <button
                                className="btn btn-ghost btn-sm text-red-600"
                                onClick={() => deleteMutation.mutate(pm)}
                                disabled={deleteMutation.isPending}
                              >
                                Eliminar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal crear */}
        <NewPaymentMethodModal
          open={openNew}
          onClose={() => setOpenNew(false)}
          onCreated={() => onCreated()}
        />
      </main>
    </Protected>
  )
}
