// api/src/accounting/exogena/templates/index.ts
// Registro y utilidades de acceso a plantillas por año

import type { ExogenaTemplatesApi, ExogenaYearTemplate } from './types';
import { Template2024 } from './2024';
import { Template2025 } from './2025';

const registry: Record<number, ExogenaYearTemplate> = {
  2024: Template2024,
  2025: Template2025,
};

export const ExogenaTemplates: ExogenaTemplatesApi = {
  listYears: () =>
    Object.keys(registry)
      .map(Number)
      .sort((a, b) => a - b),
  hasYear: (year: number) => Boolean(registry[year]),
  getTemplate: (year: number) => {
    const t = registry[year];
    if (t) return t;
    // Fallback: último disponible hacia atrás
    const years = Object.keys(registry)
      .map(Number)
      .sort((a, b) => b - a);
    for (const y of years) if (y <= year) return registry[y];
    // O el más reciente si pedían un año anterior al primer mapeado
    return registry[years[0]];
  },
  getFormat: (year: number, code: string) => {
    const tpl = registry[year] ?? ExogenaTemplates.getTemplate(year);
    return tpl.formats[code];
  },
};

// Re-exports útiles
export * from './types';
export * from './utils';
