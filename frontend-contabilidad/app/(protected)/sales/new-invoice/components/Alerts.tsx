'use client'

import { useInvoiceForm } from '../context/InvoiceFormContext'

export default function Alerts() {
  const {
    isPrevMonth,
    ackPrevMonth,
    setAckPrevMonth,
    date,
    monthLabel,
    warn,
  } = useInvoiceForm()

  return (
    <>
      {isPrevMonth && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
          <p className="font-medium">
            Estás creando una factura con fecha en <u>{monthLabel(date)}</u>, ¿confirmas emitirla para un mes que ya tuvo cierre de contabilidad?
          </p>
          <label className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              className="checkbox checkbox-error"
              checked={ackPrevMonth}
              onChange={(e) => setAckPrevMonth(e.target.checked)}
            />
            <span className="text-sm">Sí, entiendo y deseo emitirla con esa fecha.</span>
          </label>
        </div>
      )}

      {!!warn && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800">
          {warn}
        </div>
      )}
    </>
  )
}
