// frontend-contabilidad/app/(protected)/treasury/components/NewPaymentMethodModal.tsx
'use client'

import React, { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { createPaymentMethod, type PaymentMethod } from '@/lib/treasury'

type Props = {
  open: boolean
  onClose: () => void
  /** Se llama cuando se crea correctamente para refrescar la lista o seleccionar el creado */
  onCreated?: (pm: PaymentMethod) => void
}

export default function NewPaymentMethodModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [active, setActive] = useState(true)
  const [accountName, setAccountName] = useState<string>('')
  const [accountNumber, setAccountNumber] = useState<string>('')

  // ⬇️ NUEVO: cuentas contables
  const [cashAccountCode, setCashAccountCode] = useState<string>('') // Caja
  const [bankAccountCode, setBankAccountCode] = useState<string>('') // Banco

  useEffect(() => {
    if (open) {
      // limpiar al abrir
      setName('')
      setActive(true)
      setAccountName('')
      setAccountNumber('')
      setCashAccountCode('')
      setBankAccountCode('')
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: async () => {
      const nm = name.trim()
      if (!nm) throw new Error('Ingresa el nombre del método')

      // Normalizamos y validamos formato básico (letras, dígitos, punto y guion)
      const normCash = cashAccountCode.trim() || undefined
      const normBank = bankAccountCode.trim() || undefined
      const pattern = /^[0-9A-Za-z.\-]+$/

      if (normCash && !pattern.test(normCash)) {
        throw new Error('La cuenta de Caja solo puede contener dígitos, letras, punto o guion')
      }
      if (normBank && !pattern.test(normBank)) {
        throw new Error('La cuenta de Banco solo puede contener dígitos, letras, punto o guion')
      }
      if (!normCash && !normBank) {
        throw new Error('Configura al menos una cuenta contable (Caja o Banco) para poder usar el método en contabilidad.')
      }

      const created = await createPaymentMethod({
        name: nm,
        active,
        accountName: accountName.trim() || undefined,
        accountNumber: accountNumber.trim() || undefined,
        cashAccountCode: normCash,  // ⬅️ NUEVO
        bankAccountCode: normBank,  // ⬅️ NUEVO
      })
      return created
    },
    onSuccess: (pm) => {
      onCreated?.(pm)
      onClose()
    },
    onError: (e: any) => {
      alert(e?.response?.data?.message ?? e?.message ?? 'No se pudo crear el método')
    },
  })

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={() => !mutation.isPending && onClose()}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl border">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Nuevo método de pago</h3>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={mutation.isPending}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          <label className="block text-sm">
            <span className="text-gray-700">Nombre</span>
            <input
              className="input w-full mt-1"
              placeholder="Efectivo / Banco / Transferencia / Nequi…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={mutation.isPending}
              autoFocus
            />
          </label>

          <div className="grid grid-cols-1 gap-3">
            <label className="block text-sm">
              <span className="text-gray-700">Nombre de la cuenta (opcional)</span>
              <input
                className="input w-full mt-1"
                placeholder="Ej. Bancolombia Cuenta Corriente"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                disabled={mutation.isPending}
              />
            </label>

            <label className="block text-sm">
              <span className="text-gray-700">Número de cuenta (opcional)</span>
              <input
                className="input w-full mt-1"
                placeholder="Ej. 123-456789-01"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                disabled={mutation.isPending}
              />
            </label>
          </div>

          {/* ⬇️ NUEVOS CAMPOS: parametrización contable */}
          <div className="grid grid-cols-1 gap-3">
            <label className="block text-sm">
              <span className="text-gray-700">Cuenta contable (Caja)</span>
              <input
                className="input w-full mt-1"
                placeholder="Ej. 110505"
                value={cashAccountCode}
                onChange={(e) => setCashAccountCode(e.target.value)}
                disabled={mutation.isPending}
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Si usas efectivo para este método, asigna la cuenta de caja (naturaleza Débito).
              </p>
            </label>

            <label className="block text-sm">
              <span className="text-gray-700">Cuenta contable (Banco)</span>
              <input
                className="input w-full mt-1"
                placeholder="Ej. 111005-NEQUI"
                value={bankAccountCode}
                onChange={(e) => setBankAccountCode(e.target.value)}
                disabled={mutation.isPending}
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Para métodos como Bancolombia/Nequi, asigna la cuenta bancaria. Si defines ambas,
                el sistema prioriza la cuenta de <b>Banco</b> para el saldo.
              </p>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                disabled={mutation.isPending}
              />
              <span>Activo</span>
            </label>
          </div>
        </div>

        <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
          <button
            className="btn btn-ghost"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancelar
          </button>
          <button
            className="btn"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Guardando…' : 'Crear método'}
          </button>
        </div>
      </div>
    </div>
  )
}
