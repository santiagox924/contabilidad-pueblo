// app/(protected)/inventory/(tabs)/categories/page.tsx
'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import SearchSelect, { type Option } from '@/components/SearchSelect'
import { listCategories, createCategory, updateCategory, deleteCategory, type Category, type CreateCategoryInput, type TaxProfile } from '@/lib/categories'
import { listAccounts, type Account } from '@/lib/accounts'
import { listTaxes, type Tax } from '@/lib/taxes'

const taxProfileOptions: Array<{ value: TaxProfile; label: string }> = [
  { value: 'IVA_RESPONSABLE', label: 'IVA responsable' },
  { value: 'EXENTO', label: 'Exento' },
  { value: 'EXCLUIDO', label: 'Excluido' },
  { value: 'NA', label: 'Sin perfil fiscal' },
]

type DraftState = {
  name: string
  taxProfile: TaxProfile
  defaultTaxId: number | ''
  incomeAccountCode: string
  expenseAccountCode: string
  inventoryAccountCode: string
  taxAccountCode: string
  purchaseTaxAccountCode?: string
}

function toDraft(category: Category): DraftState {
  const taxProfile = category.taxProfile ?? 'IVA_RESPONSABLE'
  const wantsVat = taxProfile === 'IVA_RESPONSABLE'
  return {
    name: category.name ?? '',
    taxProfile,
    defaultTaxId: wantsVat && category.defaultTaxId ? Number(category.defaultTaxId) : '',
    incomeAccountCode: category.incomeAccountCode ?? '',
    expenseAccountCode: category.expenseAccountCode ?? '',
    inventoryAccountCode: category.inventoryAccountCode ?? '',
    taxAccountCode: wantsVat ? category.taxAccountCode ?? '' : '',
    // default purchase VAT account to 240801 when category is IVA_RESPONSABLE and no explicit value
    purchaseTaxAccountCode: wantsVat ? (category.purchaseTaxAccountCode ?? '240801') : '',
  }
}

function accountLabel(code: string | null | undefined, map: Map<string, Account>): string {
  if (!code) return '—'
  const acc = map.get(code)
  if (!acc) return code
  return `${acc.code} · ${acc.name}`
}

function taxLabel(id: number | null | undefined, map: Map<number, Tax>): string {
  if (!id) return '—'
  const tax = map.get(id)
  if (!tax) return String(id)
  const rate = tax.ratePct != null ? `${Number(tax.ratePct).toFixed(2)}%` : ''
  return `${tax.code || tax.name}${rate ? ` · ${rate}` : ''}`
}

