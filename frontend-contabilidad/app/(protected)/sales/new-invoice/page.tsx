'use client'

// app/(protected)/sales/new-invoice/page.tsx
import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'

// Contexto del formulario (estado + acciones centralizadas)
import { InvoiceFormProvider, useInvoiceForm } from './context/InvoiceFormContext'

// Secciones presentacionales
import ClientSection from './components/ClientSection'
import InvoiceDetailsSection from './components/InvoiceDetailsSection'
import PaymentsSection from './components/PaymentsSection'
import ItemsSection from './components/ItemsSection/ItemsSection'

// Util
import { money } from '@/lib/format'

function Alerts() {
  const { isPrevMonth, ackPrevMonth, setAckPrevMonth, date, monthLabel, warn } = useInvoiceForm()
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
              onChange={(e)=>setAckPrevMonth(e.target.checked)}
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

function TotalsFooter() {
  const { totals, paymentType, payments, sumPayments } = useInvoiceForm()
  const totalPagos = paymentType === 'CASH' ? sumPayments(payments) : (totals.downPayment || 0)

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="text-right space-y-1">
        <div>Subtotal: <strong>{money(totals.subtotal)}</strong></div>
        <div>Descuento: <strong>- {money(totals.discount)}</strong></div>
        <div>IVA: <strong>{money(totals.vat)}</strong></div>
        <div className="text-lg">Total factura: <strong>{money(totals.total)}</strong></div>
        {paymentType === 'CREDIT' && (
          <>
            <div>Cuota inicial: <strong>- {money(totals.downPayment)}</strong></div>
            <div className="text-lg">
              Total a financiar: <strong>{money(totals.toFinance)}</strong>
            </div>
          </>
        )}
        {totalPagos > 0 && (
          <div className="text-sm text-gray-600">
            Total pagos capturados: <strong>{money(totalPagos)}</strong>
          </div>
        )}
      </div>
    </section>
  )
}

function PageContent() {
  const { onSubmit, saving, error, isPrevMonth, ackPrevMonth } = useInvoiceForm()

  return (
    <main className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Nueva factura</h1>
        <p className="text-sm text-gray-500">
          Al seleccionar un ítem se usa automáticamente su <strong>precio de venta máximo</strong>, pero puedes modificarlo. <br />
          Las <strong>unidades</strong> de cada línea pueden cambiarse dentro de la misma familia (peso, volumen, longitud, área); las cantidades se convierten a la <em>unidad base</em> del ítem y los precios al <em>precio por unidad</em> correspondiente.
        </p>
      </div>

      <Alerts />

      <form onSubmit={onSubmit} className="space-y-6">
        {/* ===== Cliente ===== */}
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-medium mb-4">Cliente</h2>
          <ClientSection />
        </section>

        {/* ===== Detalles de la factura ===== */}
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-medium mb-4">Detalles de la factura</h2>
          <InvoiceDetailsSection />
        </section>

        {/* ===== Ítems (ahora arriba de Pagos, como en Venta rápida) ===== */}
        <ItemsSection />

        {/* ===== Pagos (movido abajo, sin cambiar lógica) ===== */}
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-medium mb-4">Pagos</h2>
          <PaymentsSection />
        </section>

        {/* ===== Totales ===== */}
        <TotalsFooter />

        {/* ===== Acciones ===== */}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Link href="/sales" className="btn">Cancelar</Link>
          <button className="btn btn-primary" disabled={saving || (isPrevMonth && !ackPrevMonth)}>
            {saving ? 'Creando…' : 'Crear factura'}
          </button>
        </div>
      </form>
    </main>
  )
}

export default function NewInvoicePage() {
  return (
    <Protected>
      <Navbar />
      <InvoiceFormProvider>
        <PageContent />
      </InvoiceFormProvider>
    </Protected>
  )
}
