// components/EditItemModal.tsx
'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import SearchSelect from '@/components/SearchSelect'
import UnitPicker from '@/components/UnitPicker'
import { api } from '@/lib/api'
import { money } from '@/lib/format'
import { listAccounts, type Account } from '@/lib/accounts'
import { listCategories, type Category } from '@/lib/categories'
import { listLayers } from '@/lib/inventory'
import { listTaxes, type Tax } from '@/lib/taxes'
import { type Uom, labelOf } from '@/lib/uom'

export type EditItemModalProps = {
  itemId?: number
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
  warehouseId?: number
  allowPrices?: boolean
}

type TaxProfile = 'NA' | 'IVA_RESPONSABLE' | 'EXENTO' | 'EXCLUIDO'

type ItemDTO = {
  id: number
  sku?: string
  name: string
  type: 'PRODUCT' | 'SERVICE'
  displayUnit: Uom
  price?: number | null
  priceMin?: number | null
  priceMid?: number | null
  priceMax?: number | null
  ivaPct?: number | null
  categoryId?: number | null
  active: boolean
  taxProfile: TaxProfile
  defaultTaxId?: number | null
  incomeAccountCode?: string | null
  expenseAccountCode?: string | null
  inventoryAccountCode?: string | null
  taxAccountCode?: string | null
  purchaseTaxAccountCode?: string | null
  defaultDiscountPct?: number | null
}

async function fetchItem(itemId: number): Promise<ItemDTO | null> {
  const { data } = await api.get(`/items/${itemId}`)
  const raw = (data?.item ?? data) as any
  if (!raw?.id) return null

  return {
    id: Number(raw.id),
    sku: raw.sku ?? '',
    name: raw.name ?? '',
    type: (raw.type as 'PRODUCT' | 'SERVICE') ?? 'PRODUCT',
    displayUnit: (raw.displayUnit as Uom) ?? (raw.baseUnit as Uom) ?? 'UN',
    price: raw.price != null ? Number(raw.price) : null,
    priceMin: raw.priceMin != null ? Number(raw.priceMin) : null,
    priceMid: raw.priceMid != null ? Number(raw.priceMid) : null,
    priceMax: raw.priceMax != null ? Number(raw.priceMax) : null,
    ivaPct: raw.ivaPct != null ? Number(raw.ivaPct) : null,
    categoryId: raw.categoryId != null ? Number(raw.categoryId) : null,
    active: raw.active !== false,
    taxProfile: (raw.taxProfile as TaxProfile) ?? 'IVA_RESPONSABLE',
    defaultTaxId: raw.defaultTaxId != null ? Number(raw.defaultTaxId) : null,
    incomeAccountCode: raw.incomeAccountCode ?? null,
    expenseAccountCode: raw.expenseAccountCode ?? null,
    inventoryAccountCode: raw.inventoryAccountCode ?? null,
    taxAccountCode: raw.taxAccountCode ?? null,
    purchaseTaxAccountCode: raw.purchaseTaxAccountCode ?? null,
    defaultDiscountPct:
      raw.defaultDiscountPct != null ? Number(raw.defaultDiscountPct) : null,
  }
}

