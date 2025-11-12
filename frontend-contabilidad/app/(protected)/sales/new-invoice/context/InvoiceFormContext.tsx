// frontend-contabilidad/app/(protected)/sales/new-invoice/context/InvoiceFormContext.tsx
'use client'

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { money } from '@/lib/format'
import {
  type Uom,
  familyOf,
  toBase as convertToBase,
  fromBase as convertFromBase,
  convertUnitPrice,
  stepFor as stepForUom,
  fmtQty,
} from '@/lib/uom'

// 🔹 Métodos de pago (backend)
import {
  listPaymentMethods,
  type PaymentMethod,
} from '@/lib/treasury'

// ================== Tipos ==================
type PartyType = 'CLIENT'|'PROVIDER'|'EMPLOYEE'|'OTHER'
type PersonKind = 'NATURAL' | 'JURIDICAL'
type IdType = 'NIT' | 'CC' | 'PASSPORT' | 'OTHER'
type UnitKind = 'COUNT' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA'
type ItemType = 'PRODUCT' | 'SERVICE'

export type Party = {
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
}

export type Item  = {
  id: number
  name: string
  sku?: string | null
  type?: ItemType | null
  unitKind?: UnitKind | null
  baseUnit?: Uom | null
  displayUnit?: Uom | null
  ivaPct?: number | null
  priceMin?: number | null
  priceMid?: number | null
  priceMax?: number | null
  price?: number | null
  defaultDiscountPct?: number | null
}

export type Warehouse = { id: number; name: string }

export type Line = {
  itemId?: number
  warehouseId?: number
  qty: number
  unitPrice: number
  lineTotal?: number
  discountPct?: number
  vatPct?: number
  uom?: Uom
  priceIncludesTax?: boolean
  baseAvailable?: number
  available?: number
  loadingAvail?: boolean
  uomError?: string
}

// 🔄 El método de pago se guarda por id (y opcionalmente nombre para UI)
export type PaymentRow = {
  methodId?: number
  methodName?: string
  amount: number
  note?: string
  autoSync?: boolean
}

// ================== Constantes ==================
export const RESPONSIBILITY_OPTIONS = [
  'Régimen simple',
  'Régimen común',
  'No responsable de IVA',
  'Autorretenedor',
  'Gran contribuyente',
]

// ================== Helpers locales ==================
function normalizeArray(res: any): any[] {
  const x = res && typeof res === 'object' && 'data' in res ? (res as any).data : res
  if (Array.isArray(x)) return x
  if (!x || typeof x !== 'object') return []
  if (Array.isArray((x as any).items)) return (x as any).items
  if (Array.isArray((x as any).data)) return (x as any).data
  if (Array.isArray((x as any).results)) return (x as any).results
  return []
}
function monthLabelLocal(dStr: string) {
  try {
    const d = new Date(dStr)
    return d.toLocaleString('es-CO', { month: 'long', year: 'numeric' })
  } catch { return '' }
}
const eqCents = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100)
const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

function familyHumanName(kind?: UnitKind): string {
  switch (kind) {
    case 'WEIGHT': return 'Kilos'
    case 'VOLUME': return 'Litros'
    case 'LENGTH': return 'Metros'
    case 'AREA':   return 'Metros cuadrados'
    default:       return 'Unidades'
  }
}

/**
 * Permitimos vender en cualquier unidad de la MISMA FAMILIA del ítem.
 */
function allowedUomsForItem(it?: Item): Uom[] {
  const kind = it?.unitKind ?? (it?.displayUnit ? familyOf(it.displayUnit as Uom) : 'COUNT')

  if (kind === 'WEIGHT') return ['MG', 'G', 'KG', 'LB']
  if (kind === 'VOLUME') return ['ML', 'L', 'M3', 'CM3', 'OZ_FL', 'GAL']
  if (kind === 'LENGTH') return ['MM', 'CM', 'M', 'KM', 'IN', 'FT', 'YD']
  if (kind === 'AREA')   return ['CM2', 'M2', 'IN2', 'FT2', 'YD2']
  // COUNT
  return ['UN', 'DZ', 'PKG', 'BOX', 'PR', 'ROLL']
}

// ================== Context ==================
type Ctx = ReturnType<typeof useInvoiceFormInternal>
const InvoiceFormContext = createContext<Ctx | null>(null)

