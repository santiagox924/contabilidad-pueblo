'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { USER_ROLES } from '@/lib/roles'
import { InvoiceFormProvider, useInvoiceForm } from '../new-invoice/context/InvoiceFormContext'

import ItemsSection from '../new-invoice/components/ItemsSection/ItemsSection'
import PaymentsSection from '../new-invoice/components/PaymentsSection'
import InvoiceDetailsSection from '../new-invoice/components/InvoiceDetailsSection'
import SearchSelect from '@/components/SearchSelect'

function AlertsInline() {
  const { isPrevMonth, ackPrevMonth, setAckPrevMonth, monthLabel, date, paymentType } = useInvoiceForm()
  const [creditWarn, setCreditWarn] = useState(false)

  // Cada vez que cambie el tipo de pago, mostramos advertencia si es CRÉDITO
  useEffect(() => {
    if (paymentType === 'CREDIT') {
      setCreditWarn(true)
    } else {
      setCreditWarn(false)
    }
  }, [paymentType])

  return (
    <>
      {creditWarn && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700 font-medium">
          Para ventas en crédito debe ser con el formulario completo
        </div>
      )}

      {isPrevMonth && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
          <p className="font-medium">
            Estás creando una factura con fecha en <u>{monthLabel(date)}</u>. ¿Confirmas emitirla para un mes que ya tuvo cierre de contabilidad?
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
    </>
  )
}

function QuickSaleContent() {
  const {
    onSubmit, saving, error, warn,
    partiesArr, partyFound, setPartyFound, thirdPartyId, setThirdPartyId,
    doc, setDoc, name, setName,
    paymentType, setPaymentType,
    totals,
  } = useInvoiceForm()

  // Prefijar cliente mostrador si existe; de lo contrario, establecer doc y nombre por defecto
  useEffect(() => {
    if (!partiesArr || partiesArr.length === 0) return
    const p = partiesArr.find((pp:any) => (pp?.document ?? '').trim() === '222222222')
    if (p) {
      setThirdPartyId(p.id)
      setPartyFound(p)
      setName(p.name || 'Cliente mostrador')
      setDoc(p.document || '222222222')
    } else {
      setThirdPartyId('' as any)
      setPartyFound(null as any)
      setDoc('222222222')
      setName('Cliente mostrador')
    }
  }, [partiesArr, setThirdPartyId, setDoc, setName, setPartyFound])

  // Por defecto, siempre contado
  useEffect(() => {
    if (paymentType !== 'CASH') setPaymentType('CASH')
  }, [paymentType, setPaymentType])

  const fmtTotal = (n: number) =>
    Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <main className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Venta rápida</h1>
          <p className="text-sm text-gray-500">
            Selecciona los ítems y cobra. El cliente por defecto es <strong>222222222</strong> y el método de pago por defecto es <strong>efectivo</strong>.
          </p>
        </div>
        <Link href="/sales/new-invoice" className="btn btn-ghost">Ir al formulario completo</Link>
      </div>

      {/* Mensajes arriba */}
      <AlertsInline />

      <form id="invoice-form" onSubmit={onSubmit} className="space-y-6">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <InvoiceDetailsSection />
        </section>

        {/* Cliente: buscador + creación al vuelo */}
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-medium mb-4">Cliente</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Buscar / seleccionar</label>
              <SearchSelect
                value={thirdPartyId || ''}
                options={partiesArr.map((p) => ({
                  value: p.id,
                  label: p.name,
                  sublabel: [p.document, p.city].filter(Boolean).join(' • '),
                }))}
                placeholder="Escribe nombre, documento o ciudad…"
                onSelect={(opt) => {
                  if (!opt) {
                    setThirdPartyId('' as any)
                    setPartyFound(null as any)
                    setName('')
                    return
                  }
                  const p = partiesArr.find((pp:any) => String(pp.id) === String(opt.value)) || null
                  setThirdPartyId(Number(opt.value) as any)
                  setPartyFound(p as any)
                  if (p) {
                    setName(p.name || '')
                    setDoc(p.document || '')
                  }
                }}
                allowCustom
                onCustom={(label) => {
                  // No hay coincidencias: usamos nombre libre y limpiamos selección
                  setThirdPartyId('' as any)
                  setPartyFound(null as any)
                  setName(label)
                  // Mantén el doc actual (p. ej., 222222222) o el usuario lo cambia abajo
                }}
                onInputChange={(text) => {
                  // Mientras no haya un tercero seleccionado, sincroniza con el nombre
                  if (!thirdPartyId) setName(text)
                }}
              />
            </div>

            {/* Documento solo si NO hay tercero seleccionado (necesario para crear al vuelo) */}
            {!thirdPartyId && (
              <div>
                <label className="block text-sm font-medium mb-1">Documento</label>
                <input
                  type="text"
                  className="input input-bordered w-full rounded-xl"
                  placeholder="Documento del cliente (ej: 222222222)"
                  value={doc}
                  onChange={(e) => setDoc(e.target.value)}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Si no existe el cliente seleccionado, se creará con este documento al guardar.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-medium mb-4">Ítems</h2>
          <ItemsSection />
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-medium mb-4">Pago</h2>
          <PaymentsSection />

          <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-800">
            Precio total de la venta: <strong>${fmtTotal(Number(totals?.total || 0))}</strong>.
          </div>

          {error && (
            <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">
              {error}
            </div>
          )}
          {!error && !!warn && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800">
              {warn}
            </div>
          )}
        </section>

        <div className="mt-6 flex items-center gap-3">
          <button type="submit" className="btn btn-success" disabled={!!saving}>
            {saving ? 'Guardando...' : 'Emitir venta'}
          </button>
          <Link href="/sales" className="btn btn-ghost">Cancelar</Link>
        </div>
      </form>
    </main>
  )
}

function QuickSaleInner() {
  return (
    <InvoiceFormProvider>
      <QuickSaleContent />
    </InvoiceFormProvider>
  )
}

export default function QuickSalePage() {
  return (
    <Protected roles={[
      USER_ROLES.SALES,
      USER_ROLES.ADMINISTRATOR,
      USER_ROLES.SUPER_ADMIN,
    ]}>
      <Navbar />
      <QuickSaleInner />
    </Protected>
  )
}
