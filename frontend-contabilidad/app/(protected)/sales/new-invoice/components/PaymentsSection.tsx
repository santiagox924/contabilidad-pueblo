// frontend-contabilidad/app/(protected)/sales/new-invoice/components/PaymentsSection.tsx
'use client'

import { useInvoiceForm } from '../context/InvoiceFormContext'

export default function PaymentsSection() {
  const {
    paymentType,
    payments,
    addPayment,
    removePayment,
    updatePayment,
    totals,
    sumPayments,
    paymentMethods,
  } = useInvoiceForm()

  const totalPagos =
    paymentType === 'CASH' ? sumPayments(payments) : (totals.downPayment || 0)

  return (
    <section className="rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Pagos</h3>
        {paymentType === 'CASH' && (
          <button type="button" className="btn btn-outline btn-sm" onClick={addPayment}>
            Agregar pago
          </button>
        )}
      </div>

      {paymentType === 'CASH' && (
        <p className="text-xs text-gray-500 mt-1">
          En contado, la suma de pagos debe ser igual al total.
        </p>
      )}
      {paymentType === 'CREDIT' && (
        <p className="text-xs text-gray-500 mt-1">
          En crédito, el pago aquí corresponde a la <strong>cuota inicial</strong>; indica únicamente el método y nota.
        </p>
      )}

      <div className="mt-3 space-y-3">
        {payments.length === 0 && (
          <div className="text-sm text-gray-500">Sin pagos agregados.</div>
        )}

        {payments.map((p, idx) => {
          const selectedExists =
            p.methodId && paymentMethods.some(m => m.id === p.methodId)

          return (
            <div
              key={idx}
              className="grid grid-cols-1 md:grid-cols-[1fr_0.8fr_1.2fr_auto] gap-3 items-end border rounded-xl p-3"
            >
              {/* Método */}
              <div>
                <label className="block text-sm font-medium mb-1">Método</label>
                <select
                  className="select select-bordered w-full rounded-xl"
                  value={p.methodId ?? ''}
                  onChange={(e) =>
                    updatePayment(idx, {
                      methodId: e.target.value ? Number(e.target.value) : undefined,
                      methodName:
                        e.target.value
                          ? paymentMethods.find(pm => pm.id === Number(e.target.value))?.name
                          : '',
                    })
                  }
                >
                  <option value="">
                    {paymentMethods.length ? '(Selecciona)' : 'No hay métodos disponibles'}
                  </option>
                  {/* Si por alguna razón hay un name “huérfano”, muéstralo */}
                  {!selectedExists && p.methodName && (
                    <option value={p.methodId ?? ''}>
                      {p.methodName} {p.methodId ? '' : '(no guardado)'}
                    </option>
                  )}
                  {paymentMethods.map(pm => (
                    <option key={pm.id} value={pm.id}>
                      {pm.name}
                    </option>
                  ))}
                </select>

                {paymentMethods.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    No hay métodos de pago activos. Créalo desde Tesorería → Métodos.
                  </p>
                )}
              </div>

              {/* Monto */}
              <div>
                <label className="block text-sm font-medium mb-1">Monto</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="input input-bordered w-full rounded-xl"
                  value={paymentType === 'CREDIT' ? (totals.downPayment || 0) : (p.amount ?? 0)}
                  onChange={(e) => updatePayment(idx, { amount: Number(e.target.value || 0) })}
                  disabled={paymentType === 'CREDIT'}
                />
                {paymentType === 'CREDIT' && (
                  <p className="text-xs text-gray-500 mt-1">Fijado igual a la cuota inicial.</p>
                )}
              </div>

              {/* Nota */}
              <div>
                <label className="block text-sm font-medium mb-1">Nota (opcional)</label>
                <input
                  className="input input-bordered w-full rounded-xl"
                  value={p.note ?? ''}
                  onChange={(e) => updatePayment(idx, { note: e.target.value })}
                  placeholder="# de referencia, terminal, etc."
                />
              </div>

              {/* Acción */}
              <div className="flex justify-end">
                {paymentType === 'CASH' ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => removePayment(idx)}
                  >
                    Quitar
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost" disabled>
                    —
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Total pagos */}
      <div className="mt-3 text-right text-sm">
        Total pagos:{' '}
        <strong>
          {totalPagos.toLocaleString('es-CO', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </strong>
      </div>
    </section>
  )
}
