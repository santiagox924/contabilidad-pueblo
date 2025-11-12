// components/QuickNewItemModal.tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createItem } from '@/lib/inventory'
import { money } from '@/lib/format'
import UnitPicker from '@/components/UnitPicker'
import SearchSelect from '@/components/SearchSelect'
import {
  type Uom,
  type UomFamily,
  labelOf,
  familyOf,
} from '@/lib/uom'
import { listCategories, type TaxProfile } from '@/lib/categories'
import { listTaxes } from '@/lib/taxes'
import { listAccounts, type Account } from '@/lib/accounts'

/** Mapea UomFamily → UnitKind del backend (mismos literales) */
function unitKindFromUom(u: Uom): 'COUNT' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA' {
  return familyOf(u)
}

function taxProfileLabel(value?: TaxProfile | null): string {
  switch (value) {
    case 'IVA_RESPONSABLE':
      return 'IVA responsable'
    case 'EXENTO':
      return 'Exento'
    case 'EXCLUIDO':
      return 'Excluido'
    case 'NA':
      return 'Sin perfil fiscal'
    default:
      return 'Sin dato'
  }
}

export default function QuickNewItemModal({
  isOpen,
  onClose,
  warehouseId: _warehouseId,
  onCreated,
}: {
  isOpen: boolean
  onClose: () => void
  warehouseId?: number
  onCreated: () => void
}) {
  const qc = useQueryClient()
  void _warehouseId
  const [sku, setSku] = useState<string>('')
  const [name, setName] = useState<string>('')
  const [displayUnit, setDisplayUnit] = useState<Uom>('UN')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [taxProfile, setTaxProfile] = useState<TaxProfile>('IVA_RESPONSABLE')
  const [defaultTaxId, setDefaultTaxId] = useState<number | null>(null)
  const [incomeAccountCode, setIncomeAccountCode] = useState<string | null>(null)
  const [expenseAccountCode, setExpenseAccountCode] = useState<string | null>(null)
  const [inventoryAccountCode, setInventoryAccountCode] = useState<string | null>(null)
  const [taxAccountCode, setTaxAccountCode] = useState<string | null>(null)
  // Default to 240801 for IVA purchase VAT unless category overrides
  const [purchaseTaxAccountCode, setPurchaseTaxAccountCode] = useState<string | null>('240801')
  const [showFiscalConfig, setShowFiscalConfig] = useState<boolean>(false)
  const [openPicker, setOpenPicker] = useState<'tax' | 'income' | 'expense' | 'inventory' | 'purchaseTax' | null>(null)

  // Bandas de precios
  const [priceMin, setPriceMin] = useState<string>('')
  const [priceMid, setPriceMid] = useState<string>('')
  const [priceMax, setPriceMax] = useState<string>('')

  const categoriesQ = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
    enabled: isOpen,
    staleTime: 5 * 60_000,
  })

  const categories = categoriesQ.data ?? []
  const selectedCategory = typeof categoryId === 'number' ? categories.find((c) => c.id === categoryId) : undefined

  const taxesQ = useQuery({
    queryKey: ['taxes', 'VAT', 'active'],
    queryFn: () => listTaxes({ kind: 'VAT', active: true }),
    enabled: isOpen && showFiscalConfig,
    staleTime: 5 * 60_000,
  })
  const taxes = taxesQ.data ?? []

  const accountsQ = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: () => listAccounts(),
    enabled: isOpen && showFiscalConfig,
    staleTime: 5 * 60_000,
  })
  const accounts = accountsQ.data ?? []

  const selectableAccounts = useMemo(
    () => accounts.filter((acc) => acc.isDetailed !== false && acc.isActive !== false),
    [accounts],
  )

  const toOption = (acc: Account) => ({
    value: acc.code,
    // Show friendly name for purchase VAT (240801) instead of internal key like 'purchaseVat'
    label: `${acc.code} · ${acc.code === '240801' || acc.name === 'purchaseVat' ? 'IVA descontable (Compras)' : acc.name}`,
    sublabel: acc.class,
  })

  const withEmptyOption = (entries: Array<{ value: string; label: string; sublabel?: string }>) => [
    { value: '', label: '— sin cuenta —' },
    ...entries,
  ]

  const buildAccountOptions = useCallback(
    (predicate: (acc: Account) => boolean) => {
      const filtered = selectableAccounts.filter(predicate)
      return withEmptyOption(filtered.map(toOption))
    },
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

  const accountOptionsById = useMemo(
    () => ({
      income: incomeAccountOptions,
      expense: expenseAccountOptions,
      inventory: inventoryAccountOptions,
      tax: taxAccountOptions,
      purchaseTax: taxAccountOptions,
    }),
    [expenseAccountOptions, incomeAccountOptions, inventoryAccountOptions, taxAccountOptions],
  )

  const accountsByCode = useMemo(() => {
    const map = new Map<string, { code: string; name: string; class: string }>()
    for (const acc of accounts) {
      map.set(acc.code, { code: acc.code, name: acc.name, class: acc.class })
    }
    return map
  }, [accounts])

  const accountLabel = useCallback((code: string | null | undefined) => {
    if (!code) return '— sin cuenta —'
    const info = accountsByCode.get(code)
    if (!info) return code
    // Friendly display for purchase VAT
    const displayName = info.code === '240801' || info.name === 'purchaseVat' ? 'IVA descontable (Compras)' : info.name
    return `${info.code} · ${displayName}`
  }, [accountsByCode])

  const renderAccountPicker = useCallback((params: {
    id: 'tax' | 'income' | 'expense' | 'inventory' | 'purchaseTax'
    label: string
    value: string | null
    setValue: (code: string | null) => void
    placeholder: string
    options: Array<{ value: string; label: string; sublabel?: string }>
    disabled?: boolean
  }) => {
  const { id, label, value, setValue, placeholder, options, disabled } = params
    const isOpen = openPicker === id
    const displayText = value ? accountLabel(value) : '— sin cuenta —'

    if (disabled) {
      return (
        <div>
          <label className="label">{label}</label>
          <div className="input input-bordered w-full rounded-xl bg-gray-100 text-gray-500">
            {accountLabel(value)}
          </div>
        </div>
      )
    }

    return (
      <div>
        <label className="label">{label}</label>
        {isOpen ? (
          <SearchSelect
            value={value ?? ''}
            options={options}
            onSelect={(opt) => {
              if (!opt || opt.value === '') {
                setValue(null)
              } else {
                setValue(String(opt.value))
              }
              setOpenPicker(null)
            }}
            placeholder={placeholder}
            onInputRef={(el) => {
              if (!el) return
              requestAnimationFrame(() => {
                el.focus()
                el.select()
              })
            }}
          />
        ) : (
          <button
            type="button"
            className="input input-bordered w-full rounded-xl text-left hover:border-primary"
            onClick={() => setOpenPicker(id)}
          >
            {displayText}
          </button>
        )}
      </div>
    )
  }, [accountLabel, openPicker])

  useEffect(() => {
    if (!isOpen) return
    if (categoryId === '' || typeof categoryId !== 'number') {
      setTaxProfile('IVA_RESPONSABLE')
      setDefaultTaxId(null)
      setIncomeAccountCode(null)
      setExpenseAccountCode(null)
      setInventoryAccountCode(null)
      setTaxAccountCode(null)
      return
    }
    const cat = categories.find((c) => c.id === categoryId)
    if (!cat) return
    const profile = (cat.taxProfile as TaxProfile | undefined) ?? 'IVA_RESPONSABLE'
    setTaxProfile(profile)
    setDefaultTaxId(profile === 'IVA_RESPONSABLE' ? (cat.defaultTaxId != null ? Number(cat.defaultTaxId) : null) : null)
    setIncomeAccountCode(cat.incomeAccountCode ?? null)
    setExpenseAccountCode(cat.expenseAccountCode ?? null)
    setInventoryAccountCode(cat.inventoryAccountCode ?? null)
    setTaxAccountCode(profile === 'IVA_RESPONSABLE' ? (cat.taxAccountCode ?? null) : null)
    // default purchase VAT account from category if present, otherwise fallback to 240801
    setPurchaseTaxAccountCode(
      profile === 'IVA_RESPONSABLE' ? ((cat as any).purchaseTaxAccountCode ?? '240801') : null,
    )
  }, [categories, categoryId, isOpen])

  useEffect(() => {
    if (!isOpen) setShowFiscalConfig(false)
  }, [isOpen])

  useEffect(() => {
    if (!showFiscalConfig) setOpenPicker(null)
  }, [showFiscalConfig])

  useEffect(() => {
    if (taxProfile !== 'IVA_RESPONSABLE' && openPicker === 'tax') setOpenPicker(null)
  }, [taxProfile, openPicker])


  const toNumber = (v: string) => (v === '' ? undefined : Number(v))
  const nMin = toNumber(priceMin)
  const nMid = toNumber(priceMid)
  const nMax = toNumber(priceMax)

  const bandsOk =
    (nMin === undefined || nMid === undefined || nMid >= nMin) &&
    (nMid === undefined || nMax === undefined || nMax >= nMid) &&
    (nMin === undefined || nMax === undefined || nMax >= nMin)

  const bandsError = bandsOk ? null : 'Las bandas deben cumplir: Mín ≤ Med ≤ Máx.'

  // Política: usamos Máximo como precio general por defecto
  const generalPrice = nMax ?? 0

  const canCreate =
    sku.trim().length > 0 &&
    name.trim().length > 0 &&
    bandsOk

  const createMut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        sku,
        name,
        type: 'PRODUCT',
        // Unidades: el backend normaliza y fija base canónica por unitKind
        unit: displayUnit,          // compat legado (string)
        displayUnit,                // para UI
        unitKind: unitKindFromUom(displayUnit),
        // Precios
  price: Number(generalPrice || 0),
  ivaPct: null,
      }
      if (categoryId !== '') payload.categoryId = Number(categoryId)
      payload.taxProfile = taxProfile
      payload.defaultTaxId = taxProfile === 'IVA_RESPONSABLE' ? defaultTaxId ?? null : null
      payload.incomeAccountCode = incomeAccountCode ?? null
      payload.expenseAccountCode = expenseAccountCode ?? null
      payload.inventoryAccountCode = inventoryAccountCode ?? null
  payload.taxAccountCode = taxProfile === 'IVA_RESPONSABLE' ? taxAccountCode ?? null : null
  payload.purchaseTaxAccountCode = taxProfile === 'IVA_RESPONSABLE' ? purchaseTaxAccountCode ?? null : null
      if (nMin !== undefined) { payload.priceMin = nMin; payload.salePriceMin = nMin }
      if (nMid !== undefined) { payload.priceMid = nMid; payload.salePriceMid = nMid }
      if (nMax !== undefined) { payload.priceMax = nMax; payload.salePriceMax = nMax }

      const item: any = await createItem(payload)
      return Number(item?.id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['items:search'] })
      qc.invalidateQueries({ queryKey: ['layers'] })
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          (q.queryKey[0] === 'stock:cell' || q.queryKey[0] === 'cost:cell'),
      })
      onCreated()
  setSku('')
  setName('')
      setCategoryId('')
      setTaxProfile('IVA_RESPONSABLE')
      setDefaultTaxId(null)
      setIncomeAccountCode(null)
      setExpenseAccountCode(null)
      setInventoryAccountCode(null)
      setTaxAccountCode(null)
      setShowFiscalConfig(false)
      setPriceMin('')
      setPriceMid('')
      setPriceMax('')
      // restore default for next creation
      setPurchaseTaxAccountCode('240801')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Error creando ítem'
      alert(Array.isArray(msg) ? msg.join('\n') : msg)
    },
  })

  const familyHint: UomFamily = useMemo(() => familyOf(displayUnit), [displayUnit])

  if (!isOpen) return null

  return (
    <div className="modal-backdrop">
      <div className="modal card w-full max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Nuevo ítem</h3>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="label">SKU</label>
            <input
              className="input"
              value={sku}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSku(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Nombre</label>
            <input
              className="input"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Categoría (opcional)</label>
            <select
              className="input"
              value={categoryId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">— sin categoría —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {selectedCategory && (
              <p className="text-[11px] text-gray-500 mt-1">
                Perfil {taxProfileLabel(selectedCategory.taxProfile)} · ingresos {selectedCategory.incomeAccountCode ?? '—'} · costo {selectedCategory.expenseAccountCode ?? '—'} · inventario {selectedCategory.inventoryAccountCode ?? '—'}
              </p>
            )}
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={showFiscalConfig}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShowFiscalConfig(e.target.checked)}
              />
              Configurar parámetros fiscales manualmente
            </label>
          </div>

          <div className="md:col-span-3">
            <label className="label">Unidad</label>
            <UnitPicker
              value={displayUnit}
              onChange={(u?: Uom) => setDisplayUnit(u ?? displayUnit)}
              placeholder="Buscar unidad..."
              label={labelOf(displayUnit)}
              maxSuggestions={20}
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Familia detectada: <strong>{familyHint}</strong>
            </p>
          </div>
        </div>

        {showFiscalConfig && (
          <div className="rounded-xl border bg-gray-50 p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-gray-600">
                Ajusta manualmente perfil fiscal, IVA y cuentas contables para este ítem.
              </p>
              {categoriesQ.isFetching && <span className="text-[11px] text-gray-500">Actualizando categorías…</span>}
            </div>

            <div className="grid md:grid-cols-1 gap-3">
              <div>
                <label className="label">Perfil fiscal</label>
                <select
                  className="input"
                  value={taxProfile}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const next = e.target.value as TaxProfile
                    setTaxProfile(next)
                    if (next !== 'IVA_RESPONSABLE') {
                      setDefaultTaxId(null)
                      setTaxAccountCode(null)
                    } else if (selectedCategory) {
                      setDefaultTaxId(selectedCategory.defaultTaxId != null ? Number(selectedCategory.defaultTaxId) : null)
                      setTaxAccountCode(selectedCategory.taxAccountCode ?? null)
                    }
                  }}
                >
                  <option value="IVA_RESPONSABLE">Responsable de IVA</option>
                  <option value="EXENTO">Exento</option>
                  <option value="EXCLUIDO">Excluido</option>
                  <option value="NA">Sin perfil fiscal</option>
                </select>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="label">Impuesto IVA por defecto</label>
                <select
                  className="input"
                  value={defaultTaxId ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDefaultTaxId(e.target.value ? Number(e.target.value) : null)}
                  disabled={taxProfile !== 'IVA_RESPONSABLE'}
                >
                  <option value="">— sin impuesto —</option>
                  {taxes.map((tax) => (
                    <option key={tax.id} value={tax.id}>{`${tax.code} · ${tax.ratePct}%`}</option>
                  ))}
                </select>
                {taxesQ.isFetching && (
                  <p className="text-[11px] text-gray-500 mt-1">Cargando impuestos activos…</p>
                )}
              </div>

              {renderAccountPicker({
              id: 'tax',
              label: 'Cuenta IVA',
              value: taxAccountCode,
              setValue: setTaxAccountCode,
              placeholder: 'Buscar cuenta de IVA',
              options: accountOptionsById.tax,
              disabled: taxProfile !== 'IVA_RESPONSABLE',
              })}
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              {renderAccountPicker({
              id: 'income',
              label: 'Cuenta ingresos',
              value: incomeAccountCode,
              setValue: setIncomeAccountCode,
              placeholder: 'Buscar cuenta de ingresos',
              options: accountOptionsById.income,
              })}

              {renderAccountPicker({
              id: 'expense',
              label: 'Cuenta costo',
              value: expenseAccountCode,
              setValue: setExpenseAccountCode,
              placeholder: 'Buscar cuenta de costo',
              options: accountOptionsById.expense,
              })}

              {renderAccountPicker({
              id: 'inventory',
              label: 'Cuenta inventario',
              value: inventoryAccountCode,
              setValue: setInventoryAccountCode,
              placeholder: 'Buscar cuenta de inventario',
              options: accountOptionsById.inventory,
              })}
              {renderAccountPicker({
              id: 'purchaseTax',
              label: 'Cuenta IVA compras',
              value: purchaseTaxAccountCode,
              setValue: setPurchaseTaxAccountCode,
              placeholder: 'Buscar cuenta IVA compras',
              options: accountOptionsById.tax,
              disabled: taxProfile !== 'IVA_RESPONSABLE',
              })}
            </div>
            {(accountsQ.isFetching || taxesQ.isFetching) && (
              <p className="text-[11px] text-gray-500">Cargando catálogos fiscales…</p>
            )}
          </div>
        )}

        {/* Bandas */}
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="label">Precio mínimo</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={priceMin}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPriceMin(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Precio medio</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={priceMid}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPriceMid(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Precio máximo</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={priceMax}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPriceMax(e.target.value)}
            />
          </div>

          <div className="md:col-span-3">
            <div className="rounded-xl border bg-gray-50 p-3 flex items-center justify-between">
              <span className="text-sm text-gray-600">Precio de venta (general)</span>
              <span className="font-semibold">{money(generalPrice)}</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              Se usa el <strong>Máximo</strong> como precio general por defecto.
            </p>
          </div>

          {bandsError && (
            <div className="md:col-span-3">
              <p className="text-sm text-red-600">{bandsError}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={!canCreate || createMut.isPending}
            onClick={() => createMut.mutate()}
            title={bandsError ?? 'Crear ítem'}
          >
            {createMut.isPending ? 'Guardando…' : 'Crear ítem'}
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
