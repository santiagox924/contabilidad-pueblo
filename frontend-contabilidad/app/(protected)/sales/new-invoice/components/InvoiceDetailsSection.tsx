'use client'

import { useInvoiceForm } from '../context/InvoiceFormContext'

export default function InvoiceDetailsSection() {
  const {
    // básicos
    date, setDate,
    paymentType, setPaymentType,
    dueDate, setDueDate,
    priceIncludesTax, setPriceIncludesTax,

    // default warehouse
    defaultWarehouseId, setDefaultWarehouseId, warehousesArr,

    // crédito
    creditMarkupPct, setCreditMarkupPct,
    downPayment, setDownPayment,
    frequency, setFrequency,
    installments, setInstallments,
    firstDueDate, setFirstDueDate,

    // totales y utils
    totals, money,

    // para limpiar confirmación de mes anterior al cambiar fecha
    setAckPrevMonth,
  } = useInvoiceForm()

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Fecha */}
        <div>
          <label className="block text-sm font-medium mb-1">Fecha</label>
          <input
            type="date"
            className="input input-bordered w-full rounded-xl"
            value={date}
            onChange={(e) => { setDate(e.target.value); setAckPrevMonth(false) }}
          />
        </div>

        {/* Forma de pago */}
        <div>
          <label className="block text-sm font-medium mb-1">Forma de pago</label>
          <select
            className="select select-bordered w-full rounded-xl"
            value={paymentType}
            onChange={(e) => setPaymentType(e.target.value as 'CASH' | 'CREDIT')}
          >
            <option value="CASH">Contado</option>
            <option value="CREDIT">Crédito</option>
          </select>
        </div>

        {/* Vencimiento único */}
        <div>
          <label className="block text-sm font-medium mb-1">Vencimiento único (opcional)</label>
          <input
            type="date"
            className="input input-bordered w-full rounded-xl"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        {/* Bodega por defecto */}
        <div>
          <label className="block text-sm font-medium mb-1">Bodega (por defecto)</label>
          <select
            className="select select-bordered w-full rounded-xl"
            value={defaultWarehouseId}
            onChange={(e) => setDefaultWarehouseId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">-- seleccionar --</option>
            {warehousesArr.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Se asignará automáticamente a las líneas que no tengan bodega seleccionada (solo productos).
          </p>
        </div>
      </div>

        <div className="flex items-start gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3">
          <input
            id="price-includes-tax-toggle"
            type="checkbox"
            className="checkbox checkbox-primary mt-1"
            checked={priceIncludesTax}
            onChange={(e) => setPriceIncludesTax(e.target.checked)}
          />
          <div className="text-sm">
            <label htmlFor="price-includes-tax-toggle" className="font-medium cursor-pointer">
              Los precios capturados ya incluyen IVA
            </label>
            <p className="text-xs text-gray-600 mt-1">
              Al cambiar esta opción recalcularemos el subtotal (base) y el IVA de todas las líneas.
            </p>
          </div>
        </div>

      {/* Configuración de crédito */}
      {paymentType === 'CREDIT' && (
        <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-4 rounded-xl bg-indigo-50 p-4">
          {/* Incremento por crédito */}
          <div>
            <label className="block text-sm font-medium mb-1">Incremento por crédito (%)</label>
            <input
              type="number"
              className="input input-bordered w-full rounded-xl"
              min={0}
              step={0.01}
              value={creditMarkupPct}
              onChange={(e) => setCreditMarkupPct(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="Ej: 5"
            />
          </div>

          {/* Cuota inicial */}
          <div>
            <label className="block text-sm font-medium mb-1">Cuota inicial</label>
            <input
              type="number"
              className="input input-bordered w-full rounded-xl"
              min={0}
              step={0.01}
              value={downPayment}
              onChange={(e) => setDownPayment(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="Ej: 100000"
            />
            <p className="text-xs text-gray-600 mt-1">
              Se descuenta del total y queda como la primera cuota.
            </p>
          </div>

          {/* Frecuencia */}
          <div>
            <label className="block text-sm font-medium mb-1">Frecuencia</label>
            <select
              className="select select-bordered w-full rounded-xl"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as 'MONTHLY' | 'BIWEEKLY')}
            >
              <option value="BIWEEKLY">Quincenal</option>
              <option value="MONTHLY">Mensual</option>
            </select>
          </div>

          {/* # de cuotas */}
          <div>
            <label className="block text-sm font-medium mb-1"># de cuotas (después de la inicial)</label>
            <input
              type="number"
              className="input input-bordered w-full rounded-xl"
              min={1}
              value={installments}
              onChange={(e) => setInstallments(Math.max(1, Number(e.target.value || 0)))}
            />
          </div>

          {/* Primer pago desde */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Primer pago desde</label>
            <input
              type="date"
              className="input input-bordered w-full rounded-xl"
              value={firstDueDate}
              onChange={(e) => setFirstDueDate(e.target.value)}
            />
            <p className="text-xs text-gray-600 mt-1">
              Corresponde a la 1ª cuota <em>después</em> de la inicial.
            </p>
          </div>

          {/* Resumen de financiación */}
          <div className="md:col-span-2 grid grid-cols-2 gap-2 bg-white rounded-xl p-3 border">
            <div className="text-sm text-gray-500">Total factura</div>
            <div className="text-right font-medium">{money(totals.total)}</div>
            <div className="text-sm text-gray-500">Cuota inicial</div>
            <div className="text-right font-medium">-{money(totals.downPayment)}</div>
            <div className="text-sm text-gray-700">Total a financiar</div>
            <div className="text-right font-semibold">{money(totals.toFinance)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
