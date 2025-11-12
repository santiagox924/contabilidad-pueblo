// lib/bom.ts
// Alineado con backend Nest:
//  - GET    /bom/:itemId            -> obtener receta (activa)
//  - PUT    /bom/:itemId            -> upsert/guardar receta para un ítem
//  - PUT    /bom/sku/:parentSku     -> upsert/guardar receta identificado por SKU
//  - DELETE /bom/:itemId            -> desactivar receta de un ítem
//  - GET    /bom/recipes/:id/cost   -> costo unitario de una receta
//
// Nota: este módulo es tolerante a “envolturas” tipo Axios (res.data)
// y a pequeñas variaciones de nombres de campos en la API.

export interface RecipeIngredient {
  itemId: string;       // id del insumo (string para ser amigable con selects)
  quantity: number;     // cantidad requerida
  unit?: string;        // opcional (UN, KG, etc)
  wastagePct?: number;  // merma (%), opcional
  optional?: boolean;   // opcional
}

export interface RecipeData {
  name?: string;
  isActive?: boolean;
  ingredients: RecipeIngredient[];
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

let _fetcher: Fetcher = (input, init) =>
  fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

/** Permite inyectar un fetch autenticado (si lo tienes en tu proyecto). */
export function setBomFetcher(f: Fetcher) {
  _fetcher = f;
}

/** ---------- Helpers ---------- */

function unwrap<T = any>(x: any): T {
  if (x && typeof x === 'object' && 'data' in x) return (x as any).data as T;
  return x as T;
}

async function readJson<T = any>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return unwrap(JSON.parse(text));
  } catch {
    // Backend pudo responder sin JSON
    return unwrap(text) as any;
  }
}

async function safeMsg(res: Response) {
  try {
    const t = await res.text();
    return t?.slice(0, 500) ?? '';
  } catch {
    return '';
  }
}

/** Normaliza el payload de una receta del backend a RecipeData */
function normalizeRecipePayload(payload: any, parentItemId?: number): RecipeData & { id?: number; itemId?: number } {
  const p = unwrap<any>(payload) ?? {};
  // Detectar campos razonables
  const id = numberOrUndefined(p.id ?? p.recipeId ?? p.bomId);
  const itemId = numberOrUndefined(p.itemId ?? p.parentItemId ?? parentItemId);
  const name = p.name ?? p.title ?? undefined;
  const isActive = inferIsActive(p);

  // La API suele usar "components"
  const rawComponents: any[] =
    Array.isArray(p.components) ? p.components :
    Array.isArray(p.items) ? p.items :
    [];

  const ingredients: RecipeIngredient[] = rawComponents.map((c: any) => ({
    itemId: String(c.componentItemId ?? c.itemId ?? c.id ?? ''),
    quantity: numberOrZero(c.qty ?? c.quantity),
    unit: c.unit ?? c.uom ?? undefined,
    wastagePct: numberOrUndefined(c.wastePct ?? c.wastagePct),
    optional: booleanOrFalse(c.optional),
  }));

  return { id, itemId, name, isActive, ingredients };
}

function numberOrUndefined(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function numberOrZero(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function numberOrUndefinedStrict(v: any): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function booleanOrFalse(v: any): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return ['true', '1', 'yes'].includes(v.toLowerCase());
  if (typeof v === 'number') return v !== 0;
  return false;
}
function inferIsActive(p: any): boolean | undefined {
  if ('isActive' in p) return !!p.isActive;
  if ('active' in p) return !!p.active;
  return undefined;
}

/** ---------- API: GET /bom/:itemId ---------- */
export async function getRecipe(itemId: number) {
  const res = await _fetcher(`/api/bom/${itemId}`);
  if (!res.ok) throw new Error(`Error al obtener receta (${res.status})`);
  const data = await readJson(res);
  return normalizeRecipePayload(data, itemId);
}

/** ---------- API: PUT /bom/:itemId ----------
 * Mapea RecipeData (UI) -> DTO esperado por el backend.
 * NO enviamos parentItemId en el body: va en la URL.
 */
export async function saveRecipe(itemId: number, data: RecipeData) {
  const body = buildRecipePayload(data);

  const res = await _fetcher(`/api/bom/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await safeMsg(res);
    throw new Error(`Error al guardar receta (${res.status}): ${msg}`);
  }
  const payload = await readJson(res);
  // Devolver receta normalizada (por si el backend retorna el recurso)
  try {
    return normalizeRecipePayload(payload, itemId);
  } catch {
    return payload;
  }
}

/** ---------- API: DELETE /bom/:itemId ---------- */
export async function deleteRecipe(itemId: number) {
  const res = await _fetcher(`/api/bom/${itemId}`, { method: 'DELETE' });
  if (!res.ok) {
    const msg = await safeMsg(res);
    throw new Error(`Error al eliminar receta (${res.status}): ${msg}`);
  }
  // algunos backends devuelven { success: true } u objeto vacío
  const payload = await readJson(res);
  return unwrap(payload);
}

/** ---------- API: GET /bom/recipes/:id/cost ---------- */
export async function getRecipeCost(recipeId: number) {
  const res = await _fetcher(`/api/bom/recipes/${recipeId}/cost`);
  if (!res.ok) throw new Error(`Error al obtener costo (${res.status})`);
  const data = unwrap(await readJson(res)) as any;
  const val = data?.cost ?? data?.value ?? data?.amount ?? data;
  const num = Number(val);
  if (Number.isFinite(num)) return num;
  throw new Error('La respuesta de costo no contiene un número válido.');
}

/** Helpers para la UI (tablas, formularios) */
export function toIngredientRow(i: RecipeIngredient) {
  return {
    itemId: i.itemId,
    quantity: i.quantity,
    unit: i.unit ?? '',
    wastagePct: i.wastagePct ?? 0,
    optional: !!i.optional,
  };
}

function buildRecipePayload(data: RecipeData) {
  return {
    name: data.name ?? undefined,
    isActive: data.isActive ?? true,
    components: (data.ingredients ?? []).map((i) => ({
      componentItemId: Number(i.itemId),
      qty: Number(i.quantity),
      unit: i.unit ?? undefined,
      wastePct: numberOrUndefinedStrict(i.wastagePct) ?? 0,
      optional: !!i.optional,
    })),
  };
}

/** ---------- API: PUT /bom/sku/:parentSku ---------- */
export async function saveRecipeBySku(parentSku: string, data: RecipeData) {
  const body = buildRecipePayload(data);
  const res = await _fetcher(`/api/bom/sku/${encodeURIComponent(parentSku)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await safeMsg(res);
    throw new Error(`Error al guardar receta (${res.status}): ${msg}`);
  }
  const payload = await readJson(res);
  try {
    return normalizeRecipePayload(payload);
  } catch {
    return payload;
  }
}