function useInvoiceFormInternal() {
  const router = useRouter()

  // ======= Estado de listas =======
  const [items, setItems] = useState<Item[] | any>([])
  const [parties, setParties] = useState<Party[] | any>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [defaultWarehouseId, setDefaultWarehouseId] = useState<number | ''>('')

  // 🔹 Métodos de pago disponibles (desde backend)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  async function refetchPaymentMethods(activeOnly = true) {
    try {
      const data = await listPaymentMethods({ active: activeOnly })
      setPaymentMethods(Array.isArray(data) ? data : [])
    } catch {
      setPaymentMethods([])
    }
  }

  // ======= Estado del tercero / alta rápida =======
  const [doc, setDoc] = useState<string>('')
  const [partyFound, setPartyFound] = useState<Party | null>(null)
  const [thirdPartyId, setThirdPartyId] = useState<number | ''>('')

  const [personKind, setPersonKind] = useState<PersonKind>('NATURAL')
  const [idType, setIdType] = useState<IdType>('CC')
  const [legalRepName, setLegalRepName] = useState<string>('')

  const [responsibilities, setResponsibilities] = useState<string[]>([])

  const [name, setName] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [phone, setPhone] = useState<string>('')
  const [address, setAddress] = useState<string>('')
  const [city, setCity] = useState<string>('')

  const [searching, setSearching] = useState<boolean>(false)

  // ======= Estado de la factura =======
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0,10))
  const [paymentType, setPaymentType] = useState<'CASH'|'CREDIT'>('CASH')
  const [dueDate, setDueDate] = useState<string>('')
  const [note, setNote] = useState<string>('')
  const [priceIncludesTax, setPriceIncludesTax] = useState<boolean>(true)

  // Confirmación si fecha es de mes anterior
  const [ackPrevMonth, setAckPrevMonth] = useState<boolean>(false)

  // ======= Plan de crédito =======
  const [frequency, setFrequency] = useState<'MONTHLY'|'BIWEEKLY'>('MONTHLY')
  const [installments, setInstallments] = useState<number>(1)
  const [firstDueDate, setFirstDueDate] = useState<string>('')

  // ======= % incremento y cuota inicial =======
  const [creditMarkupPct, setCreditMarkupPct] = useState<number | ''>('') // %
  const [downPayment, setDownPayment] = useState<number | ''>('') // $

  // Pagos (en crédito se fuerza a 1 renglón = cuota inicial)
  const [payments, setPayments] = useState<PaymentRow[]>([])

  // ======= Líneas =======
  const [lines, setLines] = useState<Line[]>([
    { itemId: undefined, warehouseId: undefined, qty: 1, unitPrice: 0, lineTotal: 0, discountPct: 0, vatPct: 0, uom: 'UN', priceIncludesTax }
  ])

  // 🔸 Nube de bandas por click
  const [priceHintIdx, setPriceHintIdx] = useState<number | null>(null)
  const priceRefs = useRef<Array<HTMLDivElement|null>>([])

  const [saving, setSaving] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [warn, setWarn] = useState<string | null>(null)

  // Cerrar nube si se hace click fuera
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (priceHintIdx === null) return
      const el = priceRefs.current[priceHintIdx]
      if (!el) { setPriceHintIdx(null); return }
      if (!el.contains(e.target as Node)) setPriceHintIdx(null)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [priceHintIdx])

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
        setParties(normalizeArray(partiesRes))

        const whList = normalizeArray(whRes) as Warehouse[]
        setWarehouses(whList)
        if (!defaultWarehouseId && whList.length) {
          setDefaultWarehouseId(whList[0].id)
        }
        setLines(prev => prev.map((l, i) => i === 0
          ? { ...l, warehouseId: (whList[0]?.id ?? undefined) }
          : l
        ))
      } catch {}
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 🔹 Cargar métodos de pago activos
  useEffect(() => {
    refetchPaymentMethods(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ======= Cargar tercero si viene preseleccionado =======
  // (El query param se maneja en la página; aquí mantenemos solo el flujo básico)

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
        setIdType((party.idType as IdType) ?? 'CC')
        setLegalRepName(party.legalRepName ?? '')
        setResponsibilities(Array.isArray((party as any).responsibilities) ? (party as any).responsibilities : [])
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
        setResponsibilities([])
        setName(''); setEmail(''); setPhone(''); setAddress(''); setCity('')
      }
    } catch {
      setPartyFound(null)
      setThirdPartyId('')
      setPersonKind('NATURAL')
      setIdType('CC')
      setLegalRepName('')
      setResponsibilities([])
      setName(''); setEmail(''); setPhone(''); setAddress(''); setCity('')
    } finally {
      setSearching(false)
    }
  }

  // ======= Helpers de disponibilidad/unidades =======
  const itemsArr: Item[] = Array.isArray(items) ? items : []
  const partiesArr: Party[] = Array.isArray(parties) ? parties : []
  const warehousesArr: Warehouse[] = Array.isArray(warehouses) ? warehouses : []

  const getItem = (id?: number) => itemsArr.find(i => i.id === id)
  const isService = (line: Line) => {
    const it = getItem(line.itemId)
    return (it?.type || 'PRODUCT') === 'SERVICE'
  }
  const effectiveWarehouseId = (l: Line): number | undefined =>
    isService(l) ? undefined : ((l.warehouseId ?? (defaultWarehouseId ? Number(defaultWarehouseId) : undefined)) || undefined)

  function reservedInOtherLinesBase(itemId: number, warehouseId: number, excludeIndex?: number) {
    const it = getItem(itemId)
    const base = (it?.baseUnit as Uom) || 'UN'
    return lines.reduce((acc, l, idx) => {
      if (idx === (excludeIndex ?? -1)) return acc
      const wid = effectiveWarehouseId(l)
      if (!isService(l) && l.itemId === itemId && wid === warehouseId) {
        const from = (l.uom ?? it?.displayUnit ?? base) as Uom
        try {
          const qBase = convertToBase(Number(l.qty || 0), from, base)
          return acc + qBase
        } catch { return acc }
      }
      return acc
    }, 0)
  }

  function recomputeAvailabilityForGroup(itemId?: number, warehouseId?: number) {
    if (!itemId || !warehouseId) return
    const it = getItem(itemId)
    const base = (it?.baseUnit as Uom) || 'UN'
    setLines(prev =>
      prev.map((l, i) => {
        const wid = effectiveWarehouseId(l)
        if (!isService(l) && l.itemId === itemId && wid === warehouseId) {
          const baseAvail = Number(l.baseAvailable ?? NaN)
          if (Number.isNaN(baseAvail)) return { ...l, available: undefined }
          const reservedOthersBase = reservedInOtherLinesBase(itemId, warehouseId, i)
          const adjBase = Math.max(0, baseAvail - reservedOthersBase)
          const toUom = (l.uom ?? it?.displayUnit ?? base) as Uom
          try {
            const shown = convertFromBase(adjBase, base, toUom)
            return { ...l, available: shown }
          } catch {
            return { ...l, available: undefined }
          }
        }
        return l
      })
    )
  }

  async function refreshAvailabilityForLine(
    idx: number,
    itemId?: number,
    forceQtyToAvail: boolean = false,
    overrideWarehouseId?: number
  ) {
    const ln = lines[idx]
    if (isService(ln)) {
      updateLine(idx, { baseAvailable: undefined, available: undefined, loadingAvail: false })
      return
    }
    const wid = overrideWarehouseId ?? effectiveWarehouseId(ln)
    if (!wid || !itemId) {
      updateLine(idx, { baseAvailable: undefined, available: undefined, loadingAvail: false })
      return
    }
    try {
      updateLine(idx, { loadingAvail: true })
      const res = await api.get(`/inventory/stock/${itemId}/${wid}`)
      const data = ('data' in (res as any)) ? (res as any).data : res
      const base = Number(data?.qtyBase ?? 0)
      const it = getItem(itemId)
      const baseUnit = (it?.baseUnit as Uom) || 'UN'
      const toUom: Uom = (ln.uom ?? it?.displayUnit ?? baseUnit) as Uom

      const reservedOthersBase = reservedInOtherLinesBase(itemId, wid, idx)
      const adjBase = Math.max(0, base - reservedOthersBase)

      let shown: number | undefined
      try {
        shown = convertFromBase(adjBase, baseUnit, toUom)
      } catch {
        shown = undefined
      }

      setLines(prev => prev.map((l, i) => i === idx
        ? {
            ...l,
            baseAvailable: base,
            available: shown,
            ...(forceQtyToAvail && typeof shown === 'number'
              ? { qty: shown, lineTotal: r2(shown * Number(l.unitPrice || 0)) }
              : {}),
          }
        : l
      ))

      if (!forceQtyToAvail) {
        setTimeout(() => recomputeAvailabilityForGroup(itemId, wid), 0)
      }
    } catch {
      updateLine(idx, { baseAvailable: undefined, available: undefined })
    } finally {
      updateLine(idx, { loadingAvail: false })
    }
  }

  function addLine() {
    setLines(prev => [
      ...prev,
      { itemId: undefined, warehouseId: Number(defaultWarehouseId || 0) || undefined, qty: 1, unitPrice: 0, lineTotal: 0, discountPct: 0, vatPct: 0, uom: 'UN', priceIncludesTax }
    ])
  }
  function removeLine(idx: number) {
    setLines(prev => {
      const removed = prev[idx]
      const next = prev.filter((_, i) => i !== idx)
      setTimeout(() => {
        const itemId = removed?.itemId
        const wid = effectiveWarehouseId(removed)
        if (itemId && wid && !isService(removed)) {
          recomputeAvailabilityForGroup(itemId, wid)
        }
      }, 0)
      return next
    })
  }
  function updateLine(idx: number, patch: Partial<Line>) {
    setLines(prev => prev.map((ln, i) => i === idx ? { ...ln, ...patch } : ln))
  }

  // Si cambia la preferencia global de IVA incluido, propagar a todas las líneas existentes.
  useEffect(() => {
    setLines(prev => prev.map((ln) => ({ ...ln, priceIncludesTax })))
  }, [priceIncludesTax])

  // Si cambia la bodega por defecto, refrescar disponibilidad (sin forzar qty)
  useEffect(() => {
    (async () => {
      const wh = Number(defaultWarehouseId || 0)
      if (!wh) {
        setLines(prev => prev.map(l => ({
          ...l,
          warehouseId: isService(l) ? undefined : (l.warehouseId ?? undefined),
          baseAvailable: undefined,
          available: undefined,
          loadingAvail: false
        })))
        return
      }
      setLines(prev => prev.map(l => ({ ...l, warehouseId: isService(l) ? undefined : (l.warehouseId ?? wh) })))
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i]
        if (ln?.itemId && !isService(ln)) await refreshAvailabilityForLine(i, ln.itemId, false, wh)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultWarehouseId])

  // ======= Totales =======
  const totals = useMemo(() => {
    let subtotal = 0
    let discount = 0
    let vat = 0
    let totalLines = 0

    for (const ln of lines) {
      const qty = Math.max(0, Number(ln.qty) || 0)
      const unit = Math.max(0, Number(ln.unitPrice) || 0)
      if (!Number.isFinite(qty) || !Number.isFinite(unit)) continue

      const gross = r2(qty * unit)
      const discPctRaw = Number(ln.discountPct)
      const discPct = Number.isFinite(discPctRaw) ? Math.min(100, Math.max(0, discPctRaw)) : 0
      const vatPctRaw = Number(ln.vatPct)
      const vatPct = Number.isFinite(vatPctRaw) ? Math.max(0, vatPctRaw) : 0
      const includesVat = (ln.priceIncludesTax ?? priceIncludesTax) === true

      const divisor = includesVat && vatPct > 0 ? 1 + vatPct / 100 : 1
      const baseBeforeDiscount = divisor > 0 ? r2(gross / divisor) : gross
      const lineDiscount = r2(baseBeforeDiscount * (discPct / 100))
      const baseAfterDiscount = r2(baseBeforeDiscount - lineDiscount)
      const lineVat = r2(baseAfterDiscount * (vatPct / 100))
      const lineTotal = r2(baseAfterDiscount + lineVat)

      subtotal += baseBeforeDiscount
      discount += lineDiscount
      vat += lineVat
      totalLines += lineTotal
    }

    subtotal = r2(subtotal)
    discount = r2(discount)
    vat = r2(vat)
    let total = r2(totalLines)

    if (paymentType === 'CREDIT' && creditMarkupPct !== '') {
      const pct = Number(creditMarkupPct)
      if (!Number.isNaN(pct) && pct > 0) total = r2(total * (1 + pct / 100))
    }

    const dp = paymentType === 'CREDIT' && downPayment !== '' ? Math.max(0, Number(downPayment) || 0) : 0
    const toFinance = Math.max(0, total - dp)
    return { subtotal, discount, vat, total, downPayment: r2(dp), toFinance: r2(toFinance) }
  }, [lines, paymentType, creditMarkupPct, downPayment, priceIncludesTax])

  const sumPayments = (arr: PaymentRow[]) => arr.reduce((a, p) => a + (Number(p.amount) || 0), 0)

  // ======= Prev Month flag =======
  const isPrevMonth = useMemo(() => {
    if (!date) return false
    const d = new Date(date)
    const now = new Date()
    const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    return d < firstThisMonth
  }, [date])

  // ======= Pagos: helpers =======
  function addPayment() {
    setPayments(prev => [...prev, { methodId: undefined, methodName: '', amount: 0, note: '', autoSync: false }])
  }
  function removePayment(idx: number) { setPayments(prev => prev.filter((_, i) => i !== idx)) }
  function updatePayment(idx: number, patch: Partial<PaymentRow>) {
    setPayments(prev => prev.map((p, i) => {
      if (i !== idx) return p
      const next: PaymentRow = { ...p, ...patch }
      if (Object.prototype.hasOwnProperty.call(patch, 'amount')) {
        next.autoSync = false
      }
      return next
    }))
  }

  // En CRÉDITO forzar 1 pago = cuota inicial
  useEffect(() => {
    if (paymentType === 'CREDIT') {
      setPayments(prev => {
        const base = prev[0] ?? { methodId: undefined, methodName: '', amount: 0, note: '', autoSync: false }
        return [{ ...base, amount: Number(downPayment || 0), autoSync: false }]
      })
    }
  }, [paymentType, downPayment])

  // ✅ Por defecto seleccionar EFECTIVO (o el primero activo) en CONTADO, si no hay pagos aún
  useEffect(() => {
    if (paymentType !== 'CASH') return
    if (payments.length > 0) return
    if (!paymentMethods.length) return

    const efectivo = paymentMethods.find(pm => /efectivo/i.test(pm.name))
    const def = efectivo ?? paymentMethods[0]
    if (def) {
      setPayments([{ methodId: def.id, methodName: def.name, amount: totals.total, note: '', autoSync: true }])
    }
  }, [paymentMethods, paymentType, totals.total, payments.length])

  const prevCashTotalRef = useRef<number>(totals.total)
  useEffect(() => {
    if (paymentType !== 'CASH') {
      prevCashTotalRef.current = totals.total
      return
    }
    if (payments.length !== 1) {
      prevCashTotalRef.current = totals.total
      return
    }

    const [only] = payments
    const prevTotal = prevCashTotalRef.current
    const currentAmount = Number(only.amount || 0)
    const wasAutoSynced = only.autoSync || eqCents(currentAmount, prevTotal) || eqCents(currentAmount, 0)
    const needsUpdate = !eqCents(currentAmount, totals.total)

    if (wasAutoSynced && needsUpdate) {
      setPayments([{ ...only, amount: totals.total, autoSync: true }])
    }

    prevCashTotalRef.current = totals.total
  }, [paymentType, payments, totals.total])

  // ======= Submit =======
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setWarn(null)

    if (isPrevMonth && !ackPrevMonth) {
      setError(`Confirma: ¿Estás seguro que quieres emitir la factura para ${monthLabelLocal(date)} que ya tuvo cierre de contabilidad? Marca la casilla roja debajo.`)
      return
    }

    // Bloquea envío si hay errores de UOM
    if (lines.some(l => !!l.uomError)) {
      setError('Corrige las unidades incompatibles marcadas en rojo antes de continuar.')
      return
    }

    setSaving(true)
    try {
      const partyId = await ensurePartyForInvoice()
      const activeLines = lines.filter(ln => ln.itemId)
      if (!activeLines.length) throw new Error('Agrega al menos una línea con ítem')

      const anyProduct = activeLines.some(ln => (getItem(ln.itemId)?.type || 'PRODUCT') === 'PRODUCT')
      const anyService = activeLines.some(ln => (getItem(ln.itemId)?.type || 'PRODUCT') === 'SERVICE')

      if (anyProduct && anyService) {
        throw new Error('Por ahora no se pueden mezclar productos y servicios en la misma factura.')
      }

      // Validaciones mínimas
      for (const ln of activeLines) {
        const it = getItem(ln.itemId)
        const isServ = (it?.type || 'PRODUCT') === 'SERVICE'
        const wid = effectiveWarehouseId(ln)
        if (!isServ && !wid) {
          throw new Error('Selecciona la bodega (línea) o define una bodega por defecto')
        }
      }

      // Validaciones de pagos
      if (paymentType === 'CASH') {
        if (payments.length === 0) throw new Error('En contado debes registrar al menos un pago (pueden ser varios métodos).')
        if (payments.some(p => !p.methodId)) throw new Error('Selecciona un método de pago en cada renglón.')
        if (!eqCents(sumPayments(payments), totals.total)) {
          throw new Error(`La suma de pagos (${money(sumPayments(payments))}) debe ser igual al total (${money(totals.total)}).`)
        }
      } else { // CREDIT
        if (!installments || installments < 1) throw new Error('Indica cuántas cuotas tendrá después de la cuota inicial')
        if (!firstDueDate) throw new Error('Indica desde cuándo empiezan las cuotas posteriores')
        if (creditMarkupPct !== '' && Number(creditMarkupPct) < 0) throw new Error('El incremento por crédito no puede ser negativo')
        if (downPayment !== '' && Number(downPayment) < 0) throw new Error('La cuota inicial no puede ser negativa')
        if (totals.downPayment > totals.total) throw new Error('La cuota inicial no puede exceder el total de la factura')
        if ((totals.downPayment ?? 0) > 0) {
          if (payments.length === 0) throw new Error('Debes registrar el pago de la cuota inicial (mismo valor).')
          if (payments.some(p => !p.methodId)) throw new Error('Selecciona el método para la cuota inicial.')
          if (!eqCents(sumPayments(payments), totals.downPayment)) throw new Error('El pago debe ser exactamente igual al valor de la cuota inicial.')
        }
      }

      const prepared = activeLines.map(ln => ({
        itemId: Number(ln.itemId),
        ...((getItem(ln.itemId!)?.type || 'PRODUCT') === 'PRODUCT'
          ? { warehouseId: Number(effectiveWarehouseId(ln)) }
          : {}),
        qty: Number(ln.qty),
        uom: (ln.uom ?? (getItem(ln.itemId!)?.displayUnit as Uom) ?? 'UN') as Uom,
        unitPrice: Number(ln.unitPrice),
        discountPct: (ln.discountPct ?? 0) || 0,
        vatPct: ln.vatPct !== undefined && ln.vatPct !== null ? Number(ln.vatPct) : undefined,
        priceIncludesTax: (ln.priceIncludesTax ?? priceIncludesTax) ?? false,
      }))

      const payloadBase: any = {
        issueDate: date,
        paymentType,
        creditMarkupPct: paymentType === 'CREDIT'
          ? (creditMarkupPct === '' ? undefined : Number(creditMarkupPct))
          : undefined,
        dueDate: dueDate || undefined,
        note: note || undefined,
        thirdPartyId: Number(partyId),
        lines: prepared,
      }

      if (paymentType === 'CREDIT') {
        payloadBase.creditPlan = {
          frequency,
          installments: Number(installments),
          firstDueDate: firstDueDate || undefined,
          downPaymentAmount: downPayment === '' ? 0 : Number(downPayment),
        }
      }

      // ⬇️ Enviamos methodId (no strings)
      const paymentsPayload = payments.map(p => ({
        thirdPartyId: Number(partyId),
        methodId: p.methodId!,
        amount: Number(p.amount || 0),
        note: p.note?.trim() || undefined
      })).filter(p => p.amount > 0 && p.methodId)

      const wantsSplit = paymentsPayload.length > 0
      const anyServiceOnly = anyService && !anyProduct
      let endpoint = anyServiceOnly ? '/sales' : '/sales/with-stock'
      let body: any = { ...payloadBase }

      if (endpoint === '/sales/with-stock') {
        body.allowNegative = true
      }

      if (wantsSplit) {
        try {
          const res = await api.post('/sales/with-payments', { ...body, payments: paymentsPayload })
          const createdId = (res as any)?.data?.id ?? (res as any)?.id
          router.push(createdId ? `/sales/${createdId}` : '/sales')
          return
        } catch (err: any) {
          const status = err?.response?.status
          if (status === 404 || status === 405) {
            setWarn('El backend actual no expone /sales/with-payments: la factura se creó sin registrar los pagos. Regístralos manualmente en Tesorería cuando puedas.')
          } else {
            throw err
          }
        }
      }

      const res = await api.post(endpoint, body)
      const createdId = (res as any)?.data?.id ?? (res as any)?.id
      router.push(createdId ? `/sales/${createdId}` : '/sales')
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Error creando la factura')
    } finally {
      setSaving(false)
    }
  }

  async function ensurePartyForInvoice(): Promise<number> {
    if (thirdPartyId) return Number(thirdPartyId)

    if (!doc.trim()) throw new Error('Ingresa el documento del cliente')
    if (!name.trim()) throw new Error('Ingresa el nombre del cliente')

    const payload: any = {
      type: 'CLIENT',
      personKind,
      idType,
      legalRepName: personKind === 'JURIDICAL' && legalRepName.trim() ? legalRepName.trim() : undefined,
      document: doc.trim(),
      name: name.trim(),
      email: email || undefined,
      phone: phone || undefined,
      address: address || undefined,
      city: city || undefined,
      ...(personKind === 'JURIDICAL' && responsibilities.length ? { responsibilities } : {}),
    }

    const created = await api.post('/parties', payload)
    const id = (created as any).data?.id ?? (created as any)?.id
    if (!id) throw new Error('No se pudo crear el cliente')

    setThirdPartyId(id)
    try {
      const refreshed = await api.get('/parties')
      setParties(normalizeArray(refreshed))
    } catch {}

    return id
  }

  // API pública del contexto (SIN quickCreatePaymentMethod)
  return {
    // Base data
    itemsArr, partiesArr, warehousesArr,
    items, setItems, parties, setParties, warehouses, setWarehouses,
    defaultWarehouseId, setDefaultWarehouseId,

    // Métodos de pago
    paymentMethods, refetchPaymentMethods,

    // Tercero
    doc, setDoc, partyFound, setPartyFound, thirdPartyId, setThirdPartyId,
    personKind, setPersonKind, idType, setIdType, legalRepName, setLegalRepName,
    responsibilities, setResponsibilities,
    name, setName, email, setEmail, phone, setPhone, address, setAddress, city, setCity,
    documentPlaceholder, searching, lookupByDocument,

    // Factura general
  date, setDate, paymentType, setPaymentType, dueDate, setDueDate, note, setNote,
  priceIncludesTax, setPriceIncludesTax,
    ackPrevMonth, setAckPrevMonth, isPrevMonth,

    // Crédito
    frequency, setFrequency, installments, setInstallments, firstDueDate, setFirstDueDate,
    creditMarkupPct, setCreditMarkupPct, downPayment, setDownPayment,

    // Pagos
    payments, setPayments, addPayment, removePayment, updatePayment, sumPayments,

    // Líneas
    lines, setLines, addLine, removeLine, updateLine,
    priceHintIdx, setPriceHintIdx, priceRefs,
    getItem, isService, effectiveWarehouseId,
    refreshAvailabilityForLine, recomputeAvailabilityForGroup,
    allowedUomsForItem, familyHumanName, stepForUom, convertUnitPrice, fmtQty,

    // Totales / estado envío
    totals, onSubmit, saving, error, setError, warn, setWarn,

    // Utils expuestos
    monthLabel: monthLabelLocal,
    money,
  }
}

export function InvoiceFormProvider({ children }: { children: React.ReactNode }) {
  const value = useInvoiceFormInternal()
  return <InvoiceFormContext.Provider value={value}>{children}</InvoiceFormContext.Provider>
}

export function useInvoiceForm() {
  const ctx = useContext(InvoiceFormContext)
  if (!ctx) throw new Error('useInvoiceForm must be used within <InvoiceFormProvider>')
  return ctx
}