function profileLabel(value: TaxProfile | undefined): string {
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

function makeEmptyDraft(): DraftState {
  return {
    name: '',
    taxProfile: 'IVA_RESPONSABLE',
    defaultTaxId: '',
    incomeAccountCode: '',
    expenseAccountCode: '',
    inventoryAccountCode: '',
    taxAccountCode: '',
    purchaseTaxAccountCode: '240801',
  }
}

export default function CategoriesPage() {
  const qc = useQueryClient()

  const { data: categoriesData, isFetching: fetchingCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
    staleTime: 60_000,
  })

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => listAccounts(),
    staleTime: 5 * 60_000,
  })

  const { data: taxesData } = useQuery({
    queryKey: ['taxes', 'VAT'],
    queryFn: () => listTaxes({ kind: 'VAT', active: true }),
    staleTime: 5 * 60_000,
  })

  const categories = Array.isArray(categoriesData) ? categoriesData : []
  const accounts = Array.isArray(accountsData) ? accountsData : []
  const taxes = Array.isArray(taxesData) ? taxesData : []

  const accountsByCode = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts])
  const taxesById = useMemo(() => new Map(taxes.map((t) => [t.id, t])), [taxes])

  const accountOptions = useMemo<Option[]>(() => {
    const options = accounts.map((acc) => ({
      value: acc.code,
      label: `${acc.code} · ${acc.name}`,
    }))
    return [{ value: '', label: '— sin cuenta —' }, ...options]
  }, [accounts])

  // Ensure purchase VAT account shows friendly label
  const purchaseAccountOptions = useMemo<Option[]>(() => {
    return accountOptions.map((o) =>
      o.value === '240801' ? { ...o, label: `${o.value} · IVA descontable (Compras)` } : o,
    )
  }, [accountOptions])

  const taxOptions = useMemo<Option[]>(() => {
    const options = taxes.map((tax) => ({
      value: tax.id,
      label: tax.code ? `${tax.code} · ${tax.ratePct}%` : `${tax.ratePct}%`,
      sublabel: tax.name,
    }))
    return [{ value: '', label: '— sin impuesto —' }, ...options]
  }, [taxes])

  const [newDraft, setNewDraft] = useState<DraftState>(() => makeEmptyDraft())
  const [createError, setCreateError] = useState<string | null>(null)
  const [editState, setEditState] = useState<{ id: number; draft: DraftState } | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!categories.length) return
    setNewDraft((prev) => {
      if (prev.name.trim().length > 0) return prev
      if (
        prev.incomeAccountCode ||
        prev.expenseAccountCode ||
        prev.inventoryAccountCode ||
        prev.taxAccountCode ||
        prev.defaultTaxId !== ''
      ) {
        return prev
      }
      const template = toDraft(categories[0])
      return {
        ...prev,
        taxProfile: template.taxProfile,
        defaultTaxId: template.defaultTaxId,
        incomeAccountCode: template.incomeAccountCode,
        expenseAccountCode: template.expenseAccountCode,
        inventoryAccountCode: template.inventoryAccountCode,
        taxAccountCode: template.taxAccountCode,
        purchaseTaxAccountCode: template.purchaseTaxAccountCode ?? '240801',
      }
    })
  }, [categories])

  const createMut = useMutation({
    mutationFn: async (draft: DraftState) => {
      const name = draft.name.trim()
      if (!name) throw new Error('El nombre de la categoría es obligatorio.')

      const toAccountValue = (value: string) => {
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : null
      }

      const payload: CreateCategoryInput = {
        name,
        taxProfile: draft.taxProfile,
      }

      if (draft.taxProfile === 'IVA_RESPONSABLE') {
        if (draft.defaultTaxId !== '') {
          payload.defaultTaxId = Number(draft.defaultTaxId)
        }
      } else {
        payload.defaultTaxId = null
      }

      const income = toAccountValue(draft.incomeAccountCode)
      if (income !== null) payload.incomeAccountCode = income

      const expense = toAccountValue(draft.expenseAccountCode)
      if (expense !== null) payload.expenseAccountCode = expense

      const inventory = toAccountValue(draft.inventoryAccountCode)
      if (inventory !== null) payload.inventoryAccountCode = inventory

      if (draft.taxProfile === 'IVA_RESPONSABLE') {
        const taxAcc = toAccountValue(draft.taxAccountCode)
        if (taxAcc !== null) payload.taxAccountCode = taxAcc
        const purchAcc = toAccountValue(draft.purchaseTaxAccountCode ?? '')
        if (purchAcc !== null) payload.purchaseTaxAccountCode = purchAcc
      } else {
        payload.taxAccountCode = null
        payload.purchaseTaxAccountCode = null
      }

      return createCategory(payload)
    },
    onSuccess: async () => {
      setCreateError(null)
      setNewDraft(makeEmptyDraft())
      await qc.invalidateQueries({ queryKey: ['categories'], refetchType: 'active' })
    },
    onError: (err: any) => {
      const message =
        err?.response?.data?.message || err?.message || 'No se pudo crear la categoría.'
      setCreateError(Array.isArray(message) ? message.join(', ') : String(message))
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, draft }: { id: number; draft: DraftState }) => {
      const payload = {
        name: draft.name.trim(),
        taxProfile: draft.taxProfile,
        defaultTaxId:
          draft.taxProfile === 'IVA_RESPONSABLE'
            ? draft.defaultTaxId === ''
              ? null
              : Number(draft.defaultTaxId)
            : null,
        incomeAccountCode: draft.incomeAccountCode || null,
        expenseAccountCode: draft.expenseAccountCode || null,
        inventoryAccountCode: draft.inventoryAccountCode || null,
        taxAccountCode:
          draft.taxProfile === 'IVA_RESPONSABLE'
            ? draft.taxAccountCode || null
            : null,
        purchaseTaxAccountCode:
          draft.taxProfile === 'IVA_RESPONSABLE'
            ? draft.purchaseTaxAccountCode || null
            : null,
      }
      return updateCategory(id, payload)
    },
    onSuccess: async () => {
      setEditState(null)
      await qc.invalidateQueries({ queryKey: ['categories'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteCategory(id),
    onMutate: () => setDeleteError(null),
    onSuccess: async (_, id) => {
      if (editState?.id === id) setEditState(null)
      await qc.invalidateQueries({ queryKey: ['categories'] })
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message || err?.message || 'No se pudo eliminar la categoría.'
      setDeleteError(Array.isArray(message) ? message.join(', ') : String(message))
    },
  })

  const canCreate = newDraft.name.trim().length > 0 && !createMut.isPending

  const handleCreate = () => {
    if (!canCreate) return
    setCreateError(null)
    createMut.mutate(newDraft)
  }

  const handleCreateDraftChange = <K extends keyof DraftState>(
    key: K,
    value: DraftState[K],
  ) => {
    setNewDraft((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const handleCreateTaxProfileChange = (next: TaxProfile) => {
    setNewDraft((prev) => {
      const wantsVat = next === 'IVA_RESPONSABLE'
      return {
        ...prev,
        taxProfile: next,
        defaultTaxId: wantsVat ? prev.defaultTaxId : '',
        taxAccountCode: wantsVat ? prev.taxAccountCode : '',
        purchaseTaxAccountCode: wantsVat ? (prev.purchaseTaxAccountCode || '240801') : '',
      }
    })
  }

  const handleEdit = (category: Category) => {
    setEditState({ id: category.id, draft: toDraft(category) })
  }

  const handleCancelEdit = () => setEditState(null)

  const handleDraftChange = <K extends keyof DraftState>(key: K, value: DraftState[K]) => {
    setEditState((prev) =>
      prev
        ? {
            ...prev,
            draft: {
              ...prev.draft,
              [key]: value,
            },
          }
        : prev,
    )
  }

  const handleDelete = (category: Category) => {
    if (deleteMut.isPending) return
    const confirmed = window.confirm(`¿Eliminar la categoría “${category.name}”?`)
    if (!confirmed) return
    deleteMut.mutate(category.id)
  }

  const handleTaxProfileChange = (categoryId: number, next: TaxProfile) => {
    setEditState((prev) => {
      if (!prev || prev.id !== categoryId) return prev
      return {
        ...prev,
        draft: {
          ...prev.draft,
          taxProfile: next,
          defaultTaxId: next === 'IVA_RESPONSABLE' ? prev.draft.defaultTaxId : '',
          taxAccountCode: next === 'IVA_RESPONSABLE' ? prev.draft.taxAccountCode : '',
          purchaseTaxAccountCode: next === 'IVA_RESPONSABLE' ? prev.draft.purchaseTaxAccountCode ?? '' : '',
        },
      }
    })
  }

  const editingId = editState?.id ?? null
  const editing = editState?.draft
  const createWantsVat = newDraft.taxProfile === 'IVA_RESPONSABLE'

  const renderEditRow = (category: Category) => {
    if (!editing || editingId !== category.id) return null

    const wantsVat = editing.taxProfile === 'IVA_RESPONSABLE'

    return (
      <tr className="bg-gray-50">
        <td className="td" colSpan={7}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="form-control w-full">
              <span className="label-text font-medium">Nombre</span>
              <input
                className="input"
                value={editing.name}
                onChange={(e) => handleDraftChange('name', e.target.value)}
                placeholder="Nombre de la categoría"
              />
            </label>

            <label className="form-control w-full">
              <span className="label-text font-medium">Perfil fiscal</span>
              <select
                className="select"
                value={editing.taxProfile}
                onChange={(e) => handleTaxProfileChange(category.id, e.target.value as TaxProfile)}
              >
                {taxProfileOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-2">
              <span className="label-text font-medium">Cuenta de ingresos</span>
              <SearchSelect
                value={editing.incomeAccountCode}
                options={accountOptions}
                onSelect={(opt) => handleDraftChange('incomeAccountCode', opt ? String(opt.value) : '')}
                placeholder="Buscar cuenta de ingresos"
              />
            </div>

            <div className="space-y-2">
              <span className="label-text font-medium">Cuenta de costos</span>
              <SearchSelect
                value={editing.expenseAccountCode}
                options={accountOptions}
                onSelect={(opt) => handleDraftChange('expenseAccountCode', opt ? String(opt.value) : '')}
                placeholder="Buscar cuenta de costos"
              />
            </div>

            <div className="space-y-2">
              <span className="label-text font-medium">Cuenta de inventario</span>
              <SearchSelect
                value={editing.inventoryAccountCode}
                options={accountOptions}
                onSelect={(opt) => handleDraftChange('inventoryAccountCode', opt ? String(opt.value) : '')}
                placeholder="Buscar cuenta de inventario"
              />
            </div>

            <div className="space-y-2">
              <span className="label-text font-medium">Cuenta de impuestos (IVA)</span>
              <SearchSelect
                value={editing.taxAccountCode}
                options={accountOptions}
                onSelect={(opt) => handleDraftChange('taxAccountCode', opt ? String(opt.value) : '')}
                placeholder="Buscar cuenta de impuestos"
                disabled={!wantsVat}
              />
              {!wantsVat && (
                <p className="text-xs text-gray-500">Solo aplica para categorías con perfil IVA responsable.</p>
              )}
            </div>

            <div className="space-y-2">
              <span className="label-text font-medium">Cuenta IVA compras (preseleccionable)</span>
              <SearchSelect
                value={editing.purchaseTaxAccountCode ?? ''}
                options={purchaseAccountOptions}
                onSelect={(opt) => handleDraftChange('purchaseTaxAccountCode', opt ? String(opt.value) : '')}
                placeholder="Buscar cuenta IVA compras"
                disabled={!wantsVat}
              />
              {!wantsVat && (
                <p className="text-xs text-gray-500">Solo aplica para categorías con perfil IVA responsable.</p>
              )}
            </div>

            <div className="space-y-2">
              <span className="label-text font-medium">Impuesto por defecto</span>
              <SearchSelect
                value={editing.defaultTaxId === '' ? '' : Number(editing.defaultTaxId)}
                options={taxOptions}
                onSelect={(opt) => {
                  if (!opt) return
                  const val = opt.value === '' ? '' : Number(opt.value)
                  handleDraftChange('defaultTaxId', val as DraftState['defaultTaxId'])
                }}
                placeholder="Selecciona un impuesto"
                disabled={!wantsVat}
              />
              {!wantsVat && (
                <p className="text-xs text-gray-500">No aplica cuando la categoría no maneja IVA.</p>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="btn btn-primary"
              onClick={() => editing && updateMut.mutate({ id: category.id, draft: editing })}
              disabled={updateMut.isPending || !editing.name.trim()}
            >
              {updateMut.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button className="btn btn-ghost" onClick={handleCancelEdit} disabled={updateMut.isPending}>
              Cancelar
            </button>
            {updateMut.isError && (
              <span className="text-sm text-error">{(updateMut.error as Error)?.message ?? 'No se pudo guardar.'}</span>
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Categorías</h2>

      <div className="rounded-xl border p-4 space-y-3">
        <h3 className="text-base font-medium">Crear categoría</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="form-control w-full md:col-span-2">
            <span className="label-text font-medium">Nombre</span>
            <input
              className="input"
              placeholder="Nombre de la categoría…"
              value={newDraft.name}
              onChange={(e) => {
                handleCreateDraftChange('name', e.target.value)
                if (createError) setCreateError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canCreate) handleCreate()
              }}
            />
          </label>

          <label className="form-control w-full">
            <span className="label-text font-medium">Perfil fiscal</span>
            <select
              className="select"
              value={newDraft.taxProfile}
              onChange={(e) => handleCreateTaxProfileChange(e.target.value as TaxProfile)}
            >
              {taxProfileOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-2">
            <span className="label-text font-medium">Cuenta de ingresos</span>
            <SearchSelect
              value={newDraft.incomeAccountCode}
              options={accountOptions}
              onSelect={(opt) => handleCreateDraftChange('incomeAccountCode', opt ? String(opt.value) : '')}
              placeholder="Buscar cuenta de ingresos"
            />
          </div>

          <div className="space-y-2">
            <span className="label-text font-medium">Cuenta de costos</span>
            <SearchSelect
              value={newDraft.expenseAccountCode}
              options={accountOptions}
              onSelect={(opt) => handleCreateDraftChange('expenseAccountCode', opt ? String(opt.value) : '')}
              placeholder="Buscar cuenta de costos"
            />
          </div>

          <div className="space-y-2">
            <span className="label-text font-medium">Cuenta de inventario</span>
            <SearchSelect
              value={newDraft.inventoryAccountCode}
              options={accountOptions}
              onSelect={(opt) => handleCreateDraftChange('inventoryAccountCode', opt ? String(opt.value) : '')}
              placeholder="Buscar cuenta de inventario"
            />
          </div>

          <div className="space-y-2">
            <span className="label-text font-medium">Cuenta de impuestos (IVA)</span>
            <SearchSelect
              value={newDraft.taxAccountCode}
              options={accountOptions}
              onSelect={(opt) => handleCreateDraftChange('taxAccountCode', opt ? String(opt.value) : '')}
              placeholder="Buscar cuenta de impuestos"
              disabled={!createWantsVat}
            />
            {!createWantsVat && (
              <p className="text-xs text-gray-500">Solo aplica para categorías con perfil IVA responsable.</p>
            )}
          </div>

          <div className="space-y-2">
            <span className="label-text font-medium">Cuenta IVA compras (preseleccionable)</span>
            <SearchSelect
              value={newDraft.purchaseTaxAccountCode ?? ''}
              options={purchaseAccountOptions}
              onSelect={(opt) => handleCreateDraftChange('purchaseTaxAccountCode', opt ? String(opt.value) : '')}
              placeholder="Buscar cuenta IVA compras"
              disabled={!createWantsVat}
            />
            {!createWantsVat && (
              <p className="text-xs text-gray-500">Solo aplica para categorías con perfil IVA responsable.</p>
            )}
          </div>

          <div className="space-y-2">
            <span className="label-text font-medium">Impuesto por defecto</span>
            <SearchSelect
              value={newDraft.defaultTaxId === '' ? '' : Number(newDraft.defaultTaxId)}
              options={taxOptions}
              onSelect={(opt) => {
                if (!opt) return
                const val = opt.value === '' ? '' : Number(opt.value)
                handleCreateDraftChange('defaultTaxId', val as DraftState['defaultTaxId'])
              }}
              placeholder="Selecciona un impuesto"
              disabled={!createWantsVat}
            />
            {!createWantsVat && (
              <p className="text-xs text-gray-500">No aplica cuando la categoría no maneja IVA.</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            className="btn btn-primary"
            type="button"
            disabled={!canCreate}
            onClick={handleCreate}
          >
            {createMut.isPending ? 'Creando…' : 'Crear'}
          </button>
          {createMut.isPending && <span className="text-sm text-gray-500">Guardando…</span>}
          {createError && <span className="text-sm text-error">{createError}</span>}
        </div>
      </div>


      <div className={clsx('overflow-auto rounded-xl border', updateMut.isPending && 'opacity-80')}
      >
        <table className="table">
          <thead>
            <tr>
              <th className="th w-40">Nombre</th>
              <th className="th w-40">Perfil fiscal</th>
              <th className="th w-48">Cuenta de ingresos</th>
              <th className="th w-48">Cuenta de costos</th>
              <th className="th w-48">Cuenta de inventario</th>
              <th className="th w-44">Impuesto / IVA</th>
              <th className="th w-32">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {categories.map((category) => (
              <Fragment key={category.id}>
                <tr>
                  <td className="td">
                    <div className="font-medium">{category.name}</div>
                    <div className="text-xs text-gray-500">ID {category.id}</div>
                  </td>
                  <td className="td">{profileLabel(category.taxProfile)}</td>
                  <td className="td">{accountLabel(category.incomeAccountCode, accountsByCode)}</td>
                  <td className="td">{accountLabel(category.expenseAccountCode, accountsByCode)}</td>
                  <td className="td">{accountLabel(category.inventoryAccountCode, accountsByCode)}</td>
                  <td className="td">
                    <div>{taxLabel(category.defaultTaxId ?? null, taxesById)}</div>
                    <div className="text-xs text-gray-500">
                      {accountLabel(category.taxAccountCode, accountsByCode)}
                    </div>
                  </td>
                  <td className="td">
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => handleEdit(category)}
                      disabled={updateMut.isPending && editingId !== category.id}
                    >
                      Editar
                    </button>
                    <button
                      className="btn btn-sm btn-error ml-2"
                      onClick={() => handleDelete(category)}
                      disabled={deleteMut.isPending}
                    >
                      {deleteMut.isPending ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </td>
                </tr>
                {renderEditRow(category)}
              </Fragment>
            ))}
          </tbody>
        </table>
        {deleteError && <p className="px-4 py-2 text-sm text-error">{deleteError}</p>}
        {fetchingCategories && (
          <p className="px-4 py-3 text-sm text-gray-600">Cargando categorías…</p>
        )}
        {!fetchingCategories && categories.length === 0 && (
          <p className="px-4 py-3 text-sm text-gray-600">Aún no hay categorías configuradas.</p>
        )}
      </div>
    </section>
  )
}