const EditItemModal: React.FC<EditItemModalProps> = ({
  itemId,
  isOpen,
  onClose,
  onSaved,
  warehouseId,
  allowPrices = false,
}) => {
  const qc = useQueryClient()

  const itemQ = useQuery<ItemDTO | null>({
    queryKey: ['item:detail', itemId],
    queryFn: () => fetchItem(itemId!),
    enabled: !!itemId && isOpen,
    staleTime: 30_000,
  })

  const categoriesQ = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: listCategories,
    enabled: isOpen,
    staleTime: 5 * 60_000,
  })

  const accountsQ = useQuery<Account[]>({
    queryKey: ['accounts:list'],
    queryFn: ({ signal }) => listAccounts(signal),
    enabled: isOpen,
    staleTime: 5 * 60_000,
  })

  const taxesQ = useQuery<Tax[]>({
    queryKey: ['taxes:list'],
    queryFn: ({ signal }) => listTaxes(undefined, signal),
    enabled: isOpen,
    staleTime: 5 * 60_000,
  })

  const costQ = useQuery({
    queryKey: ['stock:avg-cost', itemId, warehouseId],
    enabled: !!itemId && !!warehouseId && isOpen,
    queryFn: async () => {
      if (!itemId || !warehouseId) return null
      const layers = await listLayers(itemId, warehouseId)
      if (!Array.isArray(layers) || layers.length === 0) return null
      const totals = layers.reduce(
        (acc, layer: any) => {
          const qty = Number(layer.remainingQtyDisplay ?? layer.remainingQtyBase ?? 0)
          const unitCost = Number(layer.unitCost ?? 0)
          return { qty: acc.qty + qty, value: acc.value + qty * unitCost }
        },
        { qty: 0, value: 0 },
      )
      if (totals.qty <= 0) return null
      return totals.value / totals.qty
    },
    staleTime: 30_000,
  })

  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<'PRODUCT' | 'SERVICE'>('PRODUCT')
  const [displayUnit, setDisplayUnit] = useState<Uom>('UN')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [lastCategoryApplied, setLastCategoryApplied] = useState<number | null>(null)
  const [shouldApplyCategoryDefaults, setShouldApplyCategoryDefaults] = useState(false)
  const [active, setActive] = useState(true)

  const [price, setPrice] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMid, setPriceMid] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [defaultDiscountPct, setDefaultDiscountPct] = useState('')

  const [taxProfile, setTaxProfile] = useState<TaxProfile>('IVA_RESPONSABLE')
  const [defaultTaxId, setDefaultTaxId] = useState<number | ''>('')
  const [incomeAccountCode, setIncomeAccountCode] = useState('')
  const [expenseAccountCode, setExpenseAccountCode] = useState('')
  const [inventoryAccountCode, setInventoryAccountCode] = useState('')
  const [taxAccountCode, setTaxAccountCode] = useState('')
  const [purchaseTaxAccountCode, setPurchaseTaxAccountCode] = useState('')

  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && itemQ.data) {
      const item = itemQ.data
      setSku(item.sku ?? '')
      setName(item.name ?? '')
      setType(item.type ?? 'PRODUCT')
      setDisplayUnit((item.displayUnit as Uom) ?? 'UN')
  setCategoryId(item.categoryId ?? '')
  // if the item does not have an explicit purchaseTaxAccountCode, allow
  // category defaults to apply so the picker shows the preselected account
  const hasPurch = (item as any).purchaseTaxAccountCode
  setLastCategoryApplied(hasPurch ? item.categoryId ?? null : null)
  setShouldApplyCategoryDefaults(!hasPurch && !!item.categoryId)
      setActive(!!item.active)

      setPrice(item.price != null ? String(item.price) : '')
      setPriceMin(item.priceMin != null ? String(item.priceMin) : '')
      setPriceMid(item.priceMid != null ? String(item.priceMid) : '')
      setPriceMax(item.priceMax != null ? String(item.priceMax) : '')
      setDefaultDiscountPct(
        item.defaultDiscountPct != null ? String(item.defaultDiscountPct) : '',
      )

      setTaxProfile(item.taxProfile ?? 'IVA_RESPONSABLE')
      setDefaultTaxId(item.defaultTaxId != null ? Number(item.defaultTaxId) : '')
      setIncomeAccountCode(item.incomeAccountCode ?? '')
      setExpenseAccountCode(item.expenseAccountCode ?? '')
      setInventoryAccountCode(item.inventoryAccountCode ?? '')
      setTaxAccountCode(item.taxAccountCode ?? '')
    // if item doesn't have purchaseTaxAccountCode, leave empty for now;
    // will apply category defaults below (or fallback to '240801')
    setPurchaseTaxAccountCode((item as any).purchaseTaxAccountCode ?? '')
    }

    if (!isOpen) {
      setErrorMsg(null)
      setShouldApplyCategoryDefaults(false)
      setLastCategoryApplied(null)
    }
  }, [isOpen, itemQ.data])

  useEffect(() => {
    if (!isOpen || !shouldApplyCategoryDefaults) return

    if (categoryId === '' || typeof categoryId !== 'number') {
      setTaxProfile('IVA_RESPONSABLE')
      setDefaultTaxId('')
      setTaxAccountCode('')
      setIncomeAccountCode('')
      setExpenseAccountCode('')
      setInventoryAccountCode('')
      setLastCategoryApplied(null)
      setShouldApplyCategoryDefaults(false)
      return
    }

    if (lastCategoryApplied === categoryId) {
      setShouldApplyCategoryDefaults(false)
      return
    }

    const category = categoriesQ.data?.find((c) => c.id === categoryId)
    if (!category) {
      setShouldApplyCategoryDefaults(false)
      return
    }

    const catProfile = (category.taxProfile as TaxProfile | undefined) ?? 'IVA_RESPONSABLE'
    setTaxProfile(catProfile)
    if (catProfile === 'IVA_RESPONSABLE') {
      setDefaultTaxId(category.defaultTaxId != null ? Number(category.defaultTaxId) : '')
      setTaxAccountCode(category.taxAccountCode ?? '')
  // fallback to 240801 when category has no explicit purchaseTaxAccountCode
  setPurchaseTaxAccountCode((category as any).purchaseTaxAccountCode ?? '240801')
    } else {
      setDefaultTaxId('')
      setTaxAccountCode('')
      setPurchaseTaxAccountCode('')
    }
    setIncomeAccountCode(category.incomeAccountCode ?? '')
    setExpenseAccountCode(category.expenseAccountCode ?? '')
    setInventoryAccountCode(category.inventoryAccountCode ?? '')
    setLastCategoryApplied(categoryId)
    setShouldApplyCategoryDefaults(false)
  }, [categoryId, categoriesQ.data, isOpen, lastCategoryApplied, shouldApplyCategoryDefaults])

  useEffect(() => {
    if (type === 'SERVICE') {
      setInventoryAccountCode('')
    }
  }, [type])

  useEffect(() => {
    if (taxProfile !== 'IVA_RESPONSABLE') {
      setDefaultTaxId('')
      setTaxAccountCode('')
      setPurchaseTaxAccountCode('')
    }
  }, [taxProfile])

  const selectableAccounts = useMemo(
    () => (accountsQ.data ?? []).filter((acc) => acc.isActive !== false && acc.isDetailed !== false),
    [accountsQ.data],
  )

  const buildAccountOptions = useCallback(
    (filter: (acc: Account) => boolean) => [
      { value: '', label: '— sin cuenta —' },
      ...selectableAccounts.filter(filter).map((acc) => ({
        value: acc.code,
        label: `${acc.code} · ${acc.name}`,
        sublabel: acc.class,
      })),
    ],
    [selectableAccounts],
  )

  const incomeAccountOptions = useMemo(
    () => buildAccountOptions((acc) => acc.class === 'INCOME'),
    [buildAccountOptions],
  )
  const expenseAccountOptions = useMemo(
    () => buildAccountOptions((acc) => acc.class === 'EXPENSE'),
    [buildAccountOptions],
  )
  const inventoryAccountOptions = useMemo(
    () => buildAccountOptions((acc) => acc.class === 'ASSET'),
    [buildAccountOptions],
  )
  const taxAccountOptions = useMemo(
    () => buildAccountOptions((acc) => acc.taxProfile !== 'NA' || /IVA/i.test(acc.name)),
    [buildAccountOptions],
  )

  const taxOptions = useMemo(() => {
    const base = taxesQ.data ?? []
    return [
      { value: '', label: '— sin impuesto —' },
      ...base.map((tax) => ({
        value: tax.id,
        label: `${tax.code} · ${tax.name}`,
        sublabel: `${tax.ratePct}%`,
      })),
    ]
  }, [taxesQ.data])

  const saveItemMut = useMutation({
    mutationFn: async () => {
      if (!itemId) return
      if (!name.trim()) throw new Error('El nombre es obligatorio')

      const body: Record<string, unknown> = {
        sku: sku || null,
        name: name || '',
        type,
        displayUnit,
        categoryId: categoryId === '' ? null : Number(categoryId),
        active,
        price: price === '' ? null : Number(price),
        priceMin: priceMin === '' ? null : Number(priceMin),
        priceMid: priceMid === '' ? null : Number(priceMid),
        priceMax: priceMax === '' ? null : Number(priceMax),
        ivaPct: null,
        defaultDiscountPct:
          defaultDiscountPct === '' ? undefined : Number(defaultDiscountPct),
        taxProfile,
        defaultTaxId: defaultTaxId === '' ? null : Number(defaultTaxId),
        incomeAccountCode: incomeAccountCode || null,
        expenseAccountCode: expenseAccountCode || null,
        inventoryAccountCode: inventoryAccountCode || null,
        taxAccountCode: taxProfile === 'IVA_RESPONSABLE' ? taxAccountCode || null : null,
        purchaseTaxAccountCode: taxProfile === 'IVA_RESPONSABLE' ? purchaseTaxAccountCode || null : null,
      }

      if (!allowPrices) {
        delete body.price
        delete body.priceMin
        delete body.priceMid
        delete body.priceMax
        delete body.defaultDiscountPct
      }

      if (taxProfile !== 'IVA_RESPONSABLE') {
        body.taxAccountCode = null
        body.purchaseTaxAccountCode = null
        body.defaultTaxId = null
      }

      if (type === 'SERVICE') {
        body.inventoryAccountCode = null
      }

      await api.put(`/items/${itemId}`, body)
    },
  })

  const saving = saveItemMut.isPending

  const handleSave = async () => {
    setErrorMsg(null)
    try {
      await saveItemMut.mutateAsync()
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['item:detail', itemId] })
      qc.invalidateQueries({
        predicate: (query) => {
          const [key] = query.queryKey as [string?, ...unknown[]]
          return (
            key === 'items:search' ||
            key === 'stock:cell' ||
            key === 'cost:cell' ||
            key === 'moves' ||
            key === 'layers' ||
            key === 'kardex'
          )
        },
      })
      onSaved?.()
    } catch (error: any) {
      const message = error?.response?.data?.message ?? error?.message ?? 'No se pudo guardar'
      setErrorMsg(Array.isArray(message) ? message.join(', ') : String(message))
    }
  }

  if (!isOpen) return null

  const isService = type === 'SERVICE'
  const categories = categoriesQ.data ?? []
  const selectedCategory =
    typeof categoryId === 'number'
      ? categories.find((cat) => cat.id === categoryId)
      : undefined

  return (
    <div className="modal-backdrop">
      <div className="modal card w-full max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            Editar ítem {itemQ.data ? `· ${itemQ.data.sku ? `${itemQ.data.sku} · ` : ''}${itemQ.data.name}` : ''}
          </h3>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div className="text-sm text-gray-600">
          {warehouseId ? (
            <>
              Bodega: <span className="font-medium">#{warehouseId}</span>
              {' · '}Costo promedio:{' '}
              {isService
                ? 'N/A (servicio)'
                : costQ.isFetching
                  ? '…'
                  : costQ.data
                    ? money(costQ.data)
                    : '—'}
            </>
          ) : (
            <span>{isService ? 'Servicio (no maneja stock).' : 'Sin bodega seleccionada.'}</span>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="label">SKU</label>
            <input className="input" value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="label">Nombre</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <label className="label">Tipo</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as 'PRODUCT' | 'SERVICE')}>
              <option value="PRODUCT">Producto</option>
              <option value="SERVICE">Servicio</option>
            </select>
          </div>

          <div>
            <label className="label">Unidad visible</label>
            <UnitPicker
              value={displayUnit}
              onChange={(unit) => setDisplayUnit(unit ?? displayUnit)}
              placeholder="Buscar unidad..."
              label={labelOf(displayUnit)}
            />
          </div>

          <div>
            <label className="label">Categoría</label>
            <select
              className="input"
              value={categoryId}
              onChange={(event) => {
                const value = event.target.value
                setCategoryId(value ? Number(value) : '')
                setShouldApplyCategoryDefaults(true)
              }}
            >
              <option value="">— sin categoría —</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {selectedCategory && (
              <p className="mt-1 text-xs text-gray-500">
                Hereda perfil {selectedCategory.taxProfile} y cuentas predefinidas.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 h-10 md:col-span-3">
            <input
              id="active"
              type="checkbox"
              className="toggle toggle-primary"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <label htmlFor="active" className="cursor-pointer text-sm">
              {active ? 'Activo' : 'Inactivo'}
            </label>
          </div>
        </div>

        <div className="rounded-xl border p-3">
          <div className="grid md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="label">Precio de venta</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={!allowPrices}
              />
            </div>
            <div>
              <label className="label">Precio min</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                disabled={!allowPrices}
              />
            </div>
            <div>
              <label className="label">Precio med</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={priceMid}
                onChange={(e) => setPriceMid(e.target.value)}
                disabled={!allowPrices}
              />
            </div>
            <div>
              <label className="label">Precio max</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                disabled={!allowPrices}
              />
            </div>
            <div>
              <label className="label">Descuento predeterminado %</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={defaultDiscountPct}
                onChange={(e) => setDefaultDiscountPct(e.target.value)}
                disabled={!allowPrices}
              />
            </div>
          </div>
          {!allowPrices && (
            <p className="text-xs text-gray-500 mt-2">
              Los precios están bloqueados en esta vista.
            </p>
          )}
        </div>

        <div className="rounded-xl border p-3 space-y-4">
          <div className="grid md:grid-cols-4 gap-3">
            <div>
              <label className="label">Perfil fiscal</label>
              <select
                className="input"
                value={taxProfile}
                onChange={(e) => setTaxProfile(e.target.value as TaxProfile)}
              >
                <option value="IVA_RESPONSABLE">Responsable de IVA</option>
                <option value="EXENTO">Exento</option>
                <option value="EXCLUIDO">Excluido</option>
                <option value="NA">Sin IVA / NA</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Impuesto predeterminado</label>
              <SearchSelect
                value={defaultTaxId === '' ? '' : Number(defaultTaxId)}
                options={taxOptions}
                onSelect={(option) => {
                  if (!option || option.value === '') {
                    setDefaultTaxId('')
                  } else {
                    setDefaultTaxId(Number(option.value))
                  }
                }}
                placeholder="Buscar impuesto..."
                disabled={taxProfile !== 'IVA_RESPONSABLE'}
              />
            </div>
            <div>
              <label className="label">IVA ventas (PUC)</label>
              <SearchSelect
                value={taxAccountCode}
                options={taxAccountOptions}
                onSelect={(option) => setTaxAccountCode(option ? String(option.value) : '')}
                placeholder="Cuenta de IVA"
                disabled={taxProfile !== 'IVA_RESPONSABLE'}
              />
            </div>
            <div>
              <label className="label">IVA compras (PUC)</label>
              <SearchSelect
                value={purchaseTaxAccountCode}
                options={taxAccountOptions}
                onSelect={(option) => setPurchaseTaxAccountCode(option ? String(option.value) : '')}
                placeholder="Cuenta IVA compras"
                disabled={taxProfile !== 'IVA_RESPONSABLE'}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="label">Ingresos (PUC)</label>
              <SearchSelect
                value={incomeAccountCode}
                options={incomeAccountOptions}
                onSelect={(option) => setIncomeAccountCode(option ? String(option.value) : '')}
                placeholder="Cuenta de ingresos"
              />
            </div>
            <div>
              <label className="label">Costo / Compras (PUC)</label>
              <SearchSelect
                value={expenseAccountCode}
                options={expenseAccountOptions}
                onSelect={(option) => setExpenseAccountCode(option ? String(option.value) : '')}
                placeholder="Cuenta de costo"
              />
            </div>
            <div>
              <label className="label">Inventario (PUC)</label>
              <SearchSelect
                value={inventoryAccountCode}
                options={inventoryAccountOptions}
                onSelect={(option) => setInventoryAccountCode(option ? String(option.value) : '')}
                placeholder="Cuenta de inventario"
                disabled={isService}
              />
            </div>
          </div>

          {(accountsQ.isLoading || taxesQ.isLoading) && (
            <p className="text-xs text-gray-500">Cargando catálogos contables…</p>
          )}
        </div>

        <div className="rounded-xl border border-dashed p-3 text-sm text-gray-600">
          Los ajustes manuales de inventario se gestionan desde la pestaña
          <strong> Ajuste inventario</strong>.
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      <style jsx>{`
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          z-index: 50;
        }
      `}</style>
    </div>
  )
}

export default EditItemModal
