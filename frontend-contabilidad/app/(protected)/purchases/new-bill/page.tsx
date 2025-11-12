"use client"
// app/(protected)/purchases/new-bill/page.tsx

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import { api } from '@/lib/api'
import { money } from '@/lib/format'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import UnitPicker from '@/components/UnitPicker'
import { type Uom, familyOf } from '@/lib/uom'
import SearchSelect from '@/components/SearchSelect'
import {
  listPaymentMethods,
  getPaymentMethodBalance,
  type PaymentMethod,
  type PaymentMethodBalance,
} from '@/lib/treasury'

type PartyType = 'CLIENT'|'PROVIDER'|'EMPLOYEE'|'OTHER'
type PersonKind = 'NATURAL' | 'JURIDICAL'
type IdType = 'NIT' | 'CC' | 'PASSPORT' | 'OTHER'

type Party = {
  id: number
  name: string
  type?: PartyType
  personKind?: PersonKind
  idType?: IdType
  legalRepName?: string | null
  document?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  roles?: PartyType[]
}

type Item  = {
  id: number
  name: string
  sku?: string | null
  displayUnit?: Uom | null
  ivaPct?: number | null
  effectiveVatPct?: number | null
}

type Warehouse = { id: number; name: string }

type Line = {
  itemId?: number
  warehouseId?: number
  qty: number
  unitCost: number
  vatPct?: number
  priceIncludesTax?: boolean
  uom?: Uom
  // Metadatos de capa (opcionales)
  expiryDate?: string
  lotCode?: string
  productionDate?: string
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function monthStartISO(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  return start.toISOString().slice(0, 10)
}

function normalizeArray(res: any): any[] {
  const x = res && typeof res === 'object' && 'data' in res ? (res as any).data : res
  if (Array.isArray(x)) return x
  if (!x || typeof x !== 'object') return []
  if (Array.isArray((x as any).items)) return (x as any).items
  if (Array.isArray((x as any).data)) return (x as any).data
  if (Array.isArray((x as any).results)) return (x as any).results
  return []
}

export default function NewPurchasePage() {
  const router = useRouter()
  const [partyIdFromQuery, setPartyIdFromQuery] = useState<string | null>(null)

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search)
      setPartyIdFromQuery(sp.get('partyId'))
    } catch {
      setPartyIdFromQuery(null)
    }
  }, [])

  // ======= Listas base =======
  const [items, setItems] = useState<Item[] | any>([])
  const [parties, setParties] = useState<Party[]>([])
  const providerParties = useMemo(() => parties.filter((p: Party) => Array.isArray(p.roles) && p.roles.includes('PROVIDER')), [parties])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [defaultWarehouseId, setDefaultWarehouseId] = useState<number | ''>('')

  // 🔹 Métodos de pago (activos)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [cashMethodId, setCashMethodId] = useState<number | ''>('') // método para compras CONTADO
  const [methodBalance, setMethodBalance] = useState<PaymentMethodBalance | null>(null)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [balanceLoading, setBalanceLoading] = useState<boolean>(false)
  const balanceRange = useMemo(() => ({
    from: monthStartISO(),
    to: todayISO(),
  }), [])

  // ======= Proveedor (con alta rápida) =======
  const [doc, setDoc] = useState<string>('')
  const [partyFound, setPartyFound] = useState<Party | null>(null)
  const [thirdPartyId, setThirdPartyId] = useState<number | ''>('')

  const [personKind, setPersonKind] = useState<PersonKind>('NATURAL')
  const [idType, setIdType] = useState<IdType>('CC')
  const [legalRepName, setLegalRepName] = useState<string>('')

  const [name, setName] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [phone, setPhone] = useState<string>('')
  const [address, setAddress] = useState<string>('')
  const [city, setCity] = useState<string>('')

  const [searching, setSearching] = useState<boolean>(false)

  // ======= Cabecera de compra =======
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0,10))
  const [paymentType, setPaymentType] = useState<'CASH'|'CREDIT'>('CASH')
  const [dueDate, setDueDate] = useState<string>('')
  const [note, setNote] = useState<string>('')

  // (Opcional) Plan de crédito para CxP
  const [frequency, setFrequency] = useState<'MONTHLY'|'BIWEEKLY'>('MONTHLY')
  const [installments, setInstallments] = useState<number>(1)
  const [firstDueDate, setFirstDueDate] = useState<string>('')

  const [lines, setLines] = useState<Line[]>([
    { itemId: undefined, warehouseId: undefined, qty: 1, unitCost: 0, vatPct: 0, priceIncludesTax: true, uom: 'UN' }
  ])

  const [saving, setSaving] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // ======= Cargar listas base =======
  useEffect(() => {
    (async () => {
      try {
        const [itemsRes, partiesRes, whRes] = await Promise.all([
          api.get('/items'),
          api.get('/parties'),
          api.get('/inventory/warehouses'),
        ])
  setItems(normalizeArray(itemsRes))
  setParties(normalizeArray(partiesRes) as Party[])

        const whList = normalizeArray(whRes) as Warehouse[]
        setWarehouses(whList)
        if (!defaultWarehouseId && whList.length) {
          setDefaultWarehouseId(whList[0].id)
        }
        setLines(prev => prev.map((l, i) => i === 0
          ? { ...l, warehouseId: (whList[0]?.id ?? undefined) }
          : l
        ))

        const pmList = await listPaymentMethods({ active: true })
        setPaymentMethods(pmList)
        // Si hay métodos, preselecciona el primero para contado
        if (pmList.length) {
          const preferred = pmList.find((pm) => pm.bankAccountCode || pm.cashAccountCode) ?? pmList[0]
          setCashMethodId(preferred?.id ?? '')
        }
      } catch {}
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ======= Precargar proveedor si viene ?partyId= =======
  useEffect(() => {
    const id = partyIdFromQuery ? Number(partyIdFromQuery) : 0
    if (!id) return
    ;(async () => {
      try {
        const res = await api.get(`/parties/${id}`)
        const p: Party = (res && 'data' in res ? (res as any).data : res)
        if (p?.id) {
          setThirdPartyId(p.id)
          setPartyFound(p)
          setDoc(p.document || '')
          setPersonKind((p.personKind as PersonKind) ?? 'NATURAL')
          setIdType((p.idType as IdType) ?? ((p.personKind === 'JURIDICAL') ? 'NIT' : 'CC'))
          setLegalRepName(p.legalRepName ?? '')
          setName(p.name || '')
          setEmail(p.email || '')
          setPhone(p.phone || '')
          setAddress(p.address || '')
          setCity(p.city || '')
        }
      } catch {}
    })()
  }, [partyIdFromQuery])

  const documentPlaceholder = useMemo(() => {
    switch (idType) {
      case 'NIT': return 'NIT (ej: 900123456-7)'
      case 'CC': return 'Cédula (CC)'
      case 'PASSPORT': return 'Pasaporte'
      default: return 'Otro documento'
    }
  }, [idType])

  async function lookupByDocument(document: string) {
    const d = document.trim()
    if (!d) {
      setPartyFound(null)
      setThirdPartyId('')
      return
    }
    setSearching(true)
    setError(null)
    try {
      const res = await api.get(`/parties/by-document?document=${encodeURIComponent(d)}`)
      const party: Party = (res && ('data' in res) ? (res as any).data : res) ?? null
      if (party?.id) {
        setPartyFound(party)
        setThirdPartyId(party.id)
        setPersonKind((party.personKind as PersonKind) ?? 'NATURAL')
        setIdType((party.idType as IdType) ?? ((party.personKind === 'JURIDICAL') ? 'NIT' : 'CC'))
        setLegalRepName(party.legalRepName ?? '')
        setName(party.name ?? '')
        setEmail(party.email ?? '')
        setPhone(party.phone ?? '')
        setAddress(party.address ?? '')
        setCity(party.city ?? '')
      } else {
        setPartyFound(null)
        setThirdPartyId('')
        setPersonKind('NATURAL')
        setIdType('CC')
        setLegalRepName('')
        setName(''); setEmail(''); setPhone(''); setAddress(''); setCity('')
      }
    } catch {
      setPartyFound(null)
      setThirdPartyId('')
      setPersonKind('NATURAL')
      setIdType('CC')
      setLegalRepName('')
      setName(''); setEmail(''); setPhone(''); setAddress(''); setCity('')
    } finally {
      setSearching(false)
    }
  }

  const effectiveWarehouseId = (l: Line): number | undefined =>
    (l.warehouseId ?? (defaultWarehouseId ? Number(defaultWarehouseId) : undefined)) || undefined

  function addLine() {
    setLines(prev => [
      ...prev,
      { itemId: undefined, warehouseId: Number(defaultWarehouseId || 0) || undefined, qty: 1, unitCost: 0, vatPct: 0, priceIncludesTax: true, uom: 'UN' }
    ])
  }
  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }
  function updateLine(idx: number, patch: Partial<Line>) {
    setLines(prev => prev.map((ln, i) => i === idx ? { ...ln, ...patch } : ln))
  }

  const totals = useMemo(() => {
    let subtotal = 0
    let vat = 0
    for (const ln of lines) {
      const qty = Number(ln.qty || 0)
      const cost = Number(ln.unitCost || 0)
      const pct = ln.vatPct ? Number(ln.vatPct) : 0
      if (ln.priceIncludesTax) {
        // cost already includes tax: extract base and VAT per unit
        const unitBase = cost / (1 + pct / 100)
        const lineSub = qty * unitBase
        const lineVat = qty * (cost - unitBase)
        subtotal += lineSub
        vat += lineVat
      } else {
        const lineSub = qty * cost
        const lineVat = lineSub * (pct / 100)
        subtotal += lineSub
        vat += lineVat
      }
    }
    const total = subtotal + vat
    return { subtotal, vat, total }
  }, [lines])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const partyId = await ensureProvider()
      if (!lines.length) throw new Error('Agrega al menos una línea')

      for (const ln of lines) {
        if (!ln.itemId) throw new Error('Selecciona el ítem en todas las líneas')
        const wid = effectiveWarehouseId(ln)
        if (!wid) throw new Error('Selecciona la bodega (línea) o define una bodega por defecto')
        if (Number(ln.qty) <= 0) throw new Error('Cantidad debe ser mayor a 0')
        if (Number(ln.unitCost) < 0) throw new Error('El costo unitario no puede ser negativo')
      }

      if (paymentType === 'CREDIT') {
        if (!installments || installments < 1) {
          throw new Error('Indica cuántas cuotas tendrá la compra')
        }
        if (!firstDueDate) {
          throw new Error('Indica desde cuándo empiezan las cuotas')
        }
      } else {
        // CONTADO: exigir método de pago seleccionado
        if (!cashMethodId) {
          throw new Error('Selecciona el método de pago para la compra de contado')
        }
      }

      const prepared = lines.map(ln => ({
        itemId: Number(ln.itemId),
        warehouseId: Number(effectiveWarehouseId(ln)),
        qty: Number(ln.qty),
        unitCost: Number(ln.unitCost),
        vatPct: ln.vatPct !== undefined && ln.vatPct !== null ? Number(ln.vatPct) : undefined,
        priceIncludesTax: !!ln.priceIncludesTax,
        uom: (ln.uom ?? 'UN') as Uom, // ⬅️ trazabilidad de UOM por línea
        // metadatos de capa
        expiryDate: ln.expiryDate || undefined,
        lotCode: ln.lotCode || undefined,
        productionDate: ln.productionDate || undefined,
      }))

      const payload: any = {
        issueDate: date,
        paymentType,
        dueDate: dueDate || undefined,
        note: note || undefined,
        thirdPartyId: Number(partyId),
        lines: prepared,
      }

      if (paymentType === 'CREDIT') {
        payload.creditPlan = {
          frequency,
          installments: Number(installments),
          firstDueDate: firstDueDate || undefined,
        }
      }

      // 1) Crear la factura de compra con stock
      const res = await api.post('/purchases/with-stock', payload)
      const created = (res as any)?.data ?? (res as any)
      const createdId: number | undefined = created?.id

      if (!createdId) {
        throw new Error('No se obtuvo el ID de la compra creada')
      }

      // 2) Si es CONTADO, crear de una vez el pago al proveedor con el método elegido
      if (paymentType === 'CASH') {
        const payPayload = {
          thirdPartyId: Number(partyId),
          date, // misma fecha de la compra
          methodId: Number(cashMethodId),
          total: Number(totals.total),
          allocations: [
            { invoiceId: createdId, amount: Number(totals.total) },
          ],
          note: note || undefined,
        }
        await api.post('/treasury/payments', payPayload)
      }

      // 3) Redirigir al detalle
      router.push(`/purchases/${createdId}`)
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Error creando la compra')
    } finally {
      setSaving(false)
    }
  }

  async function ensureProvider(): Promise<number> {
    if (thirdPartyId) return Number(thirdPartyId)

    if (!doc.trim()) throw new Error('Ingresa el documento del proveedor')
    if (!name.trim()) throw new Error('Ingresa el nombre del proveedor')

    const payload: any = {
      type: 'PROVIDER',
      personKind,
      idType,
      legalRepName: personKind === 'JURIDICAL' && legalRepName.trim() ? legalRepName.trim() : undefined,
      document: doc.trim(),
      name: name.trim(),
      email: email || undefined,
      phone: phone || undefined,
      address: address || undefined,
      city: city || undefined,
    }

    const created = await api.post('/parties', payload)
    const id = (created as any).data?.id ?? (created as any)?.id
    if (!id) throw new Error('No se pudo crear el proveedor')

    setThirdPartyId(id)
    try {
      const refreshed = await api.get('/parties')
      setParties(normalizeArray(refreshed))
    } catch {}

    return id
  }

  const itemsArr: Item[] = Array.isArray(items) ? items : []
  const partiesArr: Party[] = Array.isArray(parties) ? parties : []
  const warehousesArr: Warehouse[] = Array.isArray(warehouses) ? warehouses : []
  const pmArr: PaymentMethod[] = Array.isArray(paymentMethods) ? paymentMethods : []
  const selectedCashMethod = pmArr.find((pm) => pm.id === cashMethodId)

  useEffect(() => {
    if (paymentType !== 'CASH' || !cashMethodId) {
      setMethodBalance(null)
      setBalanceError(null)
      setBalanceLoading(false)
      return
    }

    const controller = new AbortController()
    let active = true

    setBalanceLoading(true)
    setBalanceError(null)
    setMethodBalance(null)
    getPaymentMethodBalance(Number(cashMethodId), balanceRange, controller.signal)
      .then((res) => {
        if (!active) return
        setMethodBalance(res)
      })
      .catch((err: any) => {
        if (!active) return
        setMethodBalance(null)
        setBalanceError(err?.response?.data?.message ?? err?.message ?? 'No se pudo calcular el saldo')
      })
      .finally(() => {
        if (active) setBalanceLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [cashMethodId, paymentType, balanceRange])

  return (
    <Protected>
      <Navbar />
      <main className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Nueva compra</h1>
          <p className="text-sm text-gray-500">
            Al ingresar una compra, el stock entra a la bodega seleccionada por línea y se crean capas con los metadatos que informes (lote, vencimiento, fabricación).
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          {/* ===== Proveedor ===== */}
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-medium mb-4">Proveedor</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">Persona</label>
                <select
                  className="input"
                  value={personKind}
                  onChange={(e) => {
                    const v = e.target.value as PersonKind
                    // ⚠️ Permitimos NATURAL con NIT; no forzamos idType aquí.
                    setPersonKind(v)
                  }}
                  disabled={!!partyFound}
                >
                  <option value="NATURAL">Natural</option>
                  <option value="JURIDICAL">Jurídica</option>
                </select>
              </div>

              <div>
                <label className="label">Tipo de identificación</label>
                <select
                  className="input"
                  value={idType}
                  onChange={(e) => setIdType(e.target.value as IdType)}
                  disabled={!!partyFound}
                >
                  <option value="NIT">NIT</option>
                  <option value="CC">CC</option>
                  <option value="PASSPORT">Pasaporte</option>
                  <option value="OTHER">Otro</option>
                </select>
                {personKind === 'NATURAL' && idType === 'NIT' && (
                  <p className="text-xs text-amber-600 mt-1">Permitido: persona natural con NIT.</p>
                )}
              </div>

              <div>
                <label className="label">Documento</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input w-full"
                    placeholder={documentPlaceholder}
                    value={doc}
                    onChange={(e) => setDoc(e.target.value)}
                    onBlur={() => lookupByDocument(doc)}
                    disabled={!!partyFound}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => lookupByDocument(doc)}
                    disabled={searching || !!partyFound}
                    title="Buscar por documento"
                  >
                    {searching ? 'Buscando…' : 'Buscar'}
                  </button>
                </div>
              </div>
            </div>

            {personKind === 'JURIDICAL' && (
              <div className="mt-3">
                <label className="label">Representante legal (opcional)</label>
                <input
                  className="input"
                  placeholder="Representante legal"
                  value={legalRepName}
                  onChange={(e) => setLegalRepName(e.target.value)}
                  disabled={!!partyFound}
                />
              </div>
            )}

            <div className="mt-4">
              <label className="block text-sm font-medium mb-1">Proveedor (buscador)</label>
              <SearchSelect
                disabled={!!partyFound}
                value={thirdPartyId || ''}
                options={providerParties.map(p => ({
                  value: p.id,
                  label: p.name,
                  sublabel: [p.document, p.city].filter(Boolean).join(' • ')
                }))}
                placeholder="Escribe nombre, NIT/CC o ciudad…"
                onSelect={(opt) => {
                  if (!opt) {
                    setThirdPartyId('')
                    setPartyFound(null)
                    setDoc('')
                    setPersonKind('NATURAL'); setIdType('CC'); setLegalRepName('')
                    setName(''); setEmail(''); setPhone(''); setAddress(''); setCity('')
                    return
                  }
                  const p = partiesArr.find(pp => String(pp.id) === String(opt.value)) || null
                  setThirdPartyId(Number(opt.value))
                  setPartyFound(p || null)
                  if (p) {
                    setDoc(p.document || '')
                    setPersonKind((p.personKind as PersonKind) ?? 'NATURAL')
                    setIdType((p.idType as IdType) ?? ((p.personKind === 'JURIDICAL') ? 'NIT' : 'CC'))
                    setLegalRepName(p.legalRepName ?? '')
                    setName(p.name || '')
                    setEmail(p.email || '')
                    setPhone(p.phone || '')
                    setAddress(p.address || '')
                    setCity(p.city || '')
                  }
                }}
                // 🔵 Habilita creación al vuelo
                allowCustom
                onCustom={(label) => {
                  // No hay coincidencias => usar el nombre escrito y limpiar selección
                  setThirdPartyId('' as any)
                  setPartyFound(null as any)
                  setName(label)
                }}
                onInputChange={(text) => {
                  // Mientras no haya proveedor seleccionado, sincroniza con el campo Nombre
                  if (!thirdPartyId) setName(text)
                }}
              />
              {!!partyFound && (
                <p className="text-xs text-gray-500 mt-1">
                  Deshabilitado porque el proveedor fue seleccionado por documento o preseleccionado.
                </p>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nombre / Razón social</label>
                <input
                  type="text"
                  className="input input-bordered w-full rounded-xl"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={personKind === 'JURIDICAL' ? 'Razón social' : 'Nombre completo'}
                  disabled={!!partyFound}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Correo</label>
                <input
                  type="email"
                  className="input input-bordered w-full rounded-xl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="proveedor@correo.com"
                  disabled={!!partyFound}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Teléfono</label>
                <input
                  type="text"
                  className="input input-bordered w-full rounded-xl"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+57 ..."
                  disabled={!!partyFound}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Dirección</label>
                <input
                  type="text"
                  className="input input-bordered w-full rounded-xl"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Calle 123 #45-67"
                  disabled={!!partyFound}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ciudad</label>
                <input
                  type="text"
                  className="input input-bordered w-full rounded-xl"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Bogotá"
                  disabled={!!partyFound}
                />
              </div>
            </div>
          </section>

          {/* ===== Ítems ===== */}
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-medium">Ítems</h2>
              <button type="button" className="btn btn-outline" onClick={addLine}>Agregar línea</button>
            </div>

            <div className="space-y-3">
              {lines.map((ln, idx) => {
              const selected = itemsArr.find((i: any) => i.id === ln.itemId)
                const uom: Uom = (ln.uom ?? (selected?.displayUnit as Uom) ?? 'UN')

                return (
                  <div key={idx}>
                    <div
                      className="grid grid-cols-1 md:grid-cols-[0.9fr_1.2fr_0.55fr_0.7fr_0.7fr_0.8fr_0.8fr_auto] gap-3 items-start border rounded-xl p-3"
                    >
                      {/* Bodega (línea) */}
                      <div>
                        <label className="block text-sm font-medium mb-1">Bodega (línea)</label>
                        <select
                          className="select select-bordered w-full rounded-xl"
                          value={ln.warehouseId ?? (defaultWarehouseId || '')}
                          onChange={(e) => {
                            const wid = e.target.value ? Number(e.target.value) : undefined
                            updateLine(idx, { warehouseId: wid })
                          }}
                        >
                          <option value="">-- seleccionar --</option>
                          {warehousesArr.map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Ítem (buscador) */}
                      <div>
                        <label className="block text-sm font-medium mb-1">Ítem</label>
                        <SearchSelect
                          value={ln.itemId ?? ''}
                          options={itemsArr.map((it: Item) => ({
                            value: it.id,
                            label: `${it.name}${it.sku ? ` (${it.sku})` : ''}`,
                            sublabel: it.sku || ''
                          }))}
                          placeholder="Buscar ítem por nombre o SKU…"
                          onSelect={(opt) => {
                            const id = opt ? Number(opt.value) : undefined;
                            const it = itemsArr.find((ii: Item) => ii.id === id);
                            const nextUom: Uom = (it?.displayUnit as Uom) || 'UN';
                            // Resuelva vatPct desde el ítem: preferir ivaPct positivo; si ivaPct === 0
                            // pero existe effectiveVatPct, usarlo (cubre items heredando tasa por categoría)
                            let resolvedVat = ln.vatPct;
                            if (id) {
                              const iva = it?.ivaPct;
                              const eff = (it as any)?.effectiveVatPct;
                              if (iva != null && Number(iva) !== 0) resolvedVat = Number(iva);
                              else if (eff != null) resolvedVat = Number(eff);
                              else resolvedVat = Number(ln.vatPct ?? 0);
                            }
                            const resolvedUnitCost = (Number(ln.unitCost || 0) > 0)
                              ? Number(ln.unitCost)
                              : Number((it as any)?.price ?? ln.unitCost ?? 0);
                            updateLine(idx, {
                              itemId: id,
                              uom: nextUom,
                              vatPct: resolvedVat,
                              unitCost: resolvedUnitCost,
                            });
                            // Si la línea ya tenía un ítem o es la última, agrega una nueva línea automáticamente
                            if ((ln.itemId == null && id) || (idx === lines.length - 1 && id)) {
                              // Solo agrega si la línea actual no tenía ítem o es la última
                              setTimeout(() => { addLine(); }, 0);
                            }
                          }}
                        />
                      </div>

                      {/* Unidad (editable con buscador) */}
                      <div>
                        <label className="block text-sm font-medium mb-1">Unidad</label>
                        <UnitPicker
                          value={uom}
                          onChange={(u?: Uom) => updateLine(idx, { uom: u ?? uom })}
                          placeholder="Buscar unidad…"
                          family={familyOf(uom)}
                          label="Elige unidad…"
                        />
                      </div>

                      {/* Cantidad */}
                      <div>
                        <label className="block text-sm font-medium mb-1">Cantidad</label>
                        <input
                          type="number"
                          min={0}
                          step={0.0001}
                          className="input input-bordered w-full rounded-xl"
                          value={ln.qty}
                          onChange={(e) => updateLine(idx, { qty: Number(e.target.value || 0) })}
                        />
                      </div>

                      {/* Costo unitario */}
                      <div>
                        <label className="block text-sm font-medium mb-1">Costo unitario</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className="input input-bordered w-full rounded-xl"
                          value={ln.unitCost}
                          onChange={(e) => updateLine(idx, { unitCost: Number(e.target.value) })}
                        />
                        {/* Precio incluye IVA: se asume por defecto para compras */}
                      </div>

                      {/* Metadatos de capa */}
                      <div>
                        <label className="block text-sm font-medium mb-1">Vence</label>
                        <input
                          type="date"
                          className="input input-bordered w-full rounded-xl"
                          value={ln.expiryDate ?? ''}
                          onChange={(e)=>updateLine(idx, { expiryDate: e.target.value || undefined })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Lote</label>
                        <input
                          type="text"
                          className="input input-bordered w-full rounded-xl"
                          value={ln.lotCode ?? ''}
                          onChange={(e)=>updateLine(idx, { lotCode: e.target.value || undefined })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Fabricación</label>
                        <input
                          type="date"
                          className="input input-bordered w-full rounded-xl"
                          value={ln.productionDate ?? ''}
                          onChange={(e)=>updateLine(idx, { productionDate: e.target.value || undefined })}
                        />
                      </div>

                      {/* Acciones de línea */}
                      <div className="flex justify-end items-end md:pt-6">
                        <button type="button" className="btn btn-ghost" onClick={() => removeLine(idx)}>Quitar</button>
                      </div>
                    </div>

                    {/* Botón “Agregar línea” debajo de la última */}
                    {idx === lines.length - 1 && (
                      <div className="flex justify-end mt-2">
                        <button type="button" className="btn btn-outline btn-sm" onClick={addLine}>
                          Agregar línea
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Totales */}
            <div className="text-right space-y-1 pt-4">
              <div>Subtotal: <strong>{money(totals.subtotal)}</strong></div>
              <div>IVA: <strong>{money(totals.vat)}</strong></div>
              <div>Total compra: <strong>{money(totals.total)}</strong></div>
            </div>
          </section>

          {/* ===== Detalles de la compra ===== */}
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-medium mb-4">Detalles</h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Fecha</label>
                <input
                  type="date"
                  className="input input-bordered w-full rounded-xl"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Forma de pago</label>
                <select
                  className="select select-bordered w-full rounded-xl"
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value as 'CASH'|'CREDIT')}
                >
                  <option value="CASH">Contado</option>
                  <option value="CREDIT">Crédito</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Vencimiento único (opcional)</label>
                <input
                  type="date"
                  className="input input-bordered w-full rounded-xl"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Bodega (por defecto)</label>
                <select
                  className="select select-bordered w-full rounded-xl"
                  value={defaultWarehouseId}
                  onChange={(e) => setDefaultWarehouseId(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">-- seleccionar --</option>
                  {warehousesArr.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Se asignará automáticamente a las líneas que no tengan bodega seleccionada.
                </p>
              </div>
            </div>

            {/* 🔹 Selección de método de pago para CONTADO */}
            {paymentType === 'CASH' && (
              <div className="mt-4 rounded-xl bg-emerald-50 p-4 border grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-3">
                  <label className="block text-sm font-medium mb-1">Método de pago</label>
                  <select
                    className="select select-bordered w-full rounded-xl"
                    value={cashMethodId ?? ''}
                    onChange={(e) => setCashMethodId(e.target.value ? Number(e.target.value) : '')}
                  >
                    {pmArr.length === 0 && <option value="">-- no hay métodos activos --</option>}
                    {pmArr.map(pm => {
                      const accountTag = pm.bankAccountCode || pm.cashAccountCode
                      return (
                        <option key={pm.id} value={pm.id}>
                          {pm.name}{accountTag ? ` - ${accountTag}` : ''}
                        </option>
                      )
                    })}
                  </select>
                  {pmArr.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      No hay métodos de pago activos. Crea uno en Tesorería → Métodos.
                    </p>
                  )}
                  {selectedCashMethod && (
                    <div className="rounded-lg border bg-white p-3 text-xs text-gray-600 space-y-2">
                      <div className="text-sm font-semibold text-gray-700">Detalle contable</div>
                      {selectedCashMethod.accountName && (
                        <div>Cuenta: {selectedCashMethod.accountName}</div>
                      )}
                      {selectedCashMethod.accountNumber && (
                        <div>Número: {selectedCashMethod.accountNumber}</div>
                      )}
                      <div>
                        {selectedCashMethod.bankAccountCode || selectedCashMethod.cashAccountCode ? (
                          <span>
                            Cuenta contable:{' '}
                            {selectedCashMethod.bankAccountCode ?? selectedCashMethod.cashAccountCode}
                          </span>
                        ) : (
                          <span className="text-amber-700">
                            Configura la cuenta contable desde Tesorería → Métodos para reflejar el saldo.
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        El balance mostrado a continuación corresponde al rango {balanceRange.from} → {balanceRange.to}.
                      </div>
                      <div className="rounded-md border bg-emerald-50 p-2">
                        {balanceLoading && (
                          <div className="text-[11px] text-emerald-700">Calculando balance…</div>
                        )}
                        {!balanceLoading && balanceError && (
                          <div className="text-[11px] text-rose-700">{balanceError}</div>
                        )}
                        {!balanceLoading && !balanceError && methodBalance && (
                          <div className="text-[13px] font-semibold text-emerald-800">
                            Saldo contable: {money(methodBalance.balance)}
                            <span className="ml-2 text-[11px] text-emerald-700">({methodBalance.accountCode})</span>
                          </div>
                        )}
                        {!balanceLoading && !balanceError && !methodBalance && (
                          <div className="text-[11px] text-gray-500">Sin saldo disponible para el rango.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 bg-white rounded-xl p-3 border">
                  <div className="text-sm text-gray-500">Total a pagar</div>
                  <div className="text-right font-semibold">{money(totals.total)}</div>
                  <div className="text-xs text-gray-500 md:col-span-2">
                    Se registrará el pago automáticamente con el método seleccionado.
                  </div>
                </div>
              </div>
            )}

            {/* Plan de crédito CxP (opcional) */}
            {paymentType === 'CREDIT' && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4 rounded-xl bg-indigo-50 p-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Frecuencia</label>
                  <select
                    className="select select-bordered w-full rounded-xl"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as 'MONTHLY'|'BIWEEKLY')}
                  >
                    <option value="BIWEEKLY">Quincenal</option>
                    <option value="MONTHLY">Mensual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1"># de cuotas</label>
                  <input
                    type="number"
                    className="input input-bordered w-full rounded-xl"
                    min={1}
                    value={installments}
                    onChange={(e) => setInstallments(Math.max(1, Number(e.target.value || 0)))}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Primer pago desde</label>
                  <input
                    type="date"
                    className="input input-bordered w-full rounded-xl"
                    value={firstDueDate}
                    onChange={(e) => setFirstDueDate(e.target.value)}
                  />
                </div>

                <div className="md:col-span-2 grid grid-cols-2 gap-2 bg-white rounded-xl p-3 border">
                  <div className="text-sm text-gray-500">Subtotal</div>
                  <div className="text-right font-medium">{money(totals.subtotal)}</div>
                  <div className="text-sm text-gray-500">IVA</div>
                  <div className="text-right font-medium">{money(totals.vat)}</div>
                  <div className="text-sm text-gray-700">Total compra</div>
                  <div className="text-right font-semibold">{money(totals.total)}</div>
                </div>
              </div>
            )}

            <div className="mt-4">
              <label className="block text-sm font-medium mb-1">Notas</label>
              <textarea
                className="textarea textarea-bordered w-full rounded-xl"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Notas de la compra"
              />
            </div>
          </section>

          {/* ===== Ítems ===== */}
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-medium">Ítems</h2>
              <button type="button" className="btn btn-outline" onClick={addLine}>Agregar línea</button>
            </div>

            <div className="space-y-3">
              {lines.map((ln, idx) => {
              const selected = itemsArr.find((i: any) => i.id === ln.itemId)
                const uom: Uom = (ln.uom ?? (selected?.displayUnit as Uom) ?? 'UN')

                return (
                  <div key={idx}>
                    <div
                      className="grid grid-cols-1 md:grid-cols-[0.9fr_1.2fr_0.55fr_0.7fr_0.7fr_0.8fr_0.8fr_auto] gap-3 items-start border rounded-xl p-3"
                    >
                      {/* Bodega (línea) */}
                      <div>
                        <label className="block text-sm font-medium mb-1">Bodega (línea)</label>
                        <select
                          className="select select-bordered w-full rounded-xl"
                          value={ln.warehouseId ?? (defaultWarehouseId || '')}
                          onChange={(e) => {
                            const wid = e.target.value ? Number(e.target.value) : undefined
                            updateLine(idx, { warehouseId: wid })
                          }}
                        >
                          <option value="">-- seleccionar --</option>
                          {warehousesArr.map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Ítem (buscador) */}
                      <div>
                        <label className="block text-sm font-medium mb-1">Ítem</label>
                        <SearchSelect
                          value={ln.itemId ?? ''}
                          options={itemsArr.map((it: Item) => ({
                            value: it.id,
                            label: `${it.name}${it.sku ? ` (${it.sku})` : ''}`,
                            sublabel: it.sku || ''
                          }))}
                          placeholder="Buscar ítem por nombre o SKU…"
                          onSelect={(opt) => {
                            const id = opt ? Number(opt.value) : undefined
                            const it = itemsArr.find((ii: Item) => ii.id === id)
                            const nextUom: Uom = (it?.displayUnit as Uom) || 'UN'
                            // Resuelva vatPct desde el ítem: preferir ivaPct positivo; si ivaPct === 0
                            // pero existe effectiveVatPct, usarlo (cubre items heredando tasa por categoría)
                            let resolvedVat = ln.vatPct
                            if (id) {
                              const iva = it?.ivaPct
                              const eff = (it as any)?.effectiveVatPct
                              if (iva != null && Number(iva) !== 0) resolvedVat = Number(iva)
                              else if (eff != null) resolvedVat = Number(eff)
                              else resolvedVat = Number(ln.vatPct ?? 0)
                            }
                            const resolvedUnitCost = (Number(ln.unitCost || 0) > 0)
                              ? Number(ln.unitCost)
                              : Number((it as any)?.price ?? ln.unitCost ?? 0)
                            updateLine(idx, {
                              itemId: id,
                              uom: nextUom,
                              vatPct: resolvedVat,
                              unitCost: resolvedUnitCost,
                            })
                          }}
                        />
                      </div>

                      {/* Unidad (editable con buscador) */}
                      <div>
                        <label className="block text-sm font-medium mb-1">Unidad</label>
                        <UnitPicker
                          value={uom}
                          onChange={(u?: Uom) => updateLine(idx, { uom: u ?? uom })}
                          placeholder="Buscar unidad…"
                          family={familyOf(uom)}
                          label="Elige unidad…"
                        />
                      </div>

                      {/* Cantidad */}
                      <div>
                        <label className="block text-sm font-medium mb-1">Cantidad</label>
                        <input
                          type="number"
                          min={0}
                          step={0.0001}
                          className="input input-bordered w-full rounded-xl"
                          value={ln.qty}
                          onChange={(e) => updateLine(idx, { qty: Number(e.target.value || 0) })}
                        />
                      </div>

                      {/* Costo unitario */}
                      <div>
                        <label className="block text-sm font-medium mb-1">Costo unitario</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className="input input-bordered w-full rounded-xl"
                          value={ln.unitCost}
                          onChange={(e) => updateLine(idx, { unitCost: Number(e.target.value) })}
                        />
                        {/* Precio incluye IVA: se asume por defecto para compras */}
                      </div>

                      {/* Metadatos de capa */}
                      <div>
                        <label className="block text-sm font-medium mb-1">Vence</label>
                        <input
                          type="date"
                          className="input input-bordered w-full rounded-xl"
                          value={ln.expiryDate ?? ''}
                          onChange={(e)=>updateLine(idx, { expiryDate: e.target.value || undefined })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Lote</label>
                        <input
                          type="text"
                          className="input input-bordered w-full rounded-xl"
                          value={ln.lotCode ?? ''}
                          onChange={(e)=>updateLine(idx, { lotCode: e.target.value || undefined })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Fabricación</label>
                        <input
                          type="date"
                          className="input input-bordered w-full rounded-xl"
                          value={ln.productionDate ?? ''}
                          onChange={(e)=>updateLine(idx, { productionDate: e.target.value || undefined })}
                        />
                      </div>

                      {/* Acciones de línea */}
                      <div className="flex justify-end items-end md:pt-6">
                        <button type="button" className="btn btn-ghost" onClick={() => removeLine(idx)}>Quitar</button>
                      </div>
                    </div>

                    {/* Botón “Agregar línea” debajo de la última */}
                    {idx === lines.length - 1 && (
                      <div className="flex justify-end mt-2">
                        <button type="button" className="btn btn-outline btn-sm" onClick={addLine}>
                          Agregar línea
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Totales */}
            <div className="text-right space-y-1 pt-4">
              <div>Subtotal: <strong>{money(totals.subtotal)}</strong></div>
              <div>IVA: <strong>{money(totals.vat)}</strong></div>
              <div>Total compra: <strong>{money(totals.total)}</strong></div>
            </div>
          </section>

          {/* Acciones */}
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-2 justify-end">
            <a className="btn" href="/purchases">Cancelar</a>
            <button className="btn btn-primary" disabled={saving}>
              {saving ? 'Creando…' : 'Crear compra'}
            </button>
          </div>
        </form>
      </main>
    </Protected>
  )
}
