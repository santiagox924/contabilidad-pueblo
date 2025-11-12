// lib/categories.ts
// Cliente ligero para categorías de inventario (Nest backend)

import { api } from '@/lib/api'

export type TaxProfile = 'NA' | 'IVA_RESPONSABLE' | 'EXENTO' | 'EXCLUIDO'

export interface Category {
  id: number
  name: string
  parentId: number | null
  isActive?: boolean
  taxProfile?: TaxProfile
  defaultTaxId?: number | null
  incomeAccountCode?: string | null
  expenseAccountCode?: string | null
  inventoryAccountCode?: string | null
  taxAccountCode?: string | null
  purchaseTaxAccountCode?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface CreateCategoryInput {
  name: string
  taxProfile?: TaxProfile
  defaultTaxId?: number | null
  incomeAccountCode?: string | null
  expenseAccountCode?: string | null
  inventoryAccountCode?: string | null
  taxAccountCode?: string | null
  purchaseTaxAccountCode?: string | null
}

export interface UpdateCategoryInput {
  name?: string
  taxProfile?: TaxProfile
  defaultTaxId?: number | null
  incomeAccountCode?: string | null
  expenseAccountCode?: string | null
  inventoryAccountCode?: string | null
  taxAccountCode?: string | null
  purchaseTaxAccountCode?: string | null
}

type ApiEnvelope<T> = T | { data: T }

function unwrap<T>(payload: ApiEnvelope<T>): T {
  if (payload && typeof payload === 'object' && 'data' in payload && (payload as any).data !== undefined) {
    return (payload as any).data as T
  }
  return payload as T
}

function normalizeCategory(raw: any): Category {
  return {
    id: Number(raw.id ?? 0),
    name: String(raw.name ?? ''),
    parentId: raw.parentId === undefined || raw.parentId === null ? null : Number(raw.parentId),
    isActive: raw.isActive === undefined ? undefined : Boolean(raw.isActive),
    taxProfile: raw.taxProfile as TaxProfile | undefined,
    defaultTaxId: raw.defaultTaxId === undefined ? undefined : raw.defaultTaxId === null ? null : Number(raw.defaultTaxId),
    incomeAccountCode: raw.incomeAccountCode ?? null,
    expenseAccountCode: raw.expenseAccountCode ?? null,
    inventoryAccountCode: raw.inventoryAccountCode ?? null,
    taxAccountCode: raw.taxAccountCode ?? null,
    purchaseTaxAccountCode: raw.purchaseTaxAccountCode ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

function sortByName<T extends { name: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

function normalizeEmptyToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** GET /categories */
export async function listCategories(): Promise<Category[]> {
  const res = await api.get('/categories')
  const rows = unwrap<any[]>(res.data)
  return sortByName(rows.map(normalizeCategory))
}

/** GET /categories/:id */
export async function getCategory(id: number | string): Promise<Category> {
  const res = await api.get(`/categories/${id}`)
  return normalizeCategory(unwrap<any>(res.data))
}

/** POST /categories */
export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  const name = input.name?.trim()
  if (!name) throw new Error('El nombre de la categoría es obligatorio.')

  const body: Record<string, unknown> = {
    name,
  }

  if (input.taxProfile !== undefined) body.taxProfile = input.taxProfile
  if (input.defaultTaxId !== undefined) {
    body.defaultTaxId = input.defaultTaxId === null ? null : Number(input.defaultTaxId)
  }
  if (input.incomeAccountCode !== undefined) {
    body.incomeAccountCode = normalizeEmptyToNull(input.incomeAccountCode)
  }
  if (input.expenseAccountCode !== undefined) {
    body.expenseAccountCode = normalizeEmptyToNull(input.expenseAccountCode)
  }
  if (input.inventoryAccountCode !== undefined) {
    body.inventoryAccountCode = normalizeEmptyToNull(input.inventoryAccountCode)
  }
  if (input.taxAccountCode !== undefined) {
    body.taxAccountCode = normalizeEmptyToNull(input.taxAccountCode)
  }

  const res = await api.post('/categories', body)
  return normalizeCategory(unwrap<any>(res.data))
}

/** PATCH /categories/:id */
export async function updateCategory(id: number | string, input: UpdateCategoryInput): Promise<Category> {
  const body: Record<string, unknown> = {}
  if (input.name !== undefined) body.name = input.name.trim()
  if (input.taxProfile !== undefined) body.taxProfile = input.taxProfile
  if (input.defaultTaxId !== undefined) body.defaultTaxId = input.defaultTaxId === null ? null : Number(input.defaultTaxId)
  if (input.incomeAccountCode !== undefined) body.incomeAccountCode = normalizeEmptyToNull(input.incomeAccountCode)
  if (input.expenseAccountCode !== undefined) body.expenseAccountCode = normalizeEmptyToNull(input.expenseAccountCode)
  if (input.inventoryAccountCode !== undefined) body.inventoryAccountCode = normalizeEmptyToNull(input.inventoryAccountCode)
  if (input.taxAccountCode !== undefined) body.taxAccountCode = normalizeEmptyToNull(input.taxAccountCode)

  if (Object.keys(body).length === 0) throw new Error('No hay cambios para actualizar.')

  const res = await api.patch(`/categories/${id}`, body)
  return normalizeCategory(unwrap<any>(res.data))
}

/** DELETE /categories/:id */
export async function deleteCategory(id: number | string): Promise<void> {
  await api.delete(`/categories/${id}`)
}

export function filterCategories(categories: Category[], term: string): Category[] {
  const q = term.trim().toLowerCase()
  if (!q) return sortByName(categories)
  return sortByName(categories.filter((c) => c.name.toLowerCase().includes(q)))
}

export async function ensureCategoriesByNames(names: string[]): Promise<Category[]> {
  const wanted = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)))
  if (wanted.length === 0) return []

  const all = await listCategories()
  const byName = new Map(all.map((c) => [c.name.toLowerCase(), c]))

  const result: Category[] = []
  for (const name of wanted) {
    const key = name.toLowerCase()
    const found = byName.get(key)
    if (found) {
      result.push(found)
      continue
    }
    const created = await createCategory({ name })
    result.push(created)
    byName.set(key, created)
  }
  return sortByName(result)
}

export function toSelectOptions(categories: Category[]) {
  return categories.map((c) => ({ label: c.name, value: String(c.id) }))
}
