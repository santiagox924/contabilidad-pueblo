// api/src/accounting/exogena/templates/types.ts
// Tipos genéricos para definir plantillas de exógena por año y formatos DIAN

export type Primitive = string | number | null | undefined;

export type CellResolver<TCtx> = (ctx: TCtx) => Primitive;

export interface ExogenaField<TCtx> {
  /** Nombre DIAN del campo (sin espacios) */
  name: string;
  /** Descripción legible del campo */
  title: string;
  /** Tipo de dato esperado por DIAN */
  type: 'string' | 'number';
  /** Longitud máxima para strings (si aplica) */
  length?: number;
  /** Decimales para números (si aplica) */
  decimals?: number;
  /** Campo obligatorio */
  required?: boolean;
  /** Función que toma el contexto de fila y devuelve el valor */
  resolve: CellResolver<TCtx>;
}

export interface ExogenaFormat<TCtx> {
  /** Código del formato DIAN (p.ej., "1001") */
  code: string;
  /** Nombre/tema del formato */
  name: string;
  /** Descripción corta */
  description?: string;
  /** Genera el nombre de archivo sugerido (sin extensión) */
  fileName: (p: { year: number }) => string;
  /** Campos/columnas en el orden exigido por DIAN */
  fields: ExogenaField<TCtx>[];
  /**
   * Fuente de filas: recibe input interno y retorna una lista de contextos
   * (ya agregados/agrupados si el formato lo requiere).
   */
  rowSource: (input: ExogenaInput) => TCtx[];
}

export interface ExogenaYearTemplate {
  year: number;
  /** Mapa de código formato → definición de formato */
  formats: Record<string, ExogenaFormat<any>>;
}

/** Estructura mínima de tercero que suele pedirse en exógena */
export interface ThirdPartyInfo {
  id: number;
  name: string;
  /** NIT/Documento sin DV ni guiones */
  taxId?: string | null;
  /** Dígito de verificación si aplica */
  dv?: string | number | null;
  /** Código país ISO-3166-1 alpha-2 (CO, US...) */
  country?: string | null;
  /** Tipo documento DIAN (11=NIT, 13=CC, 22=CE, 31=NIT extranjero, etc.) */
  docType?: string | number | null;
}

/** Factura interna minimizada (compat con RawInvoice de tu service) */
export interface MinimalInvoice {
  id: number;
  number: string | number | null;
  issueDate: Date | string | null;
  thirdPartyId: number | null;
  thirdParty?: {
    id: number;
    name: string;
    taxId?: string | null;
    dv?: string | number | null;
  } | null;
  subtotal?: number | null;
  total?: number | null;
  taxes?: Array<{
    ratePct: number | string | null;
    amount: number | null;
    base: number | null;
  }>;
  withholdings?: Array<{ type: string; amount: number | null }>;
}

/** Entrada genérica para construir formatos exógena */
export interface ExogenaInput {
  year: number;
  /** Ventana temporal ya filtrada al año, idealmente */
  from?: Date;
  to?: Date;
  /** Orígenes internos disponibles para construir formatos */
  sales?: MinimalInvoice[];
  purchases?: MinimalInvoice[];
  /** Mapa rápido de terceros (opcional, si quieres enriquecer datos) */
  thirdParties?: Record<number, ThirdPartyInfo>;
}

/** API pública de la carpeta de plantillas */
export interface ExogenaTemplatesApi {
  listYears(): number[];
  hasYear(year: number): boolean;
  getTemplate(year: number): ExogenaYearTemplate;
  getFormat(year: number, code: string): ExogenaFormat<any> | undefined;
}
